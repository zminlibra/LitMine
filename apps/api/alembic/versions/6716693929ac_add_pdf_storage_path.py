"""add_pdf_storage_path

Revision ID: 6716693929ac
Revises: 0001
Create Date: 2026-05-05 02:54:06.071792
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '6716693929ac'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('papers', sa.Column('pdf_storage_path', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('papers', 'pdf_storage_path')
