"""Протоколы испытаний."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import Identity, require_permission
from app.db.session import get_db
from app.schemas.api import RunOut, RunSummaryOut
from app.schemas.auth import ReviewRequest
from app.services import runs as runs_service

router = APIRouter(tags=["Протоколы"])


@router.get("/runs", response_model=list[RunSummaryOut])
def list_runs(
    db: Session = Depends(get_db),
    _: Identity = Depends(require_permission("runs:read")),
) -> list[dict[str, object]]:
    return runs_service.list_runs(db)


@router.get("/runs/{runId}", response_model=RunOut)
def get_run(
    runId: str,
    db: Session = Depends(get_db),
    _: Identity = Depends(require_permission("runs:read")),
) -> dict[str, object]:
    return runs_service.get_run(db, runId)


@router.patch("/runs/{runId}/review", response_model=RunOut)
def review(
    runId: str,
    body: ReviewRequest,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_permission("runs:review")),
) -> dict[str, object]:
    return runs_service.review_run(
        db, runId, body.status.value, identity.user
    )
