from typing import Literal

from pydantic import BaseModel, Field

from app.config import Environment


class HealthResponse(BaseModel):
    """Liveness: the process is up and serving requests."""

    status: Literal["ok"]
    service: str
    api_version: str = Field(description="Path version this service serves, e.g. `v1`.")
    environment: Environment


class ReadinessCheck(BaseModel):
    name: str
    ok: bool
    detail: str | None = None


class ReadinessResponse(BaseModel):
    """Readiness: every dependency needed to serve traffic is available."""

    status: Literal["ready", "not_ready"]
    checks: list[ReadinessCheck]
