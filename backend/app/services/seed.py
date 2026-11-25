"""Справочные данные, демо-аккаунты и протоколы."""

from __future__ import annotations

import secrets
from datetime import date, datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.core.roles import ROLES
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.role import Role, RolePermission
from app.models.run import Run
from app.models.user import User, user_roles
from app.models.user_session import UserSession

logger = get_logger("seed")

# UUID совпадают с данными фронтенда, чтобы демо-стенд вёл себя одинаково.
DEMO_USERS = {
    "operator_01": ("11111111-1111-4111-8111-111111111111", ("operator",)),
    "diagnostics_01": ("22222222-2222-4222-8222-222222222222", ("diagnostician",)),
    "architect_01": ("33333333-3333-4333-8333-333333333333", ("architect",)),
    "student": ("44444444-4444-4444-8444-444444444444", ("operator",)),
}

DEMO_RUNS = (
    {
        "id": "AE-041",
        "title": "Реакция на курсор",
        "date": date(2026, 11, 4),
        "status": "pending",
        "summary": (
            "Робот отслеживает курсор и возвращает взгляд в центр, когда указатель "
            "покидает стенд. Проверена реакция возле полей формы."
        ),
    },
    {
        "id": "AE-040",
        "title": "Индикация на визоре",
        "date": date(2026, 11, 3),
        "status": "approved",
        "summary": (
            "На успешную регистрацию робот отвечает галочкой, на ошибку — крестиком. "
            "После каждого сигнала визор плавно возвращается к обычному выражению."
        ),
        "reviewed_by": "diagnostics_01",
        "reviewed_at": datetime(2026, 11, 3, 15, 20, tzinfo=timezone.utc),
    },
    {
        "id": "AE-039",
        "title": "Калибровка шарниров",
        "date": date(2026, 11, 3),
        "status": "rejected",
        "summary": (
            "При быстром движении руки правый шарнир выходит за пределы рабочего "
            "угла. Нужна повторная проверка после коррекции амплитуды."
        ),
        "reviewed_by": "diagnostics_01",
        "reviewed_at": datetime(2026, 11, 3, 14, 10, tzinfo=timezone.utc),
    },
)


def seed_roles(db: Session) -> None:
    for order, (role_id, data) in enumerate(ROLES.items()):
        role = db.get(Role, role_id)
        if role is None:
            role = Role(id=role_id, sort_order=order)
            db.add(role)
        role.label = data["label"]
        role.description = data["description"]
        role.sort_order = order

        wanted = set(data["permissions"])
        for link in list(role.permissions):
            if link.permission not in wanted:
                role.permissions.remove(link)
        existing = {link.permission for link in role.permissions}
        for permission in data["permissions"]:
            if permission not in existing:
                role.permissions.append(RolePermission(permission=permission))
    db.commit()


def seed_demo_users(db: Session) -> None:
    for login, (user_id, role_ids) in DEMO_USERS.items():
        if db.scalar(select(User).where(User.login_lower == login)):
            continue
        user = User(
            id=user_id,
            login=login,
            login_lower=login,
            # Демопрофили входят без пароля; хэш нужен только для схемы БД.
            password_hash=hash_password(secrets.token_urlsafe(32)),
        )
        user.roles = [db.get(Role, role_id) for role_id in role_ids]
        db.add(user)
    db.commit()


def seed_runs(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(Run)):
        return
    reviewers = {
        user.login_lower: user.id
        for user in db.scalars(
            select(User).where(User.login_lower.in_(["diagnostics_01", "architect_01"]))
        )
    }
    for item in DEMO_RUNS:
        db.add(
            Run(
                id=item["id"],
                title=item["title"],
                robot="AI Engineer",
                date=item["date"],
                status=item["status"],
                summary=item["summary"],
                reviewed_by_id=reviewers.get(item.get("reviewed_by", "")),
                reviewed_at=item.get("reviewed_at"),
            )
        )
    db.commit()


def initialise_database() -> None:
    # В Docker и при локальном запуске схему создаёт Alembic.
    if settings.app_env == "test":
        Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_roles(db)
        if settings.app_env in {"development", "test"}:
            seed_demo_users(db)
            seed_runs(db)
    logger.info("database_ready", extra={"environment": settings.app_env})


def reset_demo_data() -> None:
    """Удаляет данные, но не таблицы: миграции и их версия остаются на месте."""

    with SessionLocal() as db:
        db.execute(delete(UserSession))
        db.execute(delete(Run))
        db.execute(delete(user_roles))
        db.execute(delete(User))
        db.commit()
        seed_roles(db)
        seed_demo_users(db)
        seed_runs(db)
    logger.info("demo_data_reset")
