"""Contradiction Detection Agent for cross-paper analysis."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models


@dataclass
class ContradictionItem:
    """A single contradiction between papers."""

    topic: str
    paper_A_claim: str
    paper_B_claim: str
    analysis: str


@dataclass
class ContradictionReport:
    """Report from the contradiction detection agent."""

    agreements: list[str]
    contradictions: list[ContradictionItem]


def _get_llm() -> ChatGoogleGenerativeAI:
    """Lazy-init Gemini LLM."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in environment")
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=api_key,
        temperature=0,
    )


def detect_contradictions(db: Session, paper_ids: list[UUID]) -> ContradictionReport:
    """
    Query KnowledgeCards for the given papers, then use Gemini to cross-reference
    claims and produce a report of agreements and contradictions.
    """
    stmt = (
        select(models.KnowledgeCard, models.Paper)
        .join(models.Paper, models.KnowledgeCard.paper_id == models.Paper.id)
        .where(models.KnowledgeCard.paper_id.in_(paper_ids))
    )
    rows = db.execute(stmt).all()
    if len(rows) < 2:
        return ContradictionReport(agreements=[], contradictions=[])

    context_parts = []
    for kc, paper in rows:
        parts = [f"Paper: {paper.filename}"]
        if kc.core_problem:
            parts.append(f"Core problem: {kc.core_problem}")
        if kc.methodology:
            parts.append(f"Methodology: {kc.methodology}")
        if kc.results:
            parts.append(f"Results: {kc.results}")
        context_parts.append("\n".join(parts))

    context = "\n\n---\n\n".join(context_parts)

    system = """You are a rigorous academic reviewer. Cross-reference the claims from the provided research papers.
Output ONLY valid JSON with this exact schema:
{
  "agreements": ["string describing where papers align", ...],
  "contradictions": [
    {
      "topic": "the subject of disagreement",
      "paper_A_claim": "what one paper claims (use actual paper filename)",
      "paper_B_claim": "what another paper claims (use actual paper filename)",
      "analysis": "brief explanation of the conflict"
    }
  ]
}
- agreements: Where papers report similar findings, methods, or conclusions.
- contradictions: Where papers diverge or report conflicting outcomes. Use real filenames from the context for paper_A_claim and paper_B_claim.
If there are no agreements or no contradictions, use empty arrays."""

    user_content = f"""Analyze these research papers for agreements and contradictions:

{context}

Produce the JSON report. Use the exact filenames from the papers above when referencing claims."""

    llm = _get_llm()
    response = llm.invoke([
        SystemMessage(content=system),
        HumanMessage(content=user_content),
    ])
    text = (response.content or "").strip()
    return _parse_report(text)


def _parse_report(text: str) -> ContradictionReport:
    """Parse LLM output into ContradictionReport."""
    try:
        if "```json" in text:
            match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
            text = match.group(1).strip() if match else text
        elif "```" in text:
            text = re.sub(r"```\w*\n?", "", text).strip()
        data = json.loads(text)
        agreements = _ensure_str_list(data.get("agreements", []))
        raw_contra = data.get("contradictions", [])
        contradictions = []
        for c in raw_contra:
            if isinstance(c, dict):
                item = ContradictionItem(
                    topic=str(c.get("topic", "")),
                    paper_A_claim=str(c.get("paper_A_claim", "")),
                    paper_B_claim=str(c.get("paper_B_claim", "")),
                    analysis=str(c.get("analysis", "")),
                )
                contradictions.append(item)
        return ContradictionReport(agreements=agreements, contradictions=contradictions)
    except json.JSONDecodeError:
        return ContradictionReport(agreements=[], contradictions=[])


def _ensure_str_list(val: Any) -> list[str]:
    """Coerce value to list of strings."""
    if not isinstance(val, list):
        return []
    return [str(x) for x in val]
