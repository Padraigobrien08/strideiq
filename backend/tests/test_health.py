import uuid

from fastapi.testclient import TestClient


def test_health_reports_service_and_contract_version(client: TestClient) -> None:
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {
        "status": "ok",
        "service": "strideiq-backend",
        "api_version": "v1",
        "environment": "test",
    }


def test_readiness_lists_its_checks(client: TestClient) -> None:
    res = client.get("/api/v1/ready")
    assert res.status_code == 200
    assert res.json() == {
        "status": "ready",
        "checks": [{"name": "configuration", "ok": True, "detail": None}],
    }


def test_generates_a_correlation_id_when_none_is_sent(client: TestClient) -> None:
    res = client.get("/api/v1/health")
    uuid.UUID(res.headers["x-request-id"])  # raises if not a UUID


def test_echoes_a_well_formed_inbound_correlation_id(client: TestClient) -> None:
    res = client.get("/api/v1/health", headers={"x-request-id": "bff-req-1234abcd"})
    assert res.headers["x-request-id"] == "bff-req-1234abcd"


def test_replaces_a_malformed_inbound_correlation_id(client: TestClient) -> None:
    for bad in ["short", "<script>alert(1)</script>", "a" * 129]:
        res = client.get("/api/v1/health", headers={"x-request-id": bad})
        assert res.headers["x-request-id"] != bad
        uuid.UUID(res.headers["x-request-id"])


def test_unversioned_paths_are_not_served(client: TestClient) -> None:
    assert client.get("/health").status_code == 404
