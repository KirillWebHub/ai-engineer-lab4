"""Общая настройка тестов: быстрый Argon2 и SQLite в памяти."""

from __future__ import annotations

import os

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["DEMO_AUTH_ENABLED"] = "true"
os.environ["ALLOWED_ORIGINS"] = (
    "http://localhost:8080,http://127.0.0.1:8080,"
    "http://localhost:5173,http://127.0.0.1:5173"
)
os.environ["HASH_SCHEME"] = "argon2"
os.environ["ARGON2_TIME_COST"] = "1"
os.environ["ARGON2_MEMORY_COST"] = "8192"
os.environ["ARGON2_PARALLELISM"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.seed import seed_demo_users, seed_roles, seed_runs  # noqa: E402

ORIGIN = "http://localhost:8080"
ORIGIN_HEADERS = {"Origin": ORIGIN}
PASSWORD = "Workshop!42"


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_roles(db)
        seed_demo_users(db)
        seed_runs(db)
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture()
def second_client(client):
    """Второй клиент со своим cookie jar."""

    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def register(client: TestClient, login: str = "pilot_04", password: str = PASSWORD):
    return client.post(
        "/api/register",
        json={"login": login, "password": password},
        headers=ORIGIN_HEADERS,
    )


def login(client: TestClient, login: str = "pilot_04", password: str = PASSWORD):
    return client.post(
        "/api/auth/login",
        json={"login": login, "password": password},
        headers=ORIGIN_HEADERS,
    )


def demo(client: TestClient, profile: str = "operator_01"):
    return client.post(
        "/api/auth/demo",
        json={"profile": profile},
        headers=ORIGIN_HEADERS,
    )
