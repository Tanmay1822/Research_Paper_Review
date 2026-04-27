"""Papers router: list and get user's papers."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote_plus
from urllib.request import Request, urlopen
import json
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import database, models
from app.routers.auth import get_current_user
from app.services.citation_parser import build_citation_network

router = APIRouter(prefix="/api", tags=["papers"])
UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"


def _extract_pdf_authors(paper_id: str) -> str | None:
    """Try to read author string from PDF metadata or first-page heuristic."""
    pdf_path = UPLOADS_DIR / f"{paper_id}.pdf"
    if not pdf_path.exists():
        return None
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(pdf_path))
        # 1. Try standard PDF metadata
        if reader.metadata:
            for key in ("/Author", "/author", "Author"):
                val = reader.metadata.get(key)
                if val and str(val).strip():
                    return str(val).strip()
        # 2. Heuristic: scan first-page text for "Author" or "Authors" line
        if reader.pages:
            text = reader.pages[0].extract_text() or ""
            for line in text.splitlines():
                stripped = line.strip()
                lower = stripped.lower()
                if lower.startswith("author") and len(stripped) > 8:
                    # "Authors: John Doe, Jane Smith" → return everything after the colon
                    after = stripped.split(":", 1)[-1].strip()
                    if after and len(after) > 2:
                        return after
    except Exception:
        pass
    return None


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
    reading_status: str | None
    tags: list[str]


class RelatedPaperItem(BaseModel):
    """External related-paper candidate fetched from internet metadata APIs."""

    title: str
    authors: str
    year: str | None
    venue: str | None
    doi: str | None
    url: str | None


class RelatedPapersResponse(BaseModel):
    """Response for external related-paper discovery."""

    source: str
    query: str
    papers: list[RelatedPaperItem]


def _crossref_fetch_related(title: str, authors: str | None, limit: int = 6) -> list[RelatedPaperItem]:
    """Fetch related papers from Crossref based on title and optional authors."""
    query_parts = [title.strip()]
    if authors and authors.strip():
        query_parts.append(authors.strip())
    query = " ".join(query_parts).strip()
    if not query:
        return []

    endpoint = (
        "https://api.crossref.org/works"
        f"?rows={max(1, min(limit, 10))}"
        f"&select=DOI,title,author,issued,container-title,URL,score"
        f"&query.bibliographic={quote_plus(query)}"
    )
    req = Request(
        endpoint,
        headers={
            "User-Agent": "research-paper-analysis/1.0 (related-paper-search)",
            "Accept": "application/json",
        },
    )
    with urlopen(req, timeout=12) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    items = payload.get("message", {}).get("items", [])
    results: list[RelatedPaperItem] = []
    for item in items:
        raw_title = item.get("title") or []
        title_value = raw_title[0].strip() if raw_title and isinstance(raw_title[0], str) else ""
        if not title_value:
            continue

        raw_authors = item.get("author") or []
        author_names: list[str] = []
        for a in raw_authors[:5]:
            if not isinstance(a, dict):
                continue
            given = str(a.get("given", "")).strip()
            family = str(a.get("family", "")).strip()
            name = " ".join(x for x in (given, family) if x).strip()
            if name:
                author_names.append(name)
        authors_value = ", ".join(author_names) if author_names else "Unknown"

        year = None
        issued = item.get("issued", {})
        if isinstance(issued, dict):
            parts = issued.get("date-parts", [])
            if parts and isinstance(parts, list) and parts[0] and isinstance(parts[0], list):
                first = parts[0][0] if parts[0] else None
                if first:
                    year = str(first)

        container = item.get("container-title") or []
        venue = container[0].strip() if container and isinstance(container[0], str) else None
        doi = str(item.get("DOI")).strip() if item.get("DOI") else None
        url = str(item.get("URL")).strip() if item.get("URL") else None

        results.append(
            RelatedPaperItem(
                title=title_value,
                authors=authors_value,
                year=year,
                venue=venue,
                doi=doi,
                url=url,
            )
        )
    return results


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
        if (
            paper.paper_category
            and getattr(paper.paper_category, "category", None) is not None
        ):
            raw_category = paper.paper_category.category
            category = raw_category.value if hasattr(raw_category, "value") else str(raw_category)
        raw_status = paper.status
        status = raw_status.value if hasattr(raw_status, "value") else str(raw_status)
        rs = paper.reading_status
        items.append(
            PaperListItem(
                id=str(paper.id),
                filename=paper.filename,
                title=paper.title,
                category=category,
                status=status,
                folder_id=str(paper.folder_id) if paper.folder_id else None,
                reading_status=rs.value if rs else None,
                tags=paper.tags or [],
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
    authors: str | None


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
    if (
        paper.paper_category
        and getattr(paper.paper_category, "category", None) is not None
    ):
        raw_category = paper.paper_category.category
        category = raw_category.value if hasattr(raw_category, "value") else str(raw_category)
    raw_status = paper.status
    status = raw_status.value if hasattr(raw_status, "value") else str(raw_status)
    kc = paper.knowledge_card
    return PaperDetailResponse(
        id=str(paper.id),
        filename=paper.filename,
        title=paper.title,
        category=category,
        status=status,
        folder_id=str(paper.folder_id) if paper.folder_id else None,
        core_problem=kc.core_problem if kc else None,
        methodology=kc.methodology if kc else None,
        dataset=kc.dataset if kc else None,
        results=kc.results if kc else None,
        limitations=kc.limitations if kc else None,
        authors=_extract_pdf_authors(str(paper.id)),
    )


@router.get("/papers/{paper_id}/related-online", response_model=RelatedPapersResponse)
def get_related_papers_online(
    paper_id: UUID,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> RelatedPapersResponse:
    """Find related papers from internet sources using title + author metadata."""
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(404, "Paper not found")
    if paper.user_id != current_user.id:
        raise HTTPException(403, "Access denied")

    title = (paper.title or paper.filename.rsplit(".", 1)[0]).strip()
    if not title:
        raise HTTPException(400, "Paper title is missing")

    authors = _extract_pdf_authors(str(paper.id))
    try:
        related = _crossref_fetch_related(title=title, authors=authors, limit=6)
    except Exception as exc:
        raise HTTPException(502, f"Unable to fetch related papers: {exc}") from exc

    return RelatedPapersResponse(
        source="Crossref",
        query=f"{title}{f' | {authors}' if authors else ''}",
        papers=related,
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


class ComparisonMatrixRequest(BaseModel):
    paper_ids: list[UUID] = Field(..., min_length=2, max_length=10)


class MatrixRow(BaseModel):
    id: str
    title: str | None
    filename: str
    category: str
    authors: str | None
    core_problem: str | None
    methodology: str | None
    dataset: str | None
    results: str | None
    limitations: str | None


@router.post("/papers/comparison-matrix", response_model=list[MatrixRow])
def get_comparison_matrix(
    body: ComparisonMatrixRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[MatrixRow]:
    """Return knowledge-card fields for multiple papers in one call for the matrix view."""
    rows: list[MatrixRow] = []
    for pid in body.paper_ids:
        paper = db.query(models.Paper).filter(models.Paper.id == pid).first()
        if not paper or paper.user_id != current_user.id:
            continue
        kc = paper.knowledge_card
        category = "Empirical"
        if paper.paper_category and getattr(paper.paper_category, "category", None) is not None:
            raw = paper.paper_category.category
            category = raw.value if hasattr(raw, "value") else str(raw)
        rows.append(MatrixRow(
            id=str(paper.id),
            title=paper.title,
            filename=paper.filename,
            category=category,
            authors=_extract_pdf_authors(str(paper.id)),
            core_problem=kc.core_problem if kc else None,
            methodology=kc.methodology if kc else None,
            dataset=kc.dataset if kc else None,
            results=kc.results if kc else None,
            limitations=kc.limitations if kc else None,
        ))
    return rows


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


# ── Reading Status ──────────────────────────────────────────────────────────

class ReadingStatusUpdate(BaseModel):
    reading_status: str | None = Field(None, pattern="^(to_read|reading|done)$")


@router.patch("/papers/{paper_id}/reading-status")
def update_reading_status(
    paper_id: UUID,
    body: ReadingStatusUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict[str, str | None]:
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper or paper.user_id != current_user.id:
        raise HTTPException(404, "Paper not found")
    if body.reading_status is None:
        paper.reading_status = None
    else:
        paper.reading_status = models.ReadingStatus(body.reading_status)
    db.commit()
    return {"reading_status": body.reading_status}


# ── Tags ────────────────────────────────────────────────────────────────────

class TagsUpdate(BaseModel):
    tags: list[str] = Field(default_factory=list, max_length=10)


@router.patch("/papers/{paper_id}/tags")
def update_tags(
    paper_id: UUID,
    body: TagsUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict[str, list[str]]:
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper or paper.user_id != current_user.id:
        raise HTTPException(404, "Paper not found")
    cleaned = [t.strip()[:64] for t in body.tags if t.strip()][:10]
    paper.tags = cleaned or None
    db.commit()
    return {"tags": cleaned}


# ── Semantic Search ─────────────────────────────────────────────────────────

class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=512)
    limit: int = Field(default=8, ge=1, le=20)


class SemanticSearchResult(BaseModel):
    paper_id: str
    filename: str
    title: str | None
    page_num: int
    excerpt: str


@router.post("/papers/semantic-search", response_model=list[SemanticSearchResult])
def semantic_search(
    body: SemanticSearchRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[SemanticSearchResult]:
    """Embed the query and return the most semantically relevant paper chunks."""
    import os
    from langchain_openai import OpenAIEmbeddings

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(503, "OPENAI_API_KEY not set")

    embeddings_model = OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=api_key)
    raw = embeddings_model.embed_query(body.query)
    target_dim = 1536
    query_vec = raw[:target_dim] if len(raw) >= target_dim else raw + [0.0] * (target_dim - len(raw))

    user_paper_ids = [
        p.id for p in db.query(models.Paper.id)
        .filter(models.Paper.user_id == current_user.id)
        .all()
    ]
    if not user_paper_ids:
        return []

    stmt = (
        select(models.DocumentChunk, models.Paper)
        .join(models.Paper, models.DocumentChunk.paper_id == models.Paper.id)
        .where(
            models.DocumentChunk.paper_id.in_(user_paper_ids),
            models.DocumentChunk.embedding.isnot(None),
        )
        .order_by(models.DocumentChunk.embedding.cosine_distance(query_vec))
        .limit(body.limit)
    )
    rows = db.execute(stmt).all()

    seen: set[str] = set()
    results: list[SemanticSearchResult] = []
    for chunk, paper in rows:
        key = f"{paper.id}-{chunk.page_num}"
        if key in seen:
            continue
        seen.add(key)
        results.append(SemanticSearchResult(
            paper_id=str(paper.id),
            filename=paper.filename,
            title=paper.title,
            page_num=chunk.page_num,
            excerpt=chunk.chunk_text[:300],
        ))
    return results


# ── Citation Network ─────────────────────────────────────────────────────────

class CitationNetworkRequest(BaseModel):
    paper_ids: list[UUID] = Field(..., min_length=2, max_length=20)


@router.post("/papers/citation-network")
def citation_network(
    body: CitationNetworkRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    """Extract citation relationships between the selected papers."""
    papers = db.query(models.Paper).filter(models.Paper.id.in_(body.paper_ids)).all()
    for p in papers:
        if p.user_id != current_user.id:
            raise HTTPException(403, "Access denied for one or more papers")
    return build_citation_network(db, body.paper_ids, current_user.id)
