from fastapi import FastAPI
from fastapi.testclient import TestClient


def _assert_envelope(body: object, code: str, correlation_id: str) -> None:
    assert isinstance(body, dict)
    assert set(body) == {"error", "code", "correlation_id"}
    assert body["code"] == code
    assert body["correlation_id"] == correlation_id
    assert isinstance(body["error"], str) and body["error"]


def test_unknown_route_uses_the_error_envelope(client: TestClient) -> None:
    res = client.get("/api/v1/nope", headers={"x-request-id": "req-not-found-01"})
    assert res.status_code == 404
    _assert_envelope(res.json(), "not_found", "req-not-found-01")
    assert res.headers["x-request-id"] == "req-not-found-01"


def test_wrong_method_uses_the_error_envelope(client: TestClient) -> None:
    res = client.post("/api/v1/health")
    assert res.status_code == 405
    _assert_envelope(res.json(), "method_not_allowed", res.headers["x-request-id"])


def test_validation_errors_use_the_envelope_without_echoing_input(app: FastAPI) -> None:
    @app.get("/api/v1/_test/validate")
    def validate(n: int) -> int:
        return n

    res = TestClient(app).get("/api/v1/_test/validate", params={"n": "athlete-secret"})
    assert res.status_code == 422
    _assert_envelope(res.json(), "validation_failed", res.headers["x-request-id"])
    assert "athlete-secret" not in res.text


def test_unhandled_exceptions_become_a_generic_500(app: FastAPI) -> None:
    @app.get("/api/v1/_test/boom")
    def boom() -> None:
        raise RuntimeError("database password is hunter2")

    client = TestClient(app, raise_server_exceptions=False)
    res = client.get("/api/v1/_test/boom", headers={"x-request-id": "req-boom-000001"})
    assert res.status_code == 500
    _assert_envelope(res.json(), "internal_error", "req-boom-000001")
    assert res.headers["x-request-id"] == "req-boom-000001"
    assert "hunter2" not in res.text
