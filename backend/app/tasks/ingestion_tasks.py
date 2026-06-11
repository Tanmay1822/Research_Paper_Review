"""Celery tasks for asynchronous ingestion."""

from __future__ import annotations

from pathlib import Path

from app.celery_app import celery_app
from app.services.ingestion import (
    extract_knowledge_card_for_existing_paper,
    process_pdf_ingestion,
)


@celery_app.task(name="app.tasks.process_pdf_ingestion")
def process_pdf_ingestion_task(
    pdf_path: str, filename: str, user_id: str, folder_id: str | None = None
) -> dict[str, str | int]:
    """Background worker entrypoint for PDF ingestion."""
    try:
        return process_pdf_ingestion(
            pdf_path=pdf_path,
            filename=filename,
            user_id=user_id,
            folder_id=folder_id,
        )
    finally:
        Path(pdf_path).unlink(missing_ok=True)


@celery_app.task(name="app.tasks.extract_knowledge_card")
def extract_knowledge_card_task(paper_id: str, user_id: str) -> dict[str, str]:
    """Background task to refresh knowledge card/category for an existing paper."""
    return extract_knowledge_card_for_existing_paper(paper_id=paper_id, user_id=user_id)
