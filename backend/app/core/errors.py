"""Ошибки API в едином формате контракта."""

from __future__ import annotations

from collections.abc import Mapping


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        fields: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = dict(fields) if fields else None


def auth_required() -> ApiError:
    return ApiError(401, "AUTH_REQUIRED", "Войдите на стенд.")


def invalid_credentials() -> ApiError:
    return ApiError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль.")


def forbidden(message: str) -> ApiError:
    return ApiError(403, "FORBIDDEN", message)


def not_found(message: str = "Запрошенный объект не найден.") -> ApiError:
    return ApiError(404, "NOT_FOUND", message)


def login_taken() -> ApiError:
    message = "Этот логин уже занят."
    return ApiError(409, "LOGIN_TAKEN", message, {"login": message})


def validation_failed(
    message: str = "Проверьте поля запроса.",
    fields: Mapping[str, str] | None = None,
) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", message, fields)
