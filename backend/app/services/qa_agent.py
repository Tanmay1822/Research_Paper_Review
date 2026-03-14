"""QA Agent: Router, retrieval routes, and synthesis for the Research Assistant."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models

IntentType = Literal["fact_lookup", "summary_scope", "complex_comparison"]


@dataclass
class RetrievedChunk:
    """A chunk retrieved for context."""

    paper_filename: str
    page_num: int
    chunk_text: str


@dataclass
class SynthesisResult:
    """Result from the synthesis step."""

    answer: str
    citations: list[dict[str, str | int]]


def _get_llm() -> ChatOpenAI:
    """Lazy-init OpenAI LLM."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment")
    return ChatOpenAI(
        model="gpt-4o-mini",
        api_key=api_key,
        temperature=0,
    )


def _get_embeddings() -> OpenAIEmbeddings:
    """Lazy-init OpenAI embeddings."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment")
    return OpenAIEmbeddings(model="text-embedding-ada-002", api_key=api_key)


def classify_intent(question: str) -> IntentType:
    """
    LLM-based intent classifier. Returns one of: fact_lookup, summary_scope, complex_comparison.
    """
    llm = _get_llm()
    prompt = f"""Classify the user's question intent into exactly one of these three categories:

- fact_lookup: Specific factual questions (e.g. "What was the learning rate?", "Which dataset did they use?")
- summary_scope: High-level overview questions (e.g. "What are the common trends?", "Summarize these papers")
- complex_comparison: Questions comparing across papers (e.g. "Compare method A vs B", "Do these papers agree on X?")

User question: {question}

Respond with ONLY the category name, nothing else. One of: fact_lookup, summary_scope, complex_comparison"""

    response = llm.invoke([HumanMessage(content=prompt)])
    text = (response.content or "").strip().lower()
    for intent in ("fact_lookup", "summary_scope", "complex_comparison"):
        if intent in text:
            return intent
    return "fact_lookup"


def route_summary_scope(db: Session, paper_ids: list[UUID]) -> str:
    """Query KnowledgeCards for given papers and build high-level context."""
    stmt = (
        select(models.KnowledgeCard, models.Paper)
        .join(models.Paper, models.KnowledgeCard.paper_id == models.Paper.id)
        .where(models.KnowledgeCard.paper_id.in_(paper_ids))
    )
    rows = db.execute(stmt).all()
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
        context_parts.append("\n".join(parts))
    return "\n\n---\n\n".join(context_parts)


def route_fact_lookup(db: Session, paper_ids: list[UUID], query: str) -> list[RetrievedChunk]:
    """Embed query, run vector search on DocumentChunks, return top 5 chunks."""
    embeddings = _get_embeddings()
    query_embedding = embeddings.embed_query(query)

    stmt = (
        select(models.DocumentChunk, models.Paper)
        .join(models.Paper, models.DocumentChunk.paper_id == models.Paper.id)
        .where(
            models.DocumentChunk.paper_id.in_(paper_ids),
            models.DocumentChunk.embedding.isnot(None),
        )
        .order_by(models.DocumentChunk.embedding.cosine_distance(query_embedding))
        .limit(5)
    )
    rows = db.execute(stmt).all()
    return [
        RetrievedChunk(paper_filename=paper.filename, page_num=chunk.page_num, chunk_text=chunk.chunk_text)
        for chunk, paper in rows
    ]


def route_complex_comparison(db: Session, paper_ids: list[UUID]) -> str:
    """Query KnowledgeCards (Results, Methodology) and build comparison context."""
    stmt = (
        select(models.KnowledgeCard, models.Paper)
        .join(models.Paper, models.KnowledgeCard.paper_id == models.Paper.id)
        .where(models.KnowledgeCard.paper_id.in_(paper_ids))
    )
    rows = db.execute(stmt).all()
    context_parts = []
    for kc, paper in rows:
        parts = [f"Paper: {paper.filename}"]
        if kc.methodology:
            parts.append(f"Methodology: {kc.methodology}")
        if kc.results:
            parts.append(f"Results: {kc.results}")
        context_parts.append("\n".join(parts))
    return "\n\n---\n\n".join(context_parts)


def synthesize_answer(
    query: str,
    context: str,
    chunks: list[RetrievedChunk],
    intent: IntentType,
) -> SynthesisResult:
    """
    Take retrieved context and synthesize a JSON response with answer and citations.
    """
    llm = _get_llm()
    chunk_str = "\n\n".join(
        f"[Source: {c.paper_filename}, Page: {c.page_num}]\n{c.chunk_text}"
        for c in chunks
    ) if chunks else "No relevant chunks found."

    system = """You are a research assistant. Answer the user's question using ONLY the provided context.
Your response MUST be valid JSON with this exact schema:
{"answer": "your answer here", "citations": [{"source": "filename.pdf", "page": 4, "quote": "exact quote from context"}]}
- answer: A clear, grounded response. Only state facts present in the context.
- citations: Array of objects. Each must have source (filename), page (int), quote (exact snippet).
Use only filenames and pages that appear in the context. If no specific quote applies, use a short relevant snippet."""

    user_content = f"Context:\n{context}\n\nRelevant chunks:\n{chunk_str}\n\nQuestion: {query}"
    response = llm.invoke([
        SystemMessage(content=system),
        HumanMessage(content=user_content),
    ])
    text = (response.content or "").strip()
    try:
        if "```json" in text:
            text = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
            text = text.group(1).strip() if text else text
        elif "```" in text:
            text = re.sub(r"```\w*\n?", "", text).strip()
        data = json.loads(text)
        return SynthesisResult(
            answer=data.get("answer", ""),
            citations=data.get("citations", []),
        )
    except json.JSONDecodeError:
        return SynthesisResult(answer=text, citations=[])


def run_qa(
    db: Session,
    query: str,
    paper_ids: list[UUID],
) -> SynthesisResult:
    """Orchestrate Router -> Route -> Synthesis and return the result."""
    intent = classify_intent(query)
    context = ""
    chunks: list[RetrievedChunk] = []

    if intent == "summary_scope":
        context = route_summary_scope(db, paper_ids)
    elif intent == "fact_lookup":
        chunks = route_fact_lookup(db, paper_ids, query)
        context = "\n\n".join(
            f"[{c.paper_filename}, p.{c.page_num}]: {c.chunk_text}"
            for c in chunks
        )
    elif intent == "complex_comparison":
        context = route_complex_comparison(db, paper_ids)
        llm = _get_llm()
        cmp_prompt = f"""Using this context, compare the papers and answer the question. Highlight agreements and divergent findings.

Context:
{context}

Question: {query}

Respond in plain text (you will be wrapped in synthesis step). Be explicit about which paper says what."""
        cmp_response = llm.invoke([HumanMessage(content=cmp_prompt)])
        context = cmp_response.content or context

    return synthesize_answer(query, context, chunks, intent)
