"""Регистрация, вход, выход и текущий профиль."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import Identity, current_identity, demo_enabled
from app.db.session import get_db
from app.schemas.api import RegistrationOut, UserOut
from app.schemas.auth import DemoRequest, LoginRequest, RegisterRequest
from app.services import auth
from app.services.serializers import user_payload

router = APIRouter(tags=["Сессия"])


@router.post("/register", status_code=201, response_model=RegistrationOut)
def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    user = auth.register(db, request, response, body.login, body.password)
    return {"message": "Аккаунт создан.", "user": user_payload(user)}


@router.post("/auth/login", response_model=UserOut)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    user = auth.login(db, request, response, body.login, body.password)
    return user_payload(user)


@router.post(
    "/auth/demo",
    response_model=UserOut,
    dependencies=[Depends(demo_enabled)],
)
def demo(
    body: DemoRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    user = auth.demo_login(db, body.profile)
    auth.open_session(db, request, response, user)
    return user_payload(user)


@router.post("/auth/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    response = Response(status_code=204)
    auth.close_session(db, request, response)
    return response


@router.get("/me", response_model=UserOut)
def me(identity: Identity = Depends(current_identity)) -> dict[str, object]:
    return {
        "id": identity.user.id,
        "login": identity.user.login,
        "roles": identity.roles,
        "permissions": identity.permissions,
    }
