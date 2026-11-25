"""Чтение и проверка протоколов."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.run import Run
from app.models.user import User
from app.services.serializers import run_payload, run_summary_payload

logger = get_logger("runs")


def list_runs(db: Session) -> list[dict[str, object]]:
    runs = db.scalars(select(Run).order_by(Run.date.desc(), Run.id.desc())).all()
    return [run_summary_payload(run) for run in runs]


def get_run(db: Session, run_id: str) -> dict[str, object]:
    run = db.get(Run, run_id)
    if run is None:
        raise not_found("Протокол не найден.")
    return run_payload(run)


def review_run(db: Session, run_id: str, status: str, reviewer: User) -> dict[str, object]:
    run = db.get(Run, run_id)
    if run is None:
        raise not_found("Протокол не найден.")
    if run.status == status:
        return run_payload(run)

    run.status = status
    run.reviewer = reviewer
    run.reviewed_at = utcnow()
    db.commit()
    logger.info(
        "run_reviewed",
        extra={
            "user_id": reviewer.id,
            "login": reviewer.login,
            "path": run.id,
            "status": status,
        },
    )
    return run_payload(run)
