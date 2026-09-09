import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("ZITADEL_ISSUER", "https://issuer.example.com/")
os.environ.setdefault("ZITADEL_JWKS_URI", "")
os.environ.setdefault("ZITADEL_AUDIENCE", "test-audience")
os.environ.setdefault("R2_ACCOUNT_ID", "test-account")
os.environ.setdefault("ACCESS_KEY_ID", "test-key")
os.environ.setdefault("SECRET_ACCESS_KEY", "test-secret")

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import pytest

from app.database import Base
from app.models import ActivityLog, Event, Participant, Session
from app.schemas import EventIn, ParticipantIn, SessionIn

from app.services import r2


@pytest.fixture
async def engine():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()


@pytest.fixture(autouse=True)
def _no_r2(monkeypatch):
    monkeypatch.setattr(r2, "_client", None)
    monkeypatch.setattr(r2, "_s3", lambda: pytest.fail("r2._s3 should not be reached in tests"))


def make_session_in(ordinal: int, label: str | None = None) -> SessionIn:
    return SessionIn(
        label=label or f"Session {ordinal}",
        date="2026-01-01",
        start_time="10:00",
        end_time="11:00",
        location="Main Hall",
    )


def make_event_in(n_sessions: int = 2, title: str = "Tech Talk") -> EventIn:
    return EventIn(
        title=title,
        category="General",
        description="desc",
        capacity=100,
        sessions=[make_session_in(i) for i in range(1, n_sessions + 1)],
    )


def make_participant_in(
    name: str = "Alice",
    student_id: str = "S1001",
    email: str = "alice@example.com",
) -> ParticipantIn:
    return ParticipantIn(name=name, student_id=student_id, email=email, phone="0123456789")
