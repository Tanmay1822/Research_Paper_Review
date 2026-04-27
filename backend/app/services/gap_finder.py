"""Research Gap Finder — synthesizes open problems from knowledge cards."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models


@dataclass
class GapReport:
    gaps: list[str]
    future_directions: list[str]


def _get_llm() -> ChatOpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment")
    return ChatOpenAI(model="gpt-4o-mini", temperature=0.2, openai_api_key=api_key)


def find_research_gaps(db: Session, paper_ids: list[UUID]) -> GapReport:
    """
    Read limitations, results, and core_problem fields from the selected papers'
    knowledge cards and identify research gaps and future directions.
    """
    stmt = (
        select(models.KnowledgeCard, models.Paper)
        .join(models.Paper, models.KnowledgeCard.paper_id == models.Paper.id)
        .where(models.KnowledgeCard.paper_id.in_(paper_ids))
    )
    rows = db.execute(stmt).all()
    if not rows:
        return GapReport(gaps=[], future_directions=[])

    context_parts = []
    for kc, paper in rows:
        parts = [f"Paper: {paper.filename}"]
        if kc.core_problem:
            parts.append(f"Core problem: {kc.core_problem}")
        if kc.results:
            parts.append(f"Results: {kc.results}")
        if kc.limitations:
            parts.append(f"Limitations: {kc.limitations}")
        context_parts.append("\n".join(parts))

    context = "\n\n---\n\n".join(context_parts)

    system = """You are a senior research advisor. Given summaries of research papers, identify research gaps and promising future directions that are NOT yet addressed by any of the papers.

RULES:
- Only derive gaps from the explicitly stated limitations and results in the summaries.
- Do not hallucinate topics not mentioned in any paper.
- gaps: Problems that remain open, unaddressed, or explicitly called out as limitations.
- future_directions: Concrete next steps a researcher could take to advance the field.
- Each item should be 1-2 sentences, specific and actionable.

Output ONLY valid JSON:
{
  "gaps": ["Gap 1", "Gap 2", "Gap 3"],
  "future_directions": ["Direction 1", "Direction 2", "Direction 3"]
}

Use empty arrays if nothing qualifies."""

    user_content = f"""Analyze these paper summaries and identify research gaps.\n\n{context}\n\nProduce the JSON report."""

    llm = _get_llm()
    response = llm.invoke([SystemMessage(content=system), HumanMessage(content=user_content)])
    return _parse(response.content or "")


def _parse(text: str) -> GapReport:
    try:
        if "```json" in text:
            match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
            text = match.group(1).strip() if match else text
        elif "```" in text:
            text = re.sub(r"```\w*\n?", "", text).strip()
        data = json.loads(text)
        return GapReport(
            gaps=[str(g) for g in data.get("gaps", []) if g],
            future_directions=[str(d) for d in data.get("future_directions", []) if d],
        )
    except (json.JSONDecodeError, AttributeError):
        return GapReport(gaps=[], future_directions=[])
