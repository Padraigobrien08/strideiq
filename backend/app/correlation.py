"""Correlation IDs, request logging and the last-resort 500 handler.

A plain ASGI middleware rather than ``BaseHTTPMiddleware``: the latter buffers through an
internal task, which interferes with streamed responses — and Coach streaming is coming
through here in a later milestone.
"""

import re
import time
import uuid
from contextvars import ContextVar

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.log import get_logger

REQUEST_ID_HEADER = "x-request-id"

#: Accepted inbound IDs. Anything else is replaced, never echoed: the value lands in logs
#: and response headers, so it must not be able to carry newlines or markup.
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._:-]{8,128}")

_correlation_id: ContextVar[str | None] = ContextVar("correlation_id", default=None)


def current_correlation_id() -> str:
    return _correlation_id.get() or "unknown"


def resolve_request_id(incoming: str | None) -> str:
    if incoming and _VALID_REQUEST_ID.fullmatch(incoming):
        return incoming
    return str(uuid.uuid4())


class CorrelationIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        correlation_id = resolve_request_id(Headers(scope=scope).get(REQUEST_ID_HEADER))
        token = _correlation_id.set(correlation_id)
        started = time.perf_counter()
        response_started = False
        status = 500

        async def send_with_id(message: Message) -> None:
            nonlocal response_started, status
            if message["type"] == "http.response.start":
                response_started = True
                status = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = correlation_id
            await send(message)

        logger = get_logger()
        try:
            await self.app(scope, receive, send_with_id)
        except Exception:
            logger.exception(
                "request.unhandled_error",
                extra={"fields": {"correlation_id": correlation_id, "path": scope["path"]}},
            )
            if response_started:
                raise
            # Imported here to avoid a cycle: errors.py reads the correlation ID from here.
            from app.errors import error_response

            response = error_response(
                500, "internal_error", "Internal server error", correlation_id
            )
            await response(scope, receive, send_with_id)
        finally:
            logger.info(
                "request.completed",
                extra={
                    "fields": {
                        "correlation_id": correlation_id,
                        "method": scope["method"],
                        "path": scope["path"],
                        "status": status,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    }
                },
            )
            _correlation_id.reset(token)
