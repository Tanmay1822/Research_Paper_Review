"""PDF ingestion service for extraction, embedding, and persistence."""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from uuid import UUID

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from pydantic import BaseModel, Field

from app.db.database import SessionLocal
from app.db.models import DocumentChunk, KnowledgeCard, Paper, PaperCategory, PaperCategoryType, PaperStatus


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


text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    length_function=len,
    separators=["\n\n", "\n", ". ", " ", ""],
)

UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


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
    """Use Gemini with structured output for reliable Knowledge Card extraction."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in environment")
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=api_key, temperature=0)
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


def _get_embeddings_model() -> GoogleGenerativeAIEmbeddings:
    """Initialize Gemini embeddings model."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in environment")
    return GoogleGenerativeAIEmbeddings(model="gemini-embedding-001", google_api_key=api_key)


def _pad_or_truncate(vec: list[float], target_dim: int = 1536) -> list[float]:
    """Match embedding dimension used by pgvector."""
    if len(vec) < target_dim:
        return vec + [0.0] * (target_dim - len(vec))
    return vec[:target_dim]


def extract_from_pdf(pdf_path: str | Path) -> ExtractionResult:
    """
    Extract text and Knowledge Card from a PDF using pypdf + Gemini.

    Args:
        pdf_path: Path to the PDF file.

    Returns:
        ExtractionResult with full_text, page_texts, and Knowledge Card fields.

    Raises:
        RuntimeError: If GEMINI_API_KEY is not set or API call fails.
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


def process_pdf_ingestion(
    pdf_path: str | Path, filename: str, user_id: str, folder_id: str | None = None
) -> dict[str, str | int]:
    """
    Process a staged PDF and persist the full ingestion output atomically.

    Raises:
        RuntimeError: If parsing, LLM, embedding, filesystem, or DB steps fail.
    """
    path = Path(pdf_path)
    if not path.exists():
        raise RuntimeError(f"Staged upload file not found: {path}")

    extraction = extract_from_pdf(path)

    chunks_to_embed: list[tuple[str, int]] = []
    for page_num, page_text in extraction.page_texts:
        if not page_text.strip():
            continue
        for chunk in text_splitter.split_text(page_text):
            chunks_to_embed.append((chunk, page_num))

    if not chunks_to_embed:
        fallback_text = extraction.full_text or "No text extracted"
        for chunk in text_splitter.split_text(fallback_text):
            chunks_to_embed.append((chunk, 1))

    chunk_texts = [text for text, _ in chunks_to_embed]
    embeddings_model = _get_embeddings_model()
    raw_vectors = embeddings_model.embed_documents(chunk_texts)
    padded_vectors = [_pad_or_truncate(vec) for vec in raw_vectors]

    db = SessionLocal()
    try:
        with db.begin():
            paper = Paper(
                filename=filename,
                title=filename.replace(".pdf", "").replace("_", " "),
                status=PaperStatus.COMPLETED,
                user_id=UUID(user_id),
                folder_id=UUID(folder_id) if folder_id else None,
            )
            db.add(paper)
            db.flush()

            db.add(
                KnowledgeCard(
                    paper_id=paper.id,
                    core_problem=extraction.core_problem,
                    methodology=extraction.methodology,
                    dataset=extraction.dataset,
                    results=extraction.results,
                    limitations=extraction.limitations,
                )
            )
            db.add(PaperCategory(paper_id=paper.id, category=extraction.category))

            for (chunk_text, page_num), embedding in zip(chunks_to_embed, padded_vectors):
                db.add(
                    DocumentChunk(
                        paper_id=paper.id,
                        page_num=page_num,
                        chunk_text=chunk_text,
                        embedding=embedding,
                    )
                )

            final_pdf = UPLOADS_DIR / f"{paper.id}.pdf"
            shutil.copy2(path, final_pdf)

        db.refresh(paper)
        return {
            "id": str(paper.id),
            "filename": paper.filename,
            "title": paper.title or "",
            "status": paper.status.value,
            "category": extraction.category.value,
            "chunks_count": len(chunks_to_embed),
        }
    except Exception as exc:
        raise RuntimeError(f"Ingestion failed: {exc}") from exc
    finally:
        db.close()


def extract_knowledge_card_for_existing_paper(paper_id: str, user_id: str) -> dict[str, str]:
    """Generate/refresh knowledge card metadata for an existing uploaded paper."""
    db = SessionLocal()
    try:
        paper_uuid = UUID(paper_id)
        user_uuid = UUID(user_id)
        paper = db.query(Paper).filter(Paper.id == paper_uuid).first()
        if not paper:
            raise RuntimeError("Paper not found")
        if paper.user_id != user_uuid:
            raise RuntimeError("Access denied for paper")

        pdf_path = UPLOADS_DIR / f"{paper.id}.pdf"
        extraction = extract_from_pdf(pdf_path)

        existing_kc = db.query(KnowledgeCard).filter(KnowledgeCard.paper_id == paper.id).first()
        if existing_kc:
            existing_kc.core_problem = extraction.core_problem
            existing_kc.methodology = extraction.methodology
            existing_kc.dataset = extraction.dataset
            existing_kc.results = extraction.results
            existing_kc.limitations = extraction.limitations
        else:
            db.add(
                KnowledgeCard(
                    paper_id=paper.id,
                    core_problem=extraction.core_problem,
                    methodology=extraction.methodology,
                    dataset=extraction.dataset,
                    results=extraction.results,
                    limitations=extraction.limitations,
                )
            )

        existing_category = db.query(PaperCategory).filter(PaperCategory.paper_id == paper.id).first()
        if existing_category:
            existing_category.category = extraction.category
        else:
            db.add(PaperCategory(paper_id=paper.id, category=extraction.category))

        paper.status = PaperStatus.COMPLETED
        db.commit()

        return {"paper_id": str(paper.id), "status": "completed"}
    except Exception as exc:
        raise RuntimeError(f"Bulk extract failed: {exc}") from exc
    finally:
        db.close()
