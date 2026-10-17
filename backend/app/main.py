"""Application factory. Run with ``uvicorn --factory app.main:create_app``.

A factory rather than a module-level ``app`` so importing this module (tests, the
OpenAPI export) never reads the environment or validates settings as a side effect.
"""

from fastapi import APIRouter, FastAPI

from app import API_PREFIX, CONTRACT_VERSION
from app.api import health
from app.config import Settings, get_settings
from app.correlation import CorrelationIdMiddleware
from app.errors import register_error_handlers
from app.log import configure_logging
from app.schemas.errors import ErrorResponse


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="StrideIQ backend",
        version=CONTRACT_VERSION,
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
    )
    app.state.settings = settings

    # Every versioned route documents the shared error envelope, so the generated
    # TypeScript client carries the type the BFF parses errors into.
    v1 = APIRouter(
        prefix=API_PREFIX,
        responses={500: {"model": ErrorResponse, "description": "Unexpected server error"}},
    )
    v1.include_router(health.router)
    app.include_router(v1)

    register_error_handlers(app)
    # No CORS middleware on purpose: the browser never calls this service directly.
    app.add_middleware(CorrelationIdMiddleware)
    return app
