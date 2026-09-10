"""certificate_fields_rendered

Add placeholder field config to certificate templates and rendered-file
tracking to issued certificates.

Revision ID: b2c3d4e5f6a7
Revises: 73a640f967d7
Create Date: 2026-09-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = '73a640f967d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('certificate_templates', sa.Column('fields', sa.JSON(), nullable=True))
    op.add_column('certificates', sa.Column('rendered_key', sa.String(length=500), nullable=True))
    op.add_column('certificates', sa.Column('emailed_at', sa.String(length=10), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('certificates', 'emailed_at')
    op.drop_column('certificates', 'rendered_key')
    op.drop_column('certificate_templates', 'fields')