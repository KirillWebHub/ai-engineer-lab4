"""Регистрация, вход, демовход и сессии."""

from __future__ import annotations

from uuid import UUID

from app.core.config import settings
from conftest import ORIGIN_HEADERS, PASSWORD, demo, login, register


def test_register_creates_operator_and_session(client):
    response = register(client)

    assert response.status_code == 201
    body = response.json()
    assert body["message"] == "Аккаунт создан."
    UUID(body["user"]["id"])
    assert body["user"]["login"] == "pilot_04"
    assert body["user"]["roles"] == ["operator"]
    assert body["user"]["permissions"] == ["runs:read"]

    cookie = response.headers["set-cookie"].lower()
    assert "ai_engineer_session=" in cookie
    assert "path=/api" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "max-age=" in cookie

    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["login"] == "pilot_04"
    assert me.headers["cache-control"] == "no-store"


def test_duplicate_login_is_case_insensitive(client):
    assert register(client, login="Pilot_04").status_code == 201

    response = register(client, login="pilot_04")

    assert response.status_code == 409
    assert response.json() == {
        "code": "LOGIN_TAKEN",
        "message": "Этот логин уже занят.",
        "fields": {"login": "Этот логин уже занят."},
    }


def test_weak_password_is_rejected(client):
    passwords = [
        "Short1!",     # 7 символов
        "Weakpass",    # без цифры и спецсимвола
        "weakpass1!",  # без заглавной
        "WEAKPASS1!",  # без строчной
        "Password1",   # без спецсимвола
        "Password 1",  # пробел не спецсимвол
    ]
    for password in passwords:
        response = register(client, password=password)
        assert response.status_code == 422, password
        assert "password" in response.json()["fields"]
        assert password not in response.text


def test_register_validates_body_and_extra_fields(client):
    extra = client.post(
        "/api/register",
        json={"login": "pilot_04", "password": PASSWORD, "roles": ["architect"]},
        headers=ORIGIN_HEADERS,
    )
    assert extra.status_code == 422
    assert "roles" in extra.json()["fields"]

    for bad_login in ("ab", "пилот", " pilot_04"):
        response = register(client, login=bad_login)
        assert response.status_code == 422
        assert "login" in response.json()["fields"]

    broken = client.post(
        "/api/register",
        content=b"{",
        headers={**ORIGIN_HEADERS, "Content-Type": "application/json"},
    )
    assert broken.status_code == 422
    assert "request" in broken.json()["fields"]


def test_unicode_password_is_allowed(client):
    assert register(client, login="pilot_unicode", password="Пароль12!").status_code == 201
    assert client.post("/api/auth/logout", headers=ORIGIN_HEADERS).status_code == 204
    assert login(client, login="pilot_unicode", password="Пароль12!").status_code == 200


def test_login_is_case_insensitive_and_checks_login_format(client):
    assert register(client, login="Pilot_04").status_code == 201
    assert client.post("/api/auth/logout", headers=ORIGIN_HEADERS).status_code == 204

    assert login(client, login="pilot_04").status_code == 200

    bad_format = client.post(
        "/api/auth/login",
        json={"login": "ab", "password": "x"},
        headers=ORIGIN_HEADERS,
    )
    assert bad_format.status_code == 422
    assert "login" in bad_format.json()["fields"]


def test_login_logout_and_errors(client):
    assert register(client).status_code == 201

    logout = client.post("/api/auth/logout", headers=ORIGIN_HEADERS)
    assert logout.status_code == 204
    assert logout.content == b""
    assert client.get("/api/me").status_code == 401

    again = client.post("/api/auth/logout", headers=ORIGIN_HEADERS)
    assert again.status_code == 204

    wrong = login(client, password="Wrong!pass1")
    assert wrong.status_code == 401
    assert wrong.json()["code"] == "INVALID_CREDENTIALS"

    unknown = login(client, login="nobody_01")
    assert unknown.status_code == 401
    assert unknown.json()["message"] == "Неверный логин или пароль."

    ok = login(client)
    assert ok.status_code == 200
    assert ok.json()["login"] == "pilot_04"


def test_login_requires_non_empty_password(client):
    response = client.post(
        "/api/auth/login",
        json={"login": "pilot_04", "password": ""},
        headers=ORIGIN_HEADERS,
    )
    assert response.status_code == 422
    assert "password" in response.json()["fields"]


def test_failed_login_keeps_session_and_new_login_revokes_old(client, second_client):
    assert register(client).status_code == 201
    old_token = client.cookies.get(settings.cookie_name)
    assert old_token

    assert login(client, password="Wrong!pass1").status_code == 401
    assert client.get("/api/me").status_code == 200

    assert login(client).status_code == 200
    new_token = client.cookies.get(settings.cookie_name)
    assert new_token and new_token != old_token

    second_client.cookies.set(settings.cookie_name, old_token)
    assert second_client.get("/api/me").status_code == 401


def test_session_is_required(client):
    for path in ("/api/me", "/api/runs", "/api/users"):
        response = client.get(path)
        assert response.status_code == 401
        assert response.json()["code"] == "AUTH_REQUIRED"


def test_origin_is_checked_for_mutations(client):
    missing = client.post("/api/register", json={"login": "pilot_04", "password": PASSWORD})
    assert missing.status_code == 403
    assert missing.json()["code"] == "ORIGIN_NOT_ALLOWED"

    foreign = client.post(
        "/api/register",
        json={"login": "pilot_04", "password": PASSWORD},
        headers={"Origin": "https://evil.example"},
    )
    assert foreign.status_code == 403

    assert client.get("/api/roles").status_code == 200


def test_demo_profiles_return_seeded_roles(client):
    response = demo(client, "diagnostics_01")

    assert response.status_code == 200
    assert response.json()["roles"] == ["diagnostician"]
    assert response.json()["permissions"] == ["runs:read", "runs:review"]
    assert client.get("/api/me").json()["login"] == "diagnostics_01"


def test_demo_rejects_unknown_profile_and_supports_disabling(client, monkeypatch):
    unknown = demo(client, "root_01")
    assert unknown.status_code == 422
    assert "profile" in unknown.json()["fields"]

    monkeypatch.setattr(settings, "demo_auth_enabled", False)
    disabled = demo(client, "operator_01")
    assert disabled.status_code == 404
    assert disabled.json()["code"] == "NOT_FOUND"


def test_demo_account_has_no_usable_password(client):
    response = login(client, login="operator_01", password="Demo!1234")
    assert response.status_code == 401
