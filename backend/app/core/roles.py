"""Справочник ролей варианта 3."""

from __future__ import annotations

ROLES = {
    "operator": {
        "label": "Оператор",
        "description": "Читает протоколы испытаний робота.",
        "permissions": ("runs:read",),
    },
    "diagnostician": {
        "label": "Диагност",
        "description": "Читает протоколы, принимает их или возвращает на доработку.",
        "permissions": ("runs:read", "runs:review"),
    },
    "architect": {
        "label": "Архитектор",
        "description": "Проверяет протоколы и назначает роли участникам стенда.",
        "permissions": ("runs:read", "runs:review", "roles:manage"),
    },
}

PERMISSION_ORDER = ("runs:read", "runs:review", "roles:manage")


def ordered_permissions(values: set[str] | list[str]) -> list[str]:
    values = set(values)
    known = [permission for permission in PERMISSION_ORDER if permission in values]
    return known + sorted(values.difference(PERMISSION_ORDER))
