"""StrideIQ backend service.

Reached only through the Next.js BFF (never directly from the browser). See
backend/README.md and docs/adr/0001-service-to-service-auth.md.
"""

SERVICE_NAME = "strideiq-backend"

#: Path prefix for every versioned endpoint. The browser-facing Next routes keep their
#: own paths and proxy here, so this can change without touching the UI.
API_PREFIX = "/api/v1"

#: Version of the published OpenAPI contract (``info.version``). Bump it when the
#: transport schemas change incompatibly; the generated TypeScript client follows.
CONTRACT_VERSION = "1.0.0"
