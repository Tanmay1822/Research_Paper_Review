"""Chat / QA router."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import database
from app.services.qa_agent import run_qa


router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    """Request body for POST /api/chat."""

    query: str = Field(..., min_length=1, description="User question")
    paper_ids: list[UUID] = Field(..., min_length=1, description="List of paper UUIDs to query")


class Citation(BaseModel):
    """A single citation."""

    source: str
    page: int
    quote: str


class ChatResponse(BaseModel):
    """Response body for POST /api/chat."""

    answer: str
    citations: list[Citation]


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    db: Session = Depends(database.get_db),
) -> ChatResponse:
    """
    Answer a question over the specified papers using the Router + QA pipeline.

    The Router classifies intent (fact_lookup, summary_scope, complex_comparison),
    runs the appropriate retrieval route, and synthesizes a citation-backed answer.
    """
    try:
        result = run_qa(db, body.query, body.paper_ids)
    except RuntimeError as e:
        if "OPENAI_API_KEY" in str(e):
            raise HTTPException(503, str(e)) from e
        raise HTTPException(502, f"QA pipeline error: {e}") from e
    except Exception as e:
        raise HTTPException(500, f"Internal error: {e}") from e

    citations = []
    for c in result.citations:
        if not isinstance(c, dict):
            continue
        src = c.get("source") or c.get("Source")
        page = c.get("page") or c.get("Page")
        quote = c.get("quote") or c.get("Quote")
        if src is not None and page is not None and quote is not None:
            try:
                citations.append(
                    Citation(source=str(src), page=int(page), quote=str(quote))
                )
            except (TypeError, ValueError):
                pass

    return ChatResponse(answer=result.answer, citations=citations)
