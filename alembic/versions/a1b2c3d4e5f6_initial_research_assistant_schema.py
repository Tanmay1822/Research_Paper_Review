"""Initial research assistant schema

Revision ID: a1b2c3d4e5f6
Revises: 47c29737c8dc
Create Date: 2026-03-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "47c29737c8dc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Drop legacy test tables
    op.drop_index(op.f("ix_test_items3_name"), table_name="test_items3")
    op.drop_index(op.f("ix_test_items3_id"), table_name="test_items3")
    op.drop_table("test_items3")
    op.drop_index(op.f("ix_test_items_name"), table_name="test_items")
    op.drop_index(op.f("ix_test_items_id"), table_name="test_items")
    op.drop_table("test_items")

    # Create papers table
    op.create_table(
        "papers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("title", sa.String(length=1024), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "pending", "processing", "completed", "failed", name="paperstatus"
            ),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_papers_filename"), "papers", ["filename"], unique=False)

    # Create knowledge_cards table
    op.create_table(
        "knowledge_cards",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("paper_id", sa.UUID(), nullable=False),
        sa.Column("core_problem", sa.Text(), nullable=True),
        sa.Column("methodology", sa.Text(), nullable=True),
        sa.Column("dataset", sa.Text(), nullable=True),
        sa.Column("results", sa.Text(), nullable=True),
        sa.Column("limitations", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("paper_id"),
    )

    # Create paper_categories table
    op.create_table(
        "paper_categories",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("paper_id", sa.UUID(), nullable=False),
        sa.Column(
            "category",
            sa.Enum("Review", "Empirical", "Theoretical", name="papercategorytype"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("paper_id"),
    )

    # Create document_chunks table
    op.create_table(
        "document_chunks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("paper_id", sa.UUID(), nullable=False),
        sa.Column("page_num", sa.Integer(), nullable=False),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_document_chunks_paper_id"),
        "document_chunks",
        ["paper_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop new tables (order matters for foreign keys)
    op.drop_index(
        op.f("ix_document_chunks_paper_id"), table_name="document_chunks"
    )
    op.drop_table("document_chunks")
    op.drop_table("paper_categories")
    op.drop_table("knowledge_cards")
    op.drop_index(op.f("ix_papers_filename"), table_name="papers")
    op.drop_table("papers")

    # Drop enums
    sa.Enum(name="papercategorytype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="paperstatus").drop(op.get_bind(), checkfirst=True)

    # Recreate legacy test tables (to match previous revision state)
    op.create_table(
        "test_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_test_items_id"), "test_items", ["id"], unique=False)
    op.create_index(op.f("ix_test_items_name"), "test_items", ["name"], unique=False)
    op.create_table(
        "test_items3",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_test_items3_id"), "test_items3", ["id"], unique=False)
    op.create_index(op.f("ix_test_items3_name"), "test_items3", ["name"], unique=False)
