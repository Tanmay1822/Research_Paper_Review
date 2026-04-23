"""Chat / QA router with persistent history."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import database, models
from app.routers.auth import get_current_user
from app.services.qa_agent import run_qa


router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    """Request body for POST /api/chat."""

    query: str = Field(..., min_length=1, description="User question")
    paper_ids: list[UUID] = Field(..., min_length=1, description="List of paper UUIDs to query")
    thread_id: UUID | None = Field(None, description="Optional existing thread to continue")


class Citation(BaseModel):
    """A single citation."""

    source: str
    page: int
    quote: str


class ChatResponse(BaseModel):
    """Response body for POST /api/chat."""

    answer: str
    citations: list[Citation]
    thread_id: str


def _ensure_papers_owned_by_user(
    db: Session, paper_ids: list[UUID], user_id: UUID
) -> None:
    """Raise 403/404 if any paper does not exist or does not belong to the user."""
    papers = db.query(models.Paper).filter(models.Paper.id.in_(paper_ids)).all()
    found = {p.id for p in papers}
    if found != set(paper_ids):
        raise HTTPException(404, "One or more papers not found")
    for p in papers:
        if p.user_id != user_id:
            raise HTTPException(403, "You do not have access to one or more papers")


def _ensure_thread_owned_by_user(
    db: Session, thread_id: UUID, user_id: UUID
) -> models.ChatThread:
    """Fetch thread and ensure it belongs to user. Raise 403/404 otherwise."""
    thread = db.query(models.ChatThread).filter(models.ChatThread.id == thread_id).first()
    if not thread:
        raise HTTPException(404, "Thread not found")
    if thread.user_id != user_id:
        raise HTTPException(403, "You do not have access to this thread")
    return thread


def _build_chat_history(messages: list[models.ChatMessage]) -> list[tuple[str, str]]:
    """Extract (query, answer) pairs from messages for LLM context."""
    pairs: list[tuple[str, str]] = []
    i = 0
    while i < len(messages):
        if messages[i].role == "user" and i + 1 < len(messages) and messages[i + 1].role == "assistant":
            pairs.append((messages[i].content, messages[i + 1].content))
            i += 2
        else:
            i += 1
    return pairs


def _generate_title(query: str) -> str:
    """Auto-generate thread title from first user message."""
    return (query[:80] + "…") if len(query) > 80 else query


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
) -> ChatResponse:
    """
    Answer a question over the specified papers. Optionally continue a thread.
    Saves messages and returns thread_id.
    """
    _ensure_papers_owned_by_user(db, body.paper_ids, current_user.id)

    if body.thread_id:
        thread = _ensure_thread_owned_by_user(db, body.thread_id, current_user.id)
        chat_history = _build_chat_history(thread.messages)
    else:
        thread = models.ChatThread(
            user_id=current_user.id,
            title=_generate_title(body.query),
        )
        db.add(thread)
        db.flush()
        for pid in body.paper_ids:
            link = models.ThreadPaperLink(thread_id=thread.id, paper_id=pid)
            db.add(link)
        chat_history = []

    try:
        result = run_qa(db, body.query, body.paper_ids, chat_history=chat_history)
    except RuntimeError as e:
        if "GEMINI_API_KEY" in str(e):
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

    # Save user message
    user_msg = models.ChatMessage(
        thread_id=thread.id,
        role="user",
        content=body.query,
        citations=None,
    )
    db.add(user_msg)

    # Save assistant message
    citations_data = [{"source": c.source, "page": c.page, "quote": c.quote} for c in citations]
    asst_msg = models.ChatMessage(
        thread_id=thread.id,
        role="assistant",
        content=result.answer,
        citations=citations_data,
    )
    db.add(asst_msg)

    # Ensure paper links exist for new thread (already added above)
    if body.thread_id:
        existing = {lp.paper_id for lp in db.query(models.ThreadPaperLink).filter(models.ThreadPaperLink.thread_id == thread.id).all()}
        for pid in body.paper_ids:
            if pid not in existing:
                db.add(models.ThreadPaperLink(thread_id=thread.id, paper_id=pid))

    db.commit()

    return ChatResponse(
        answer=result.answer,
        citations=citations,
        thread_id=str(thread.id),
    )


class ThreadListItem(BaseModel):
    id: str
    title: str
    created_at: str


class MessageItem(BaseModel):
    id: str
    role: str
    content: str
    citations: list[Citation] | None


class ThreadDetailResponse(BaseModel):
    id: str
    title: str
    created_at: str
    messages: list[MessageItem]
    paper_ids: list[str]


@router.get("/chat/threads", response_model=list[ThreadListItem])
def list_threads(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
    paper_id: UUID | None = Query(None, description="Filter threads by paper"),
) -> list[ThreadListItem]:
    """List all chat threads for the current user, optionally filtered by paper."""
    q = db.query(models.ChatThread).filter(models.ChatThread.user_id == current_user.id)
    if paper_id is not None:
        q = q.join(models.ThreadPaperLink).filter(models.ThreadPaperLink.paper_id == paper_id).distinct()
    threads = q.order_by(models.ChatThread.created_at.desc()).all()
    return [
        ThreadListItem(
            id=str(t.id),
            title=t.title,
            created_at=t.created_at.isoformat(),
        )
        for t in threads
    ]


@router.get("/chat/threads/{thread_id}", response_model=ThreadDetailResponse)
def get_thread(
    thread_id: UUID,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
    paper_id: UUID | None = Query(None, description="Require thread to include this paper"),
) -> ThreadDetailResponse:
    """Load a specific thread's history."""
    thread = _ensure_thread_owned_by_user(db, thread_id, current_user.id)
    if paper_id is not None:
        linked = db.query(models.ThreadPaperLink).filter(
            models.ThreadPaperLink.thread_id == thread.id,
            models.ThreadPaperLink.paper_id == paper_id,
        ).first()
        if not linked:
            raise HTTPException(404, "Thread does not include this paper")
    paper_ids = [str(p.id) for p in thread.papers]

    def _citations_for(m: models.ChatMessage) -> list[Citation]:
        if not m.citations:
            return []
        return [
            Citation(source=c.get("source", ""), page=c.get("page", 0), quote=c.get("quote", ""))
            for c in m.citations
        ]

    messages = [
        MessageItem(
            id=str(m.id),
            role=m.role,
            content=m.content,
            citations=_citations_for(m) if m.role == "assistant" else None,
        )
        for m in thread.messages
    ]

    return ThreadDetailResponse(
        id=str(thread.id),
        title=thread.title,
        created_at=thread.created_at.isoformat(),
        messages=messages,
        paper_ids=paper_ids,
    )
