"""Exception handlers that render every error as an ``ErrorResponse``."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.correlation import current_correlation_id
from app.schemas.errors import ErrorResponse

_CODE_BY_STATUS = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_failed",
    429: "rate_limited",
}


def error_response(status: int, code: str, message: str, correlation_id: str) -> JSONResponse:
    body = ErrorResponse(error=message, code=code, correlation_id=correlation_id)
    return JSONResponse(status_code=status, content=body.model_dump())


async def _http_exception(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):  # registered for this type only
        raise exc
    code = _CODE_BY_STATUS.get(exc.status_code, "http_error")
    message = exc.detail if isinstance(exc.detail, str) else code.replace("_", " ")
    return error_response(exc.status_code, code, message, current_correlation_id())


async def _validation_error(_: Request, __: Exception) -> JSONResponse:
    # Field-level detail is deliberately omitted: pydantic echoes the offending input,
    # which may carry athlete data, and no caller needs it yet.
    return error_response(
        422, "validation_failed", "Request failed validation", current_correlation_id()
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, _http_exception)
    app.add_exception_handler(RequestValidationError, _validation_error)
    # Unhandled exceptions are caught in CorrelationIdMiddleware, which sits outside
    # Starlette's ExceptionMiddleware and can still attach the correlation header.
