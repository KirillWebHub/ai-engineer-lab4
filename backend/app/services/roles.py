"""Матрица ролей и назначение ролей участникам."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.core.logging import get_logger
from app.models.role import Role
from app.models.user import User
from app.services.serializers import role_payload, user_payload

logger = get_logger("roles")


def list_roles(db: Session) -> list[dict[str, object]]:
    roles = db.scalars(select(Role).order_by(Role.sort_order)).all()
    return [role_payload(role) for role in roles]


def list_users(db: Session) -> list[dict[str, object]]:
    users = db.scalars(select(User).order_by(func.lower(User.login))).all()
    return [user_payload(user) for user in users]


def set_user_roles(
    db: Session, user_id: str, role_ids: list[str]
) -> dict[str, object]:
    user = db.get(User, user_id)
    if user is None:
        raise not_found("Участник не найден.")

    roles = db.scalars(
        select(Role).where(Role.id.in_(role_ids)).order_by(Role.sort_order)
    ).all()
    if len(roles) != len(role_ids):
        raise RuntimeError("Справочник ролей не синхронизирован")

    user.roles = list(roles)
    db.commit()
    logger.info(
        "roles_updated",
        extra={
            "user_id": user.id,
            "login": user.login,
            "roles": [role.id for role in user.roles],
        },
    )
    return user_payload(user)
