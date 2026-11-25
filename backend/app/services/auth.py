"""Регистрация, вход и серверные сессии."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

from fastapi import Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import invalid_credentials, login_taken, not_found
from app.core.logging import get_logger
from app.core.security import (
    hash_password,
    new_session_token,
    token_digest,
    verify_password,
)
from app.core.time import as_utc, utcnow
from app.models.role import Role
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.auth import DemoProfile

logger = get_logger("auth")

# Проверяем хэш и для неизвестного логина, чтобы вход не отличался по времени.
_DUMMY_HASH = hash_password("dummy-password-for-timing")


def _https(request: Request) -> bool:
    forwarded = request.headers.get("x-forwarded-proto", "")
    scheme = forwarded.split(",")[0].strip() if forwarded else request.url.scheme
    return scheme == "https"


def _revoke(db: Session, token: str | None) -> None:
    if not token:
        return
    session = db.get(UserSession, token_digest(token))
    if session is not None and session.revoked_at is None:
        session.revoked_at = utcnow()


def open_session(
    db: Session, request: Request, response: Response, user: User
) -> None:
    _revoke(db, request.cookies.get(settings.cookie_name))
    token = new_session_token()
    db.add(
        UserSession(
            token_hash=token_digest(token),
            user_id=user.id,
            expires_at=utcnow() + timedelta(seconds=settings.session_ttl_seconds),
        )
    )
    db.commit()
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=settings.session_ttl_seconds,
        path="/api",
        httponly=True,
        samesite="lax",
        secure=_https(request),
    )
    logger.info("session_opened", extra={"login": user.login, "user_id": user.id})


def close_session(db: Session, request: Request, response: Response) -> None:
    _revoke(db, request.cookies.get(settings.cookie_name))
    db.commit()
    response.delete_cookie(
        settings.cookie_name,
        path="/api",
        httponly=True,
        samesite="lax",
        secure=_https(request),
    )
    logger.info("session_closed")


def session_user(db: Session, request: Request) -> User | None:
    token = request.cookies.get(settings.cookie_name)
    if not token:
        return None
    stored = db.get(UserSession, token_digest(token))
    if stored is None or stored.revoked_at is not None:
        return None
    if as_utc(stored.expires_at) <= utcnow():
        return None
    return stored.user


def register(
    db: Session,
    request: Request,
    response: Response,
    login: str,
    password: str,
) -> User:
    user = User(
        id=str(uuid4()),
        login=login,
        login_lower=login.lower(),
        password_hash=hash_password(password),
    )
    role = db.get(Role, "operator")
    if role is None:
        raise RuntimeError("Справочник ролей не загружен")
    user.roles.append(role)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.scalar(select(User.id).where(User.login_lower == login.lower())):
            logger.warning(
                "registration_rejected",
                extra={"login": login, "code": "LOGIN_TAKEN"},
            )
            raise login_taken() from None
        raise

    db.refresh(user)
    logger.info("registration_succeeded", extra={"login": user.login, "user_id": user.id})
    open_session(db, request, response, user)
    return user


def login(db: Session, request: Request, response: Response, login: str, password: str) -> User:
    user = db.scalar(select(User).where(User.login_lower == login.lower()))
    if user is None:
        verify_password(password, _DUMMY_HASH)
        logger.warning("login_failed", extra={"login": login, "code": "INVALID_CREDENTIALS"})
        raise invalid_credentials()
    if not verify_password(password, user.password_hash):
        logger.warning("login_failed", extra={"login": login, "code": "INVALID_CREDENTIALS"})
        raise invalid_credentials()
    open_session(db, request, response, user)
    logger.info("login_succeeded", extra={"login": user.login, "user_id": user.id})
    return user


def demo_login(db: Session, profile: DemoProfile) -> User:
    user = db.scalar(select(User).where(User.login_lower == profile.value))
    if user is None:
        logger.warning("demo_profile_missing", extra={"login": profile.value})
        raise not_found("Подготовленный профиль не найден.")
    logger.info("demo_login_succeeded", extra={"login": user.login, "user_id": user.id})
    return user
