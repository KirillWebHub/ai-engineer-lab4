"""Точка входа FastAPI."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import routes_auth, routes_roles, routes_runs
from app.core.config import settings
from app.core.errors import ApiError
from app.core.logging import configure_logging, get_logger
from app.schemas.auth import LOGIN_HINT, PASSWORD_HINT
from app.services.seed import initialise_database

configure_logging(settings.log_level)
logger = get_logger("main")

FIELD_HINTS = {
    "login": LOGIN_HINT,
    "password": PASSWORD_HINT,
    "roles": "Выберите хотя бы одну роль без повторов.",
    "profile": "Выберите один из подготовленных демопрофилей.",
    "status": "Протокол можно принять или вернуть на доработку.",
    "userId": "Ожидается UUID участника.",
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialise_database()
    if settings.app_env == "production" and settings.secret_key.startswith("dev-"):
        logger.warning("insecure_secret_key")
    logger.info("application_started", extra={"environment": settings.app_env})
    yield
    logger.info("application_stopped")


app = FastAPI(
    title="AI Engineer API",
    version="0.2.0",
    description="Регистрация, сессии и ролевой доступ к протоколам испытаний.",
    lifespan=lifespan,
)


def _validation_fields(exc: RequestValidationError) -> dict[str, str]:
    fields: dict[str, str] = {}
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", ())]
        while location and location[0] in {"body", "path", "query", "header", "cookie"}:
            location = location[1:]

        error_type = str(error.get("type", ""))
        field = "request" if error_type in {"json_invalid", "model_attributes_type"} else (
            location[0] if location else "request"
        )

        if field == "request":
            message = "Передайте корректный JSON-объект."
        elif error_type == "missing":
            message = "Обязательное поле."
        elif error_type == "extra_forbidden":
            message = "Лишнее поле."
        elif error_type == "value_error":
            message = str(error.get("msg", "")).removeprefix("Value error, ")
        else:
            message = FIELD_HINTS.get(field, "Некорректное значение.")
        fields.setdefault(field, message)
    return fields


@app.exception_handler(ApiError)
async def api_error(_request: Request, exc: ApiError) -> JSONResponse:
    body: dict[str, object] = {"code": exc.code, "message": exc.message}
    if exc.fields:
        body["fields"] = exc.fields
    return JSONResponse(status_code=exc.status, content=body)


@app.exception_handler(RequestValidationError)
async def validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    fields = _validation_fields(exc)
    logger.warning(
        "validation_failed",
        extra={
            "method": request.method,
            "path": request.url.path,
            "code": "VALIDATION_ERROR",
            "fields": sorted(fields),
        },
    )
    return JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "message": "Проверьте поля запроса.",
            "fields": fields,
        },
    )


@app.exception_handler(StarletteHTTPException)
async def http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if exc.status_code in {404, 405}:
        return JSONResponse(
            status_code=404,
            content={"code": "NOT_FOUND", "message": "Запрошенный объект не найден."},
        )
    if exc.status_code == 401:
        return JSONResponse(
            status_code=401,
            content={"code": "AUTH_REQUIRED", "message": "Войдите на стенд."},
        )
    if exc.status_code == 403:
        return JSONResponse(
            status_code=403,
            content={"code": "FORBIDDEN", "message": "Недостаточно прав."},
        )
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "Не удалось выполнить запрос. Повторите попытку позже.",
        },
    )


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "internal_error",
        extra={
            "method": request.method,
            "path": request.url.path,
            "code": "INTERNAL_ERROR",
        },
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "Не удалось выполнить запрос. Повторите попытку позже.",
        },
    )


@app.middleware("http")
async def api_guard(request: Request, call_next):
    if not request.url.path.startswith("/api"):
        return await call_next(request)

    started = time.perf_counter()
    origin = request.headers.get("origin")
    if request.method in {"POST", "PATCH", "PUT"} and origin not in settings.allowed_origins:
        logger.warning(
            "origin_rejected",
            extra={
                "method": request.method,
                "path": request.url.path,
                "code": "ORIGIN_NOT_ALLOWED",
            },
        )
        response = JSONResponse(
            status_code=403,
            content={
                "code": "ORIGIN_NOT_ALLOWED",
                "message": "Источник запроса не разрешён.",
            },
        )
    else:
        response = await call_next(request)

    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    logger.info(
        "request_completed",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        },
    )
    return response


app.include_router(routes_auth.router, prefix="/api")
app.include_router(routes_roles.router, prefix="/api")
app.include_router(routes_runs.router, prefix="/api")
