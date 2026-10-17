"""Print the OpenAPI document to stdout: ``python -m app.export_openapi``.

``scripts/api-contract.mjs`` (``npm run api:generate`` / ``api:check``) is the only
caller that writes it to disk. The output is deterministic for a given lockfile, which
is what lets CI fail on drift.
"""

import json
import sys

from app.config import Settings
from app.main import create_app


def openapi_document() -> str:
    # Explicit settings so the shell's environment cannot change the contract.
    app = create_app(Settings(environment="local", log_level="error"))
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"


def main() -> None:
    sys.stdout.write(openapi_document())


if __name__ == "__main__":
    main()
