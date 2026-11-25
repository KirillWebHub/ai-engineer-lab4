"""Матрица ролей и участники."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import Identity, require_permission
from app.db.session import get_db
from app.schemas.api import RoleOut, UserOut
from app.schemas.auth import RolesUpdateRequest
from app.services import roles as roles_service

router = APIRouter(tags=["Роли"])


@router.get("/roles", response_model=list[RoleOut])
def roles(db: Session = Depends(get_db)) -> list[dict[str, object]]:
    return roles_service.list_roles(db)


@router.get("/users", response_model=list[UserOut])
def users(
    db: Session = Depends(get_db),
    _: Identity = Depends(require_permission("roles:manage")),
) -> list[dict[str, object]]:
    return roles_service.list_users(db)


@router.put("/users/{userId}/roles", response_model=UserOut)
def update_roles(
    userId: UUID,
    body: RolesUpdateRequest,
    db: Session = Depends(get_db),
    _: Identity = Depends(require_permission("roles:manage")),
) -> dict[str, object]:
    return roles_service.set_user_roles(
        db, str(userId), [role.value for role in body.roles]
    )
