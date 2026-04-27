"""Contradiction Detection Agent for cross-paper analysis."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from langchain_openai import ChatOpenAI
from langchain_openai import OpenAIEmbeddings
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


def _get_llm() -> ChatOpenAI:
    """Lazy-init OpenAI LLM."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment")
    return ChatOpenAI(model="gpt-4o", temperature=0, openai_api_key=api_key)


def _get_embeddings() -> OpenAIEmbeddings:
    """Lazy-init OpenAI embeddings model used for chunk retrieval."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment")
    return OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=api_key)


def _pad_or_truncate(vec: list[float], target_dim: int = 1536) -> list[float]:
    """Match embedding dimension used by pgvector in DocumentChunk.embedding."""
    if len(vec) < target_dim:
        return vec + [0.0] * (target_dim - len(vec))
    return vec[:target_dim]


def _retrieve_evidence_chunks_for_paper(
    db: Session,
    paper_id: UUID,
    query_embeddings: list[list[float]],
    top_k_per_query: int = 2,
) -> list[models.DocumentChunk]:
    """
    Retrieve a small, diverse set of evidence chunks for one paper using semantic queries.
    Falls back to earliest chunks when embeddings are missing.
    """
    by_id: dict[UUID, models.DocumentChunk] = {}

    for query_embedding in query_embeddings:
        stmt = (
            select(models.DocumentChunk)
            .where(
                models.DocumentChunk.paper_id == paper_id,
                models.DocumentChunk.embedding.isnot(None),
            )
            .order_by(models.DocumentChunk.embedding.cosine_distance(query_embedding))
            .limit(top_k_per_query)
        )
        for chunk in db.execute(stmt).scalars().all():
            by_id[chunk.id] = chunk

    if by_id:
        return sorted(by_id.values(), key=lambda c: (c.page_num, c.id.hex))

    # Fallback if embeddings are not available for this paper.
    fallback_stmt = (
        select(models.DocumentChunk)
        .where(models.DocumentChunk.paper_id == paper_id)
        .order_by(models.DocumentChunk.page_num.asc())
        .limit(4)
    )
    return db.execute(fallback_stmt).scalars().all()


def detect_contradictions(db: Session, paper_ids: list[UUID]) -> ContradictionReport:
    """
    Build contradiction context from both KnowledgeCards and semantically selected
    document chunks, then use the LLM to cross-reference claims.
    """
    stmt = (
        select(models.KnowledgeCard, models.Paper)
        .join(models.Paper, models.KnowledgeCard.paper_id == models.Paper.id)
        .where(models.KnowledgeCard.paper_id.in_(paper_ids))
    )
    rows = db.execute(stmt).all()
    if len(rows) < 2:
        return ContradictionReport(agreements=[], contradictions=[])

    embeddings_model = _get_embeddings()
    retrieval_queries = [
        "main claim conclusion finding result",
        "methodology approach experiment setup dataset",
        "limitations weakness caveat future work",
    ]
    query_embeddings = [
        _pad_or_truncate(embeddings_model.embed_query(query))
        for query in retrieval_queries
    ]

    context_parts = []
    for kc, paper in rows:
        parts = [f"Paper: {paper.filename}"]
        if kc.core_problem:
            parts.append(f"Core problem: {kc.core_problem}")
        if kc.methodology:
            parts.append(f"Methodology: {kc.methodology}")
        if kc.dataset:
            parts.append(f"Dataset: {kc.dataset}")
        if kc.results:
            parts.append(f"Results: {kc.results}")
        if kc.limitations:
            parts.append(f"Limitations: {kc.limitations}")

        evidence_chunks = _retrieve_evidence_chunks_for_paper(
            db=db,
            paper_id=paper.id,
            query_embeddings=query_embeddings,
        )
        if evidence_chunks:
            parts.append("Evidence snippets from paper text:")
            for chunk in evidence_chunks:
                snippet = " ".join(chunk.chunk_text.split())
                if len(snippet) > 420:
                    snippet = f"{snippet[:420]}..."
                parts.append(f"- [page {chunk.page_num}] {snippet}")
        context_parts.append("\n".join(parts))

    context = "\n\n---\n\n".join(context_parts)

    system = """You are a rigorous academic reviewer. Compare the provided research papers strictly based on the information given.

CRITICAL RULES:
- Only report facts that are explicitly present in the paper summaries below. Do NOT infer, assume, or fabricate anything.
- agreements: Only include an item if both papers explicitly share the same finding, method, dataset, or conclusion — word it based on what is actually stated. If nothing genuinely overlaps, return an empty array.
- contradictions: Only include an item if the papers make explicitly conflicting claims on the same topic. Do not manufacture disagreements from differences in scope or focus.
- Never hallucinate. If the data does not support a finding, omit it.

Output ONLY valid JSON with this exact schema:
{
  "agreements": [
    "A specific shared finding, method, dataset, or conclusion that is explicitly present in BOTH papers"
  ],
  "contradictions": [
    {
      "topic": "the subject of disagreement",
      "paper_A_claim": "exact claim from paper A (include filename)",
      "paper_B_claim": "exact claim from paper B (include filename)",
      "analysis": "why these claims conflict"
    }
  ]
}

Use empty arrays when nothing qualifies. Use exact filenames when referencing papers."""

    user_content = f"""Analyze only what is explicitly stated in these paper summaries. Do not infer anything beyond what is written.

{context}

Produce the JSON report."""

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
