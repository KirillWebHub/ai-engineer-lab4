"""Работа со временем: в API отдаём UTC."""

from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """SQLite возвращает дату без пояса, считаем её UTC."""

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def iso_z(value: datetime) -> str:
    return as_utc(value).strftime("%Y-%m-%dT%H:%M:%SZ")
