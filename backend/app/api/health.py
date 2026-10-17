from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app import API_PREFIX, SERVICE_NAME
from app.config import Settings
from app.schemas.health import HealthResponse, ReadinessCheck, ReadinessResponse

router = APIRouter(tags=["health"])


@router.get("/health", operation_id="getHealth", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    settings: Settings = request.app.state.settings
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        api_version=API_PREFIX.rsplit("/", 1)[-1],
        environment=settings.environment,
    )


@router.get(
    "/ready",
    operation_id="getReadiness",
    response_model=ReadinessResponse,
    responses={503: {"model": ReadinessResponse, "description": "A dependency is unavailable"}},
)
def ready() -> JSONResponse:
    # Milestone A has no dependencies beyond validated configuration, which create_app
    # already enforced. The database check joins this list when persistence moves here.
    checks = [ReadinessCheck(name="configuration", ok=True)]
    body = ReadinessResponse(
        status="ready" if all(c.ok for c in checks) else "not_ready", checks=checks
    )
    return JSONResponse(
        status_code=200 if body.status == "ready" else 503, content=body.model_dump()
    )
