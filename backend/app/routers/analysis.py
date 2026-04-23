"""Analysis router for contradiction detection and related endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import database, models
from app.routers.auth import get_current_user
from app.services.contradiction_agent import detect_contradictions
from app.tasks.ingestion_tasks import extract_knowledge_card_task


router = APIRouter(prefix="/api", tags=["analysis"])


class ContradictionRequest(BaseModel):
    """Request body for POST /api/analyze-contradictions."""

    paper_ids: list[UUID] = Field(
        ...,
        min_length=2,
        description="List of at least 2 paper UUIDs to analyze for contradictions",
    )


class ContradictionItem(BaseModel):
    """A single contradiction between papers."""

    topic: str
    paper_A_claim: str
    paper_B_claim: str
    analysis: str


class ContradictionReportResponse(BaseModel):
    """Response body for POST /api/analyze-contradictions."""

    agreements: list[str]
    contradictions: list[ContradictionItem]


class BulkExtractRequest(BaseModel):
    paper_ids: list[UUID] = Field(..., min_length=1)


class BulkExtractResponse(BaseModel):
    task_ids: list[str]


def _ensure_papers_owned_by_user(
    db: Session, paper_ids: list[UUID], user_id
) -> None:
    """Raise 403/404 if any paper does not exist or does not belong to the user."""
    papers = db.query(models.Paper).filter(models.Paper.id.in_(paper_ids)).all()
    found = {p.id for p in papers}
    if found != set(paper_ids):
        raise HTTPException(404, "One or more papers not found")
    for p in papers:
        if p.user_id != user_id:
            raise HTTPException(403, "You do not have access to one or more papers")


@router.post("/analyze-contradictions", response_model=ContradictionReportResponse)
def analyze_contradictions(
    body: ContradictionRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> ContradictionReportResponse:
    """
    Analyze the specified papers for agreements and contradictions.

    Queries KnowledgeCards (results, methodology, core_problem), then uses
    the LLM to cross-reference claims and produce a structured report.
    """
    _ensure_papers_owned_by_user(db, body.paper_ids, current_user.id)
    try:
        report = detect_contradictions(db, body.paper_ids)
    except RuntimeError as e:
        if "OPENAI_API_KEY" in str(e):
            raise HTTPException(503, str(e)) from e
        raise HTTPException(502, f"Contradiction analysis error: {e}") from e
    except Exception as e:
        raise HTTPException(500, f"Internal error: {e}") from e

    contradictions = [
        ContradictionItem(
            topic=c.topic,
            paper_A_claim=c.paper_A_claim,
            paper_B_claim=c.paper_B_claim,
            analysis=c.analysis,
        )
        for c in report.contradictions
    ]
    return ContradictionReportResponse(
        agreements=report.agreements,
        contradictions=contradictions,
    )


@router.post("/papers/bulk-extract", response_model=BulkExtractResponse)
def bulk_extract_knowledge_cards(
    body: BulkExtractRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> BulkExtractResponse:
    """Trigger background knowledge-card extraction for multiple papers."""
    _ensure_papers_owned_by_user(db, body.paper_ids, current_user.id)
    task_ids: list[str] = []
    for paper_id in body.paper_ids:
        task = extract_knowledge_card_task.delay(
            paper_id=str(paper_id),
            user_id=str(current_user.id),
        )
        task_ids.append(task.id)
    return BulkExtractResponse(task_ids=task_ids)
