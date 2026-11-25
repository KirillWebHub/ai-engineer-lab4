"""Начальная схема: пользователи, роли, сессии и протоколы.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-22
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("label", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("login", sa.String(length=32), nullable=False),
        sa.Column("login_lower", sa.String(length=32), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_login_lower", "users", ["login_lower"], unique=True)

    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.String(length=32), nullable=False),
        sa.Column("permission", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("role_id", "permission"),
    )

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("role_id", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
    )

    op.create_table(
        "user_sessions",
        sa.Column("token_hash", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])

    op.create_table(
        "runs",
        sa.Column("id", sa.String(length=16), primary_key=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("robot", sa.String(length=64), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("reviewed_by_id", sa.String(length=36), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_runs_status",
        ),
        sa.ForeignKeyConstraint(["reviewed_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_runs_date", "runs", ["date"])


def downgrade() -> None:
    op.drop_index("ix_runs_date", table_name="runs")
    op.drop_table("runs")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_table("user_roles")
    op.drop_table("role_permissions")
    op.drop_index("ix_users_login_lower", table_name="users")
    op.drop_table("users")
    op.drop_table("roles")
