"""Literature Review Draft Generator — produces a Related Work section."""

from __future__ import annotations

import os
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models


def _get_llm() -> ChatOpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment")
    return ChatOpenAI(model="gpt-4o", temperature=0.3, openai_api_key=api_key)


def generate_literature_review(db: Session, paper_ids: list[UUID]) -> str:
    """
    Build context from knowledge cards of selected papers and generate
    a structured Related Work / Literature Review paragraph.
    Returns the draft as a plain markdown string.
    """
    stmt = (
        select(models.KnowledgeCard, models.Paper)
        .join(models.Paper, models.KnowledgeCard.paper_id == models.Paper.id)
        .where(models.KnowledgeCard.paper_id.in_(paper_ids))
    )
    rows = db.execute(stmt).all()
    if not rows:
        return ""

    context_parts = []
    for kc, paper in rows:
        parts = [f"[{paper.filename}]"]
        if kc.core_problem:
            parts.append(f"Problem: {kc.core_problem}")
        if kc.methodology:
            parts.append(f"Method: {kc.methodology}")
        if kc.dataset:
            parts.append(f"Dataset: {kc.dataset}")
        if kc.results:
            parts.append(f"Results: {kc.results}")
        if kc.limitations:
            parts.append(f"Limitations: {kc.limitations}")
        context_parts.append("\n".join(parts))

    context = "\n\n".join(context_parts)

    system = """You are an academic writing assistant. Given structured summaries of research papers, write a cohesive Related Work / Literature Review section suitable for an academic paper.

RULES:
- Write in third-person academic style.
- Cite papers inline using their filename in square brackets, e.g. [paper_name.pdf].
- Group papers thematically where possible (same method, dataset, or problem).
- Compare and contrast findings across papers.
- End with a brief paragraph on what the current body of work has NOT yet addressed (transition to the research gap).
- Length: 350–500 words. No bullet points — continuous prose only.
- Do NOT invent facts not present in the summaries."""

    user_content = f"Paper summaries:\n\n{context}\n\nWrite the Related Work section."

    llm = _get_llm()
    response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user_content)])
    return (response.content or "").strip()
