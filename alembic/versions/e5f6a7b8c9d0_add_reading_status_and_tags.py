"""Add reading_status and tags to papers.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-27
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    readingstatus = postgresql.ENUM(
        "to_read", "reading", "done", name="readingstatus", create_type=True
    )
    readingstatus.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "papers",
        sa.Column(
            "reading_status",
            sa.Enum("to_read", "reading", "done", name="readingstatus"),
            nullable=True,
        ),
    )
    op.add_column(
        "papers",
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.String(length=128)),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("papers", "tags")
    op.drop_column("papers", "reading_status")
    op.execute("DROP TYPE IF EXISTS readingstatus")
