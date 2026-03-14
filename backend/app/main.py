"""FastAPI application entry point."""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import database
from .routers import analysis, chat, upload

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(upload.router)
app.include_router(chat.router)
app.include_router(analysis.router)


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
