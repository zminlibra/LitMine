"""add_translation_cache_columns

Revision ID: eee387a2fe96
Revises: 6716693929ac
Create Date: 2026-05-11 02:35:49.037652
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'eee387a2fe96'
down_revision: str | None = '6716693929ac'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('papers', sa.Column('title_cn', sa.String(length=1000), nullable=True))
    op.add_column('papers', sa.Column('abstract_cn', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('papers', 'abstract_cn')
    op.drop_column('papers', 'title_cn')
