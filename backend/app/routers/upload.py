"""PDF upload and processing router."""

from __future__ import annotations

import logging
import os
import tempfile

logger = logging.getLogger(__name__)
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy.orm import Session

from app.db import database, models
from app.services.ingestion import extract_from_pdf

router = APIRouter(prefix="/api", tags=["upload"])

# Use temp dir to avoid path issues in Docker/Windows
UPLOADS_DIR = Path(tempfile.gettempdir()) / "rpa_uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    length_function=len,
    separators=["\n\n", "\n", ". ", " ", ""],
)

def _get_embeddings_model() -> OpenAIEmbeddings:
    """Lazy-init embeddings (avoids startup failure if OPENAI_API_KEY missing)."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            503,
            "OPENAI_API_KEY not set. Add it to backend/.env to enable PDF upload.",
        )
    return OpenAIEmbeddings(model="text-embedding-ada-002", api_key=api_key)


@router.post("/upload")
async def upload_pdf(
    file: UploadFile,
    db: Session = Depends(database.get_db),
) -> dict:
    """
    Upload a PDF, extract content with Gemini, and persist to the database.

    Saves Paper metadata, Knowledge Card, category, and vectorized chunks.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    # Save to temp location
    safe_name = f"{uuid.uuid4().hex}_{file.filename}"
    temp_path = UPLOADS_DIR / safe_name

    try:
        contents = await file.read()
        temp_path.write_bytes(contents)
    except Exception as e:
        raise HTTPException(500, f"Failed to save file: {e}") from e

    paper = models.Paper(
        filename=file.filename,
        title=None,
        status="processing",
    )

    try:
        db.add(paper)
        db.commit()
        db.refresh(paper)
    except Exception as e:
        db.rollback()
        temp_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Database error: {e}") from e

    try:
        extraction = extract_from_pdf(temp_path)
    except RuntimeError as e:
        logger.exception("Extraction RuntimeError")
        paper.status = "failed"
        db.commit()
        temp_path.unlink(missing_ok=True)
        raise HTTPException(502, f"Extraction failed: {e}") from e
    except FileNotFoundError as e:
        paper.status = "failed"
        db.commit()
        temp_path.unlink(missing_ok=True)
        raise HTTPException(500, str(e)) from e
    except Exception as e:
        logger.exception("Extraction error")
        paper.status = "failed"
        db.commit()
        temp_path.unlink(missing_ok=True)
        raise HTTPException(502, f"Extraction failed: {e}") from e

    try:
        # Update paper title if we can infer it
        paper.title = file.filename.replace(".pdf", "").replace("_", " ")

        # Save Knowledge Card
        knowledge_card = models.KnowledgeCard(
            paper_id=paper.id,
            core_problem=extraction.core_problem,
            methodology=extraction.methodology,
            dataset=extraction.dataset,
            results=extraction.results,
            limitations=extraction.limitations,
        )
        db.add(knowledge_card)

        # Save Category
        paper_category = models.PaperCategory(
            paper_id=paper.id,
            category=extraction.category,
        )
        db.add(paper_category)

        # Chunk text (preserve page numbers)
        chunks_to_embed: list[tuple[str, int]] = []
        for page_num, page_text in extraction.page_texts:
            if not page_text.strip():
                continue
            page_chunks = text_splitter.split_text(page_text)
            for chunk in page_chunks:
                chunks_to_embed.append((chunk, page_num))

        if not chunks_to_embed:
            # Fallback: chunk full text and assign page 1
            all_text = extraction.full_text or "No text extracted"
            for chunk in text_splitter.split_text(all_text):
                chunks_to_embed.append((chunk, 1))

        # Generate embeddings
        chunk_texts = [c[0] for c in chunks_to_embed]
        try:
            embeddings_model = _get_embeddings_model()
            embedding_vectors = embeddings_model.embed_documents(chunk_texts)
        except HTTPException:
            raise
        except Exception as e:
            paper.status = "failed"
            db.commit()
            raise HTTPException(502, f"Embedding generation failed: {e}") from e

        # Save DocumentChunks
        for (chunk_text, page_num), embedding in zip(chunks_to_embed, embedding_vectors):
            doc_chunk = models.DocumentChunk(
                paper_id=paper.id,
                page_num=page_num,
                chunk_text=chunk_text,
                embedding=embedding,
            )
            db.add(doc_chunk)

        paper.status = "completed"
        db.commit()
        db.refresh(paper)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        paper.status = "failed"
        db.commit()
        raise HTTPException(500, f"Failed to persist data: {e}") from e
    finally:
        temp_path.unlink(missing_ok=True)

    return {
        "id": str(paper.id),
        "filename": paper.filename,
        "title": paper.title,
        "status": paper.status.value,
        "category": extraction.category.value,
        "chunks_count": len(chunks_to_embed),
    }
