"""Citation network builder — LLM-powered citation detection from stored DB chunks."""

from __future__ import annotations

import json
import os
import re
from uuid import UUID

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from sqlalchemy.orm import Session

from app.db import models


def _normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _get_reference_section(db: Session, paper_id: UUID) -> str:
    """
    Get the references section text from stored chunks.
    Tries to find a 'References' header first; falls back to last 20% of chunks.
    """
    all_chunks = (
        db.query(models.DocumentChunk)
        .filter(models.DocumentChunk.paper_id == paper_id)
        .order_by(models.DocumentChunk.page_num.asc())
        .all()
    )
    if not all_chunks:
        return ""

    # Find the chunk where the References section starts
    ref_start = None
    for i, chunk in enumerate(all_chunks):
        if re.search(
            r"\b(references|bibliography|works cited|literature cited)\b",
            chunk.chunk_text,
            re.IGNORECASE,
        ):
            ref_start = i
            # Don't break — take the LAST occurrence (actual section, not in-text mention)

    if ref_start is not None:
        ref_chunks = all_chunks[ref_start:]
    else:
        # Fall back: last 20% of chunks, minimum 4
        start = max(0, len(all_chunks) - max(4, len(all_chunks) // 5))
        ref_chunks = all_chunks[start:]

    return "\n".join(c.chunk_text for c in ref_chunks[:25])


def _keyword_match(paper_title: str, text: str, min_matches: int = 3) -> bool:
    """
    Fast pre-filter: check if enough distinctive title words appear in text.
    Filters stop words and very short tokens to avoid false positives.
    """
    _stop = {
        "a", "an", "the", "of", "in", "on", "at", "to", "for", "with",
        "and", "or", "is", "are", "was", "were", "its", "it", "this",
        "that", "by", "from", "as", "via", "into",
    }
    words = [
        w for w in _normalize(paper_title).split()
        if w not in _stop and len(w) > 3
    ]
    if not words:
        return False
    norm_text = _normalize(text)
    matches = sum(1 for w in words if w in norm_text)
    threshold = min(min_matches, len(words))
    return matches >= threshold


def _llm_detect_citations(
    source_title: str,
    ref_text: str,
    candidates: list[dict],  # [{"id": str, "title": str}]
) -> list[str]:
    """
    Ask GPT-4o-mini which candidate papers are cited in ref_text.
    Returns a list of cited paper IDs.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not candidates:
        return []

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, openai_api_key=api_key)
    candidates_json = json.dumps(candidates, indent=2)

    prompt = f"""You are analyzing the reference/bibliography section of a research paper.

Source paper title: "{source_title}"

Reference section text (may be truncated):
---
{ref_text[:4500]}
---

Candidate papers that might be cited (check against the references above):
{candidates_json}

Instructions:
- Match titles even if abbreviated, shortened, or slightly reformatted in the reference list.
- A match counts if the core distinctive words of the candidate title appear in a reference entry.
- Do NOT invent matches — only return IDs you are confident about.

Return ONLY a JSON array of the matching paper "id" strings.
Example: ["abc123", "def456"]
If no matches, return: []

JSON array:"""

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        match = re.search(r"\[.*?\]", content, re.DOTALL)
        if match:
            result = json.loads(match.group())
            valid_ids = {c["id"] for c in candidates}
            return [r for r in result if r in valid_ids]
        return []
    except Exception:
        return []


def build_citation_network(
    db: Session, paper_ids: list[UUID], user_id: UUID
) -> dict:
    """
    Build a citation network for the requested papers.

    Strategy (per source paper):
      1. Extract reference section from stored DB chunks.
      2. Fast keyword pre-filter against each candidate paper's title.
      3. For candidates that didn't pass the keyword filter, ask the LLM.
    """
    all_papers = (
        db.query(models.Paper)
        .filter(
            models.Paper.user_id == user_id,
            models.Paper.status == models.PaperStatus.COMPLETED,
        )
        .all()
    )
    paper_map = {str(p.id): p for p in all_papers}
    requested = [paper_map[str(pid)] for pid in paper_ids if str(pid) in paper_map]

    nodes = []
    for p in requested:
        category = p.paper_category.category.value if p.paper_category else None
        nodes.append({
            "id": str(p.id),
            "title": p.title or p.filename.replace(".pdf", "").replace("_", " "),
            "filename": p.filename,
            "category": category,
        })

    edges: list[dict] = []
    seen_edges: set[frozenset] = set()

    for paper in requested:
        ref_text = _get_reference_section(db, paper.id)
        if not ref_text.strip():
            continue

        others = [p for p in requested if p.id != paper.id]
        if not others:
            continue

        def _title(p: models.Paper) -> str:
            return p.title or p.filename.replace(".pdf", "").replace("_", " ")

        # Pass 1 — fast keyword match
        keyword_hit_ids: set[str] = set()
        for other in others:
            edge_key = frozenset([str(paper.id), str(other.id)])
            if edge_key in seen_edges:
                keyword_hit_ids.add(str(other.id))
                continue
            if _keyword_match(_title(other), ref_text):
                edges.append({"source": str(paper.id), "target": str(other.id)})
                seen_edges.add(edge_key)
                keyword_hit_ids.add(str(other.id))

        # Pass 2 — LLM for remaining candidates
        remaining = [
            {"id": str(o.id), "title": _title(o)}
            for o in others
            if str(o.id) not in keyword_hit_ids
        ]
        if remaining:
            cited_ids = _llm_detect_citations(_title(paper), ref_text, remaining)
            for cited_id in cited_ids:
                edge_key = frozenset([str(paper.id), cited_id])
                if edge_key not in seen_edges:
                    edges.append({"source": str(paper.id), "target": cited_id})
                    seen_edges.add(edge_key)

    return {"nodes": nodes, "edges": edges}
