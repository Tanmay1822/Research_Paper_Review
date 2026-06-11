"""Folders router: CRUD endpoints for workspace organization."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import database, models
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/folders", tags=["folders"])


class FolderCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class FolderRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class FolderResponse(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    papers_count: int


@router.get("", response_model=list[FolderResponse])
def list_folders(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[FolderResponse]:
    folders = (
        db.query(models.Folder)
        .filter(models.Folder.user_id == current_user.id)
        .order_by(models.Folder.created_at.asc())
        .all()
    )
    return [
        FolderResponse(
            id=str(folder.id),
            name=folder.name,
            created_at=folder.created_at.isoformat(),
            updated_at=folder.updated_at.isoformat(),
            papers_count=len(folder.papers),
        )
        for folder in folders
    ]


@router.post("", response_model=FolderResponse)
def create_folder(
    body: FolderCreateRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> FolderResponse:
    existing = (
        db.query(models.Folder)
        .filter(
            models.Folder.user_id == current_user.id,
            models.Folder.name == body.name.strip(),
        )
        .first()
    )
    if existing:
        raise HTTPException(400, "Folder with this name already exists")

    folder = models.Folder(name=body.name.strip(), user_id=current_user.id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return FolderResponse(
        id=str(folder.id),
        name=folder.name,
        created_at=folder.created_at.isoformat(),
        updated_at=folder.updated_at.isoformat(),
        papers_count=0,
    )


@router.patch("/{folder_id}", response_model=FolderResponse)
def rename_folder(
    folder_id: UUID,
    body: FolderRenameRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> FolderResponse:
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(404, "Folder not found")
    if folder.user_id != current_user.id:
        raise HTTPException(403, "Access denied")

    folder.name = body.name.strip()
    db.commit()
    db.refresh(folder)
    return FolderResponse(
        id=str(folder.id),
        name=folder.name,
        created_at=folder.created_at.isoformat(),
        updated_at=folder.updated_at.isoformat(),
        papers_count=len(folder.papers),
    )


@router.delete("/{folder_id}")
def delete_folder(
    folder_id: UUID,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict[str, str]:
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(404, "Folder not found")
    if folder.user_id != current_user.id:
        raise HTTPException(403, "Access denied")

    # Move papers to root/unassigned before deleting.
    for paper in folder.papers:
        paper.folder_id = None
    db.delete(folder)
    db.commit()
    return {"status": "ok"}
