"""PDF ingestion service using pypdf for text extraction and OpenAI for Knowledge Card."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from pypdf import PdfReader
from pydantic import BaseModel, Field

from app.db.models import PaperCategoryType


class KnowledgeCardSchema(BaseModel):
    """Structured output schema for Knowledge Card extraction."""

    core_problem: str = Field(description="Brief description of the main research problem")
    methodology: str = Field(description="Description of the approach/methods used")
    dataset: str = Field(description="Datasets used, or 'N/A' if not applicable")
    results: str = Field(description="Key findings and results")
    limitations: str = Field(description="Study limitations or future work")
    category: Literal["Review", "Empirical", "Theoretical"] = Field(
        description="One of: Review, Empirical, Theoretical"
    )


KNOWLEDGE_CARD_PROMPT = """Given the following research paper text, extract structured metadata.

Extract:
- core_problem: Brief description of the main research problem
- methodology: Description of the approach/methods used
- dataset: Datasets used, or "N/A" if not applicable
- results: Key findings and results
- limitations: Study limitations or future work
- category: One of Review, Empirical, or Theoretical

Paper text:
---
{text}
---"""


@dataclass
class ExtractionResult:
    """Result of PDF extraction."""

    full_text: str
    page_texts: list[tuple[int, str]]
    core_problem: str | None
    methodology: str | None
    dataset: str | None
    results: str | None
    limitations: str | None
    category: PaperCategoryType


def _extract_text_with_pages(pdf_path: Path) -> tuple[str, list[tuple[int, str]]]:
    """Extract text from PDF with page numbers using pypdf."""
    reader = PdfReader(str(pdf_path))
    page_texts: list[tuple[int, str]] = []
    full_parts = []
    for i, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        page_texts.append((i, text))
        full_parts.append(f"[PAGE {i}]\n{text}")
    full_text = "\n\n".join(full_parts)
    return full_text, page_texts


def _extract_knowledge_card(text: str) -> tuple[
    str | None, str | None, str | None, str | None, str | None, PaperCategoryType
]:
    """Use OpenAI with structured output for reliable Knowledge Card extraction."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment")
    llm = ChatOpenAI(model="gpt-4o-mini", api_key=api_key, temperature=0)
    structured_llm = llm.with_structured_output(KnowledgeCardSchema)
    truncated = text[:12000] if len(text) > 12000 else text
    prompt = KNOWLEDGE_CARD_PROMPT.format(text=truncated)
    try:
        result: KnowledgeCardSchema = structured_llm.invoke([HumanMessage(content=prompt)])
        category = PaperCategoryType(result.category)
        return (
            result.core_problem or None,
            result.methodology or None,
            result.dataset or None,
            result.results or None,
            result.limitations or None,
            category,
        )
    except Exception:
        return (None, None, None, None, None, PaperCategoryType.EMPIRICAL)


def extract_from_pdf(pdf_path: str | Path) -> ExtractionResult:
    """
    Extract text and Knowledge Card from a PDF using pypdf + OpenAI.

    Args:
        pdf_path: Path to the PDF file.

    Returns:
        ExtractionResult with full_text, page_texts, and Knowledge Card fields.

    Raises:
        RuntimeError: If OPENAI_API_KEY is not set or API call fails.
    """
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF file not found: {path}")

    full_text, page_texts = _extract_text_with_pages(path)
    if not full_text.strip():
        return ExtractionResult(
            full_text="",
            page_texts=[],
            core_problem=None,
            methodology=None,
            dataset=None,
            results=None,
            limitations=None,
            category=PaperCategoryType.EMPIRICAL,
        )

    core_problem, methodology, dataset, results, limitations, category = (
        _extract_knowledge_card(full_text)
    )

    return ExtractionResult(
        full_text=full_text,
        page_texts=page_texts,
        core_problem=core_problem,
        methodology=methodology,
        dataset=dataset,
        results=results,
        limitations=limitations,
        category=category,
    )
