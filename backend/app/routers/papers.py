"""Papers router: list and get user's papers."""

from __future__ import annotations

from pathlib import Path
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import database, models
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api", tags=["papers"])
UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"


def _safe_bibtex_key(text: str) -> str:
    """Return a BibTeX-safe key fragment."""
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "", text)
    return cleaned or "paper"


def _infer_year(paper: models.Paper, kc: models.KnowledgeCard | None) -> str:
    """Infer publication year from title/filename/knowledge card text."""
    haystacks = [
        paper.title or "",
        paper.filename,
        kc.results if kc and kc.results else "",
        kc.dataset if kc and kc.dataset else "",
    ]
    for source in haystacks:
        match = re.search(r"\b(19|20)\d{2}\b", source)
        if match:
            return match.group(0)
    return "0000"


def _escape_bibtex(value: str) -> str:
    """Escape basic characters to keep BibTeX valid."""
    return value.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


class PaperListItem(BaseModel):
    """Paper summary for list response."""

    id: str
    filename: str
    title: str | None
    category: str
    status: str
    folder_id: str | None


@router.get("/papers", response_model=list[PaperListItem])
def list_papers(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
    folder_id: UUID | None = Query(default=None),
) -> list[PaperListItem]:
    """List all papers belonging to the logged-in user."""
    q = db.query(models.Paper).filter(models.Paper.user_id == current_user.id)
    if folder_id is not None:
        q = q.filter(models.Paper.folder_id == folder_id)
    papers = q.order_by(models.Paper.uploaded_at.desc()).all()
    items: list[PaperListItem] = []
    for paper in papers:
        category = "Empirical"
        if paper.paper_category:
            category = paper.paper_category.category.value
        items.append(
            PaperListItem(
                id=str(paper.id),
                filename=paper.filename,
                title=paper.title,
                category=category,
                status=paper.status.value,
                folder_id=str(paper.folder_id) if paper.folder_id else None,
            )
        )
    return items


class PaperDetailResponse(BaseModel):
    """Paper with Knowledge Card for detail view."""

    id: str
    filename: str
    title: str | None
    category: str
    status: str
    folder_id: str | None
    core_problem: str | None
    methodology: str | None
    dataset: str | None
    results: str | None
    limitations: str | None


@router.get("/papers/{paper_id}", response_model=PaperDetailResponse)
def get_paper(
    paper_id: UUID,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> PaperDetailResponse:
    """Get a paper with its Knowledge Card. Must belong to the user."""
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    if paper.user_id != current_user.id:
        raise HTTPException(403, "Access denied")
    category = "Empirical"
    if paper.paper_category:
        category = paper.paper_category.category.value
    kc = paper.knowledge_card
    return PaperDetailResponse(
        id=str(paper.id),
        filename=paper.filename,
        title=paper.title,
        category=category,
        status=paper.status.value,
        folder_id=str(paper.folder_id) if paper.folder_id else None,
        core_problem=kc.core_problem if kc else None,
        methodology=kc.methodology if kc else None,
        dataset=kc.dataset if kc else None,
        results=kc.results if kc else None,
        limitations=kc.limitations if kc else None,
    )


@router.get("/papers/{paper_id}/pdf")
def get_paper_pdf(
    paper_id: UUID,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> FileResponse:
    """Serve a paper PDF only to its owner."""
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    if paper.user_id != current_user.id:
        raise HTTPException(403, "Access denied")

    pdf_path = UPLOADS_DIR / f"{paper.id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(404, "PDF file not found")

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=paper.filename,
    )


@router.get("/papers/{paper_id}/export-bibtex")
def export_paper_bibtex(
    paper_id: UUID,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> Response:
    """Export a user's paper metadata as a BibTeX entry."""
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    if paper.user_id != current_user.id:
        raise HTTPException(403, "Access denied")

    kc = paper.knowledge_card
    title = (paper.title or paper.filename.replace(".pdf", "")).strip() or "Untitled Paper"
    authors = "Unknown Author"
    year = _infer_year(paper, kc)
    journal = "Unpublished"
    note_parts = []
    if kc and kc.core_problem:
        note_parts.append(f"Core problem: {kc.core_problem}")
    if kc and kc.methodology:
        note_parts.append(f"Methodology: {kc.methodology}")
    if kc and kc.results:
        note_parts.append(f"Results: {kc.results}")
    if kc and kc.limitations:
        note_parts.append(f"Limitations: {kc.limitations}")
    note = " | ".join(note_parts) if note_parts else "Exported from Research Assistant"

    first_author_token = _safe_bibtex_key(authors.split(" and ")[0].split(",")[0].split(" ")[0])
    title_token = _safe_bibtex_key(title.split(" ")[0])[:24]
    cite_key = f"{first_author_token}{year}{title_token}"

    bibtex = (
        f"@article{{{cite_key},\n"
        f"  title={{{_escape_bibtex(title)}}},\n"
        f"  author={{{_escape_bibtex(authors)}}},\n"
        f"  year={{{year}}},\n"
        f"  journal={{{_escape_bibtex(journal)}}},\n"
        f"  note={{{_escape_bibtex(note)}}}\n"
        f"}}\n"
    )
    bib_name = f"{paper.filename.rsplit('.', 1)[0]}.bib"
    return Response(
        content=bibtex,
        media_type="application/x-bibtex",
        headers={"Content-Disposition": f'attachment; filename="{bib_name}"'},
    )


class MovePaperRequest(BaseModel):
    folder_id: UUID | None = Field(default=None)


@router.patch("/papers/{paper_id}/move")
def move_paper(
    paper_id: UUID,
    body: MovePaperRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict[str, str]:
    """Move a paper to a folder (or root when folder_id is null)."""
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    if paper.user_id != current_user.id:
        raise HTTPException(403, "Access denied")

    if body.folder_id is not None:
        folder = db.query(models.Folder).filter(models.Folder.id == body.folder_id).first()
        if not folder or folder.user_id != current_user.id:
            raise HTTPException(404, "Folder not found")
        paper.folder_id = folder.id
    else:
        paper.folder_id = None

    db.commit()
    return {"status": "ok"}


class BulkDeleteRequest(BaseModel):
    paper_ids: list[UUID] = Field(..., min_length=1)


@router.post("/papers/bulk-delete")
def bulk_delete_papers(
    body: BulkDeleteRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict[str, int]:
    """Delete multiple papers owned by the current user."""
    papers = db.query(models.Paper).filter(models.Paper.id.in_(body.paper_ids)).all()
    found_ids = {paper.id for paper in papers}
    if found_ids != set(body.paper_ids):
        raise HTTPException(404, "One or more papers not found")
    for paper in papers:
        if paper.user_id != current_user.id:
            raise HTTPException(403, "Access denied for one or more papers")

    for paper in papers:
        db.delete(paper)
    db.commit()
    return {"deleted_count": len(papers)}
