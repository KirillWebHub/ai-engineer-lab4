"""Зависимости маршрутов: сессия и проверка прав."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import auth_required, forbidden, not_found
from app.core.roles import ordered_permissions
from app.db.session import get_db
from app.models.user import User
from app.services.auth import session_user

PERMISSION_MESSAGES = {
    "runs:review": "Для проверки протокола нужна роль Диагноста или Архитектора.",
    "roles:manage": "Для назначения ролей нужна роль Архитектора.",
}


@dataclass
class Identity:
    user: User
    roles: list[str]
    permissions: list[str]


def current_identity(
    request: Request, db: Session = Depends(get_db)
) -> Identity:
    user = session_user(db, request)
    if user is None:
        raise auth_required()
    roles = user.roles
    return Identity(
        user=user,
        roles=[role.id for role in roles],
        permissions=ordered_permissions(
            {link.permission for role in roles for link in role.permissions}
        ),
    )


def require_permission(permission: str):
    def dependency(identity: Identity = Depends(current_identity)) -> Identity:
        if permission not in identity.permissions:
            raise forbidden(
                PERMISSION_MESSAGES.get(permission, "Недостаточно прав для действия.")
            )
        return identity

    return dependency


def demo_enabled() -> None:
    if not settings.demo_available:
        raise not_found("Демовход на этом стенде выключен.")
