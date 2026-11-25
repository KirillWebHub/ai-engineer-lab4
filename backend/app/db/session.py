"""Подключение к БД и фабрика сессий."""

from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings

engine_options: dict[str, object] = {"pool_pre_ping": not settings.is_sqlite}

if settings.is_sqlite:
    engine_options["connect_args"] = {"check_same_thread": False}
    if ":memory:" in settings.database_url:
        # Одно соединение, иначе in-memory БД теряется между запросами.
        engine_options["poolclass"] = StaticPool

engine = create_engine(settings.database_url, **engine_options)

if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_foreign_keys(connection, _record) -> None:  # type: ignore[no-untyped-def]
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
