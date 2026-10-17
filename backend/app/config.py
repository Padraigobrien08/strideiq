"""Typed configuration, read from ``STRIDEIQ_BACKEND_*`` environment variables."""

from functools import lru_cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "test", "preview", "production"]
LogLevel = Literal["debug", "info", "warning", "error"]

#: Environments allowed to start in Milestone A. Service-to-service authentication is
#: not implemented yet (ADR 0001), so anything reachable over a real network refuses to
#: boot rather than serving unauthenticated traffic.
_ENVIRONMENTS_WITHOUT_SERVICE_AUTH: frozenset[str] = frozenset({"local", "test"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="STRIDEIQ_BACKEND_", frozen=True, extra="ignore")

    environment: Environment = "local"
    log_level: LogLevel = "info"

    @model_validator(mode="after")
    def _refuse_unauthenticated_remote_traffic(self) -> Self:
        if self.environment not in _ENVIRONMENTS_WITHOUT_SERVICE_AUTH:
            raise ValueError(
                f"environment={self.environment!r} requires service-to-service "
                "authentication, which is not implemented yet. See "
                "docs/adr/0001-service-to-service-auth.md."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
