"""Конфигурация приложения из переменных окружения."""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPOSITORY_DIR = BACKEND_DIR.parent

try:
    from dotenv import load_dotenv
except ImportError:  # .env нужен только для локального запуска
    load_dotenv = None

if load_dotenv is not None:
    for env_file in (REPOSITORY_DIR / ".env", BACKEND_DIR / ".env"):
        if env_file.is_file():
            load_dotenv(env_file, override=False)


def _text(name: str, default: str) -> str:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else default


def _flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _number(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip() or default)
    except ValueError:
        return default


class Settings:
    def __init__(self) -> None:
        self.app_env = _text("APP_ENV", "development").lower()
        self.database_url = _text(
            "DATABASE_URL", "sqlite+pysqlite:///./ai_engineer.db"
        )

        self.hash_scheme = _text("HASH_SCHEME", "argon2").lower()
        self.secret_key = _text("SECRET_KEY", "dev-secret-change-before-deploy")
        self.argon2_time_cost = _number("ARGON2_TIME_COST", 3)
        self.argon2_memory_cost = _number("ARGON2_MEMORY_COST", 65536)
        self.argon2_parallelism = _number("ARGON2_PARALLELISM", 2)

        self.demo_auth_enabled = _flag("DEMO_AUTH_ENABLED", False)
        self.session_ttl_seconds = _number("SESSION_TTL_SECONDS", 8 * 60 * 60)
        self.cookie_name = _text("SESSION_COOKIE_NAME", "ai_engineer_session")

        origins = _text(
            "ALLOWED_ORIGINS",
            "http://localhost:8080,http://127.0.0.1:8080,"
            "http://localhost:5173,http://127.0.0.1:5173,"
            "http://localhost:8000,http://127.0.0.1:8000",
        )
        self.allowed_origins = frozenset(
            origin.strip().rstrip("/") for origin in origins.split(",") if origin.strip()
        )

        self.log_level = _text("LOG_LEVEL", "INFO").upper()

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def demo_available(self) -> bool:
        return self.app_env in {"development", "test"} and self.demo_auth_enabled


settings = Settings()
