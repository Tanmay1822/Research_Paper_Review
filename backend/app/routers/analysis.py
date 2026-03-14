"""Analysis router for contradiction detection and related endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import database
from app.services.contradiction_agent import detect_contradictions


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


@router.post("/analyze-contradictions", response_model=ContradictionReportResponse)
def analyze_contradictions(
    body: ContradictionRequest,
    db: Session = Depends(database.get_db),
) -> ContradictionReportResponse:
    """
    Analyze the specified papers for agreements and contradictions.

    Queries KnowledgeCards (results, methodology, core_problem), then uses
    the LLM to cross-reference claims and produce a structured report.
    """
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
