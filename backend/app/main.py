"""FastAPI application entry point."""

import logging

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .db import database
from .routers import analysis, auth, chat, folders, papers, upload

logger = logging.getLogger(__name__)

app = FastAPI()

# CORS must be added first so it wraps all responses (including errors and OPTIONS preflight)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(chat.router)
app.include_router(papers.router)
app.include_router(folders.router)
app.include_router(analysis.router)


def _error_payload(error_code: str, user_message: str) -> dict[str, str]:
    """Standardized error response shape returned to frontend clients."""
    return {"error_code": error_code, "user_message": user_message}


def _classify_unhandled_exception(exc: Exception) -> tuple[int, str, str]:
    """Map backend exceptions to safe error code + user-friendly message."""
    msg = str(exc).lower()
    if isinstance(exc, SQLAlchemyError):
        return (
            503,
            "database_unavailable",
            "We are having trouble reaching the database. Please try again in a moment.",
        )
    if "gemini" in msg or "embedding" in msg or "api_key" in msg:
        return (
            502,
            "ai_service_error",
            "The AI service is temporarily unavailable. Please try again shortly.",
        )
    if "qa pipeline" in msg or "retrieval" in msg:
        return (
            502,
            "qa_retrieval_failed",
            "We could not complete that question right now. Please try again.",
        )
    return (
        500,
        "internal_server_error",
        "Something went wrong on our side. Please try again.",
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    """Convert raised HTTPException instances to standardized error payloads."""
    status = exc.status_code
    detail = str(exc.detail) if exc.detail is not None else ""
    if status == 400:
        code, message = "bad_request", "The request was invalid. Please check your input and try again."
    elif status == 401:
        code, message = "unauthorized", "Your session has expired. Please sign in again."
    elif status == 403:
        code, message = "forbidden", "You do not have permission to perform this action."
    elif status == 404:
        code, message = "not_found", "The requested resource was not found."
    elif status == 422:
        code, message = "validation_error", "Some required fields are missing or invalid."
    elif status == 503:
        code, message = "service_unavailable", "A required service is currently unavailable. Please try again soon."
    elif status >= 500:
        code, message = "internal_server_error", "Something went wrong on our side. Please try again."
    else:
        code, message = "request_failed", "We could not complete your request. Please try again."

    # Keep full technical detail in backend logs only.
    logger.warning("HTTPException %s: %s", status, detail)
    return JSONResponse(status_code=status, content=_error_payload(code, message))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Return standardized payload for pydantic/FastAPI validation errors."""
    logger.warning("Validation error: %s", exc.errors())
    return JSONResponse(
        status_code=422,
        content=_error_payload(
            "validation_error",
            "Some required fields are missing or invalid.",
        ),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    """Catch any uncaught error, log details, and return safe payload."""
    status, code, message = _classify_unhandled_exception(exc)
    logger.exception("Unhandled backend exception", exc_info=exc)
    return JSONResponse(status_code=status, content=_error_payload(code, message))


@app.get("/")
def read_root() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/debug/tables")
def debug_tables(db: Session = Depends(database.get_db)) -> list[str]:
    """List all public tables (for verifying migrations)."""
    result = db.execute(
        text("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    )
    return [row[0] for row in result]
