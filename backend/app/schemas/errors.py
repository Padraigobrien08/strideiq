from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """The error envelope for every non-2xx response.

    `error` keeps the shape the UI already reads from Next routes (`{ error }`), so
    the BFF can pass a backend error through unchanged.
    """

    error: str = Field(description="Human-readable message, safe to show to the athlete.")
    code: str = Field(description="Stable machine-readable code, e.g. `not_found`.")
    correlation_id: str = Field(description="Request correlation ID, also in `x-request-id`.")
