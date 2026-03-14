"""SQLAlchemy models for the Research Assistant."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

if TYPE_CHECKING:
    from sqlalchemy.orm import Relationship


class PaperStatus(str, enum.Enum):
    """Processing status of an uploaded paper."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class PaperCategoryType(str, enum.Enum):
    """Classification of a paper's type."""

    REVIEW = "Review"
    EMPIRICAL = "Empirical"
    THEORETICAL = "Theoretical"


class Paper(Base):
    """Uploaded research paper."""

    __tablename__ = "papers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    filename: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )
    status: Mapped[PaperStatus] = mapped_column(
        Enum(PaperStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=PaperStatus.PENDING,
    )

    # Relationships
    knowledge_card: Mapped["KnowledgeCard | None"] = relationship(
        "KnowledgeCard",
        back_populates="paper",
        uselist=False,
        cascade="all, delete-orphan",
    )
    paper_category: Mapped["PaperCategory | None"] = relationship(
        "PaperCategory",
        back_populates="paper",
        uselist=False,
        cascade="all, delete-orphan",
    )
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        "DocumentChunk",
        back_populates="paper",
        cascade="all, delete-orphan",
        order_by="DocumentChunk.page_num",
    )


class KnowledgeCard(Base):
    """Structured summary of a paper (One-to-One with Paper)."""

    __tablename__ = "knowledge_cards"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    core_problem: Mapped[str | None] = mapped_column(Text, nullable=True)
    methodology: Mapped[str | None] = mapped_column(Text, nullable=True)
    dataset: Mapped[str | None] = mapped_column(Text, nullable=True)
    results: Mapped[str | None] = mapped_column(Text, nullable=True)
    limitations: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    paper: Mapped["Paper"] = relationship("Paper", back_populates="knowledge_card")


class PaperCategory(Base):
    """Paper classification (One-to-One with Paper)."""

    __tablename__ = "paper_categories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    category: Mapped[PaperCategoryType] = mapped_column(
        Enum(PaperCategoryType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )

    # Relationships
    paper: Mapped["Paper"] = relationship("Paper", back_populates="paper_category")


class DocumentChunk(Base):
    """Text chunk with embedding for vector search (Many-to-One with Paper)."""

    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_num: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(1536),
        nullable=True,
    )

    # Relationships
    paper: Mapped["Paper"] = relationship("Paper", back_populates="chunks")
