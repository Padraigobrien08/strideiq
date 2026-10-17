"""Structured JSON logging.

Mirrors ``lib/observability/logger.ts`` on the Next side — one JSON line per event with
``level``, ``time`` and ``event`` — so both halves of a request can be searched with the
same query, joined on ``correlation_id``.
"""

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

LOGGER_NAME = "strideiq"


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname.lower(),
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "event": record.getMessage(),
        }
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            payload.update(fields)
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str) -> None:
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(level.upper())
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    logger.propagate = False


def get_logger() -> logging.Logger:
    return logging.getLogger(LOGGER_NAME)
