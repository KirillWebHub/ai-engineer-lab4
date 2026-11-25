"""Протоколы и проверка прав на действия."""

from __future__ import annotations

from conftest import ORIGIN_HEADERS, demo


def test_operator_can_read_but_not_review_or_manage(client):
    assert demo(client, "operator_01").status_code == 200

    runs = client.get("/api/runs")
    assert runs.status_code == 200
    items = runs.json()
    assert [item["id"] for item in items] == ["AE-041", "AE-040", "AE-039"]
    assert set(items[0]) == {"id", "title", "robot", "date", "status"}

    run = client.get("/api/runs/AE-041").json()
    assert run["status"] == "pending"
    assert run["reviewedBy"] is None
    assert run["reviewedAt"] is None

    review = client.patch(
        "/api/runs/AE-041/review",
        json={"status": "approved"},
        headers=ORIGIN_HEADERS,
    )
    assert review.status_code == 403
    assert review.json()["code"] == "FORBIDDEN"

    users = client.get("/api/users")
    assert users.status_code == 403


def test_diagnostician_review_keeps_decision_on_repeat(client):
    assert demo(client, "diagnostics_01").status_code == 200

    first = client.patch(
        "/api/runs/AE-041/review",
        json={"status": "approved"},
        headers=ORIGIN_HEADERS,
    )
    assert first.status_code == 200
    assert first.json()["status"] == "approved"
    assert first.json()["reviewedBy"] == "diagnostics_01"
    assert first.json()["reviewedAt"].endswith("Z")

    repeated = client.patch(
        "/api/runs/AE-041/review",
        json={"status": "approved"},
        headers=ORIGIN_HEADERS,
    )
    assert repeated.json()["reviewedAt"] == first.json()["reviewedAt"]

    changed = client.patch(
        "/api/runs/AE-041/review",
        json={"status": "rejected"},
        headers=ORIGIN_HEADERS,
    )
    assert changed.status_code == 200
    assert changed.json()["status"] == "rejected"
    assert changed.json()["reviewedAt"] >= first.json()["reviewedAt"]


def test_architect_can_review(client):
    assert demo(client, "architect_01").status_code == 200
    response = client.patch(
        "/api/runs/AE-039/review",
        json={"status": "approved"},
        headers=ORIGIN_HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["reviewedBy"] == "architect_01"


def test_review_validation_and_missing_run(client):
    assert demo(client, "diagnostics_01").status_code == 200

    pending = client.patch(
        "/api/runs/AE-041/review",
        json={"status": "pending"},
        headers=ORIGIN_HEADERS,
    )
    assert pending.status_code == 422
    assert "status" in pending.json()["fields"]

    extra = client.patch(
        "/api/runs/AE-041/review",
        json={"status": "approved", "reviewedBy": "hacker"},
        headers=ORIGIN_HEADERS,
    )
    assert extra.status_code == 422

    missing = client.patch(
        "/api/runs/AE-999/review",
        json={"status": "approved"},
        headers=ORIGIN_HEADERS,
    )
    assert missing.status_code == 404
    assert missing.json()["code"] == "NOT_FOUND"

    assert client.get("/api/runs/AE-999").status_code == 404


def test_runs_are_sorted_by_date_then_id(client):
    assert demo(client, "operator_01").status_code == 200
    items = client.get("/api/runs").json()
    pairs = [(item["date"], item["id"]) for item in items]
    assert pairs == sorted(pairs, reverse=True)
    assert items[1]["date"] == items[2]["date"]
    assert items[1]["id"] > items[2]["id"]
