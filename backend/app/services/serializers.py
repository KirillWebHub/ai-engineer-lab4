"""Представление объектов в JSON контракта."""

from __future__ import annotations

from app.core.roles import ordered_permissions
from app.core.time import iso_z
from app.models.role import Role
from app.models.run import Run
from app.models.user import User


def user_payload(user: User) -> dict[str, object]:
    roles = user.roles
    permissions = ordered_permissions(
        {link.permission for role in roles for link in role.permissions}
    )
    return {
        "id": user.id,
        "login": user.login,
        "roles": [role.id for role in roles],
        "permissions": permissions,
    }


def role_payload(role: Role) -> dict[str, object]:
    return {
        "id": role.id,
        "label": role.label,
        "description": role.description,
        "permissions": ordered_permissions(
            {link.permission for link in role.permissions}
        ),
    }


def run_summary_payload(run: Run) -> dict[str, object]:
    return {
        "id": run.id,
        "title": run.title,
        "robot": run.robot,
        "date": run.date.isoformat(),
        "status": run.status,
    }


def run_payload(run: Run) -> dict[str, object]:
    payload = run_summary_payload(run)
    payload["summary"] = run.summary
    payload["reviewedBy"] = run.reviewer.login if run.reviewer else None
    payload["reviewedAt"] = iso_z(run.reviewed_at) if run.reviewed_at else None
    return payload
