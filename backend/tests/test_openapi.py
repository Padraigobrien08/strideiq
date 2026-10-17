"""Properties of the exported contract.

Drift against the committed copy (contracts/openapi.json) is checked by
``npm run api:check``, which also regenerates the TypeScript client; these tests pin the
properties that make the document safe to generate from.
"""

import json

import pytest

from app.export_openapi import openapi_document


def test_export_is_deterministic() -> None:
    assert openapi_document() == openapi_document()


def test_export_ignores_the_shell_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    baseline = openapi_document()
    monkeypatch.setenv("STRIDEIQ_BACKEND_ENVIRONMENT", "test")
    monkeypatch.setenv("STRIDEIQ_BACKEND_LOG_LEVEL", "debug")
    assert openapi_document() == baseline


def test_every_path_is_versioned() -> None:
    doc = json.loads(openapi_document())
    assert doc["paths"]
    assert all(path.startswith("/api/v1/") for path in doc["paths"])


def test_every_operation_has_a_stable_id_and_documents_the_error_envelope() -> None:
    doc = json.loads(openapi_document())
    for path, item in doc["paths"].items():
        for method, op in item.items():
            assert op.get("operationId"), f"{method.upper()} {path} has no operationId"
            assert op["responses"]["500"]["content"]["application/json"]["schema"] == {
                "$ref": "#/components/schemas/ErrorResponse"
            }
    assert set(doc["components"]["schemas"]["ErrorResponse"]["required"]) == {
        "error",
        "code",
        "correlation_id",
    }
