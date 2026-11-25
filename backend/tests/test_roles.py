"""Матрица ролей, участники и назначение ролей."""

from __future__ import annotations

from conftest import ORIGIN_HEADERS, demo


def test_role_matrix_is_public(client):
    response = client.get("/api/roles")

    assert response.status_code == 200
    roles = response.json()
    assert [role["id"] for role in roles] == ["operator", "diagnostician", "architect"]
    assert roles[0]["permissions"] == ["runs:read"]
    assert roles[1]["permissions"] == ["runs:read", "runs:review"]
    assert roles[2]["permissions"] == ["runs:read", "runs:review", "roles:manage"]
    assert all(role["label"] and role["description"] for role in roles)


def test_only_architect_sees_participants(client):
    assert demo(client, "operator_01").status_code == 200
    assert client.get("/api/users").status_code == 403

    assert demo(client, "diagnostics_01").status_code == 200
    assert client.get("/api/users").status_code == 403

    assert demo(client, "architect_01").status_code == 200
    response = client.get("/api/users")
    assert response.status_code == 200
    logins = [user["login"] for user in response.json()]
    assert logins == sorted(logins, key=str.lower)
    assert logins == ["architect_01", "diagnostics_01", "operator_01", "student"]


def test_new_roles_apply_to_open_session(client, second_client):
    assert demo(second_client, "student").status_code == 200
    assert second_client.get("/api/me").json()["roles"] == ["operator"]

    assert demo(client, "architect_01").status_code == 200
    users = client.get("/api/users").json()
    student = next(user for user in users if user["login"] == "student")

    response = client.put(
        f"/api/users/{student['id']}/roles",
        json={"roles": ["operator", "diagnostician"]},
        headers=ORIGIN_HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["roles"] == ["operator", "diagnostician"]
    assert response.json()["permissions"] == ["runs:read", "runs:review"]

    fresh = second_client.get("/api/me").json()
    assert fresh["permissions"] == ["runs:read", "runs:review"]

    review = second_client.patch(
        "/api/runs/AE-041/review",
        json={"status": "approved"},
        headers=ORIGIN_HEADERS,
    )
    assert review.status_code == 200
    assert review.json()["reviewedBy"] == "student"

    # Повторный демовход возвращает уже сохранённые роли.
    repeat_demo = demo(second_client, "student")
    assert repeat_demo.status_code == 200
    assert repeat_demo.json()["roles"] == ["operator", "diagnostician"]
    assert second_client.get("/api/me").json()["permissions"] == [
        "runs:read",
        "runs:review",
    ]

    again = client.put(
        f"/api/users/{student['id']}/roles",
        json={"roles": ["operator", "diagnostician"]},
        headers=ORIGIN_HEADERS,
    )
    assert again.status_code == 200
    assert again.json() == response.json()


def test_architect_can_remove_own_role(client):
    me = demo(client, "architect_01").json()

    response = client.put(
        f"/api/users/{me['id']}/roles",
        json={"roles": ["operator"]},
        headers=ORIGIN_HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["permissions"] == ["runs:read"]

    current = client.get("/api/me").json()
    assert current["roles"] == ["operator"]
    assert "roles:manage" not in current["permissions"]
    assert client.get("/api/users").status_code == 403


def test_role_assignment_validation(client):
    assert demo(client, "architect_01").status_code == 200
    users = client.get("/api/users").json()
    student = next(user for user in users if user["login"] == "student")
    url = f"/api/users/{student['id']}/roles"

    for payload in (
        {"roles": []},
        {"roles": ["superuser"]},
        {"roles": ["operator", "operator"]},
        {"roles": ["operator"], "extra": True},
    ):
        response = client.put(url, json=payload, headers=ORIGIN_HEADERS)
        assert response.status_code == 422, payload

    bad_uuid = client.put(
        "/api/users/not-a-uuid/roles",
        json={"roles": ["operator"]},
        headers=ORIGIN_HEADERS,
    )
    assert bad_uuid.status_code == 422
    assert "userId" in bad_uuid.json()["fields"]

    missing = client.put(
        "/api/users/11111111-1111-4111-8111-111111111119/roles",
        json={"roles": ["operator"]},
        headers=ORIGIN_HEADERS,
    )
    assert missing.status_code == 404

    no_origin = client.put(url, json={"roles": ["operator"]})
    assert no_origin.status_code == 403
    assert no_origin.json()["code"] == "ORIGIN_NOT_ALLOWED"
