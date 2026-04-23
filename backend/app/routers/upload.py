"""PDF upload router with asynchronous ingestion queue."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from uuid import UUID

logger = logging.getLogger(__name__)

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.db import database, models
from app.routers.auth import get_current_user
from app.tasks.ingestion_tasks import process_pdf_ingestion_task

router = APIRouter(prefix="/api", tags=["upload"])

STAGING_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "staging"
STAGING_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_pdf(
    file: UploadFile,
    folder_id: str | None = Form(default=None),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    """Stage a PDF and queue asynchronous ingestion."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    # Save to shared staging location that the Celery worker can access.
    safe_name = f"{uuid.uuid4().hex}_{file.filename}"
    staged_path = STAGING_DIR / safe_name

    try:
        contents = await file.read()
        staged_path.write_bytes(contents)
    except Exception as e:
        raise HTTPException(500, f"Failed to save file: {e}") from e

    try:
        target_folder_id: str | None = None
        if folder_id:
            try:
                folder_uuid = UUID(folder_id)
            except ValueError as exc:
                raise HTTPException(400, "Invalid folder_id") from exc
            folder = db.query(models.Folder).filter(models.Folder.id == folder_uuid).first()
            if not folder or folder.user_id != current_user.id:
                raise HTTPException(404, "Folder not found")
            target_folder_id = str(folder.id)

        task = process_pdf_ingestion_task.delay(
            pdf_path=str(staged_path),
            filename=file.filename,
            user_id=str(current_user.id),
            folder_id=target_folder_id,
        )
    except Exception as exc:
        staged_path.unlink(missing_ok=True)
        logger.exception("Failed to enqueue upload task")
        raise HTTPException(500, f"Failed to queue upload: {exc}") from exc

    return {"task_id": task.id, "status": "queued"}


@router.get("/upload/status/{task_id}")
def upload_status(
    task_id: str,
    current_user: models.User = Depends(get_current_user),
) -> dict:
    """Return current status of an asynchronous ingestion task."""
    _ = current_user  # enforce authentication
    task_result = AsyncResult(task_id, app=celery_app)
    state = task_result.state

    if state in {"PENDING", "RECEIVED", "STARTED", "RETRY"}:
        return {"task_id": task_id, "status": "processing"}
    if state == "SUCCESS":
        payload = task_result.result if isinstance(task_result.result, dict) else {}
        return {"task_id": task_id, "status": "completed", "result": payload}

    logger.error("Upload task %s failed: %s", task_id, task_result.result)
    return {
        "task_id": task_id,
        "status": "failed",
        "error_code": "upload_processing_failed",
        "user_message": "File processing failed, please try again.",
    }
