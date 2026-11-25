"""Компактные JSON-логи приложения."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

EXTRA_FIELDS = (
    "method",
    "path",
    "status",
    "duration_ms",
    "login",
    "user_id",
    "roles",
    "code",
    "fields",
    "environment",
)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "time": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "event": record.getMessage(),
        }
        for field in EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                entry[field] = value
        if record.exc_info:
            entry["traceback"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


def configure_logging(level: str) -> None:
    logger = logging.getLogger("app")
    logger.setLevel(getattr(logging, level, logging.INFO))
    logger.propagate = False
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"app.{name}")
