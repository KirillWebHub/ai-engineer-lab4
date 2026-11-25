"""Схемы запросов к API."""

from __future__ import annotations

import unicodedata
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator

LOGIN_PATTERN = r"^[A-Za-z0-9._-]{3,32}$"
LOGIN_HINT = "От 3 до 32 символов: латиница, цифры, точка, дефис или подчёркивание."
PASSWORD_HINT = "От 8 символов: заглавная и строчная буквы, цифра и спецсимвол."


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    login: str = Field(min_length=3, max_length=32, pattern=LOGIN_PATTERN)
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        has_upper = any(char.isupper() for char in value)
        has_lower = any(char.islower() for char in value)
        has_digit = any(char in "0123456789" for char in value)
        has_special = any(unicodedata.category(char)[0] in "PS" for char in value)
        if not (has_upper and has_lower and has_digit and has_special):
            raise ValueError(PASSWORD_HINT)
        return value


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    login: str = Field(min_length=3, max_length=32, pattern=LOGIN_PATTERN)
    password: str

    @field_validator("password")
    @classmethod
    def password_is_not_empty(cls, value: str) -> str:
        if not value:
            raise ValueError("Введите пароль.")
        return value


class DemoProfile(str, Enum):
    operator_01 = "operator_01"
    diagnostics_01 = "diagnostics_01"
    architect_01 = "architect_01"
    student = "student"


class DemoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile: DemoProfile


class RoleId(str, Enum):
    operator = "operator"
    diagnostician = "diagnostician"
    architect = "architect"


class RolesUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    roles: list[RoleId] = Field(min_length=1)

    @field_validator("roles")
    @classmethod
    def roles_are_unique(cls, value: list[RoleId]) -> list[RoleId]:
        if len(set(value)) != len(value):
            raise ValueError("Выберите хотя бы одну роль без повторов.")
        return value


class ReviewStatus(str, Enum):
    approved = "approved"
    rejected = "rejected"


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ReviewStatus
