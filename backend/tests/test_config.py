import pytest
from pydantic import ValidationError

from app.config import Settings


def test_defaults_to_local(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STRIDEIQ_BACKEND_ENVIRONMENT", raising=False)
    assert Settings().environment == "local"


def test_reads_prefixed_environment_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STRIDEIQ_BACKEND_ENVIRONMENT", "test")
    monkeypatch.setenv("STRIDEIQ_BACKEND_LOG_LEVEL", "debug")
    settings = Settings()
    assert (settings.environment, settings.log_level) == ("test", "debug")


@pytest.mark.parametrize("environment", ["preview", "production"])
def test_refuses_to_start_where_service_auth_would_be_required(environment: str) -> None:
    # ADR 0001: no unauthenticated service is allowed onto a real network.
    with pytest.raises(ValidationError, match="service-to-service"):
        Settings(environment=environment)


def test_rejects_unknown_environments() -> None:
    with pytest.raises(ValidationError):
        Settings(environment="staging")
