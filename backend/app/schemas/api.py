"""Схемы ответов для OpenAPI; маршруты возвращают те же поля."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    id: str
    login: str
    roles: list[str]
    permissions: list[str]


class RoleOut(BaseModel):
    id: str
    label: str
    description: str
    permissions: list[str]


class RegistrationOut(BaseModel):
    message: str
    user: UserOut


class RunSummaryOut(BaseModel):
    id: str
    title: str
    robot: str
    date: str
    status: str


class RunOut(RunSummaryOut):
    model_config = ConfigDict(populate_by_name=True)

    summary: str
    reviewed_by: str | None = Field(alias="reviewedBy")
    reviewed_at: str | None = Field(alias="reviewedAt")
