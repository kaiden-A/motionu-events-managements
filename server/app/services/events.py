import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityLog, Event, Session
from app.schemas import EventIn, EventOut, SessionIn, SessionOut


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def log_activity(
    db: AsyncSession, type_: str, text: str, event_id: str | None, actor_sub: str
) -> None:
    db.add(ActivityLog(type=type_, text=text, event_id=event_id, actor_sub=actor_sub))
    await db.flush()


async def _apply_sessions(db: AsyncSession, event_id: str, sessions: list[SessionIn]) -> None:
    """Replace an event's sessions with fresh rows (never assigns the
    relationship collection — that triggers lazy IO under async)."""
    existing = (await db.execute(select(Session).where(Session.event_id == event_id))).scalars().all()
    for row in existing:
        await db.delete(row)
    await db.flush()
    db.add_all(
        [
            Session(
                event_id=event_id,
                ordinal=i,
                label=s.label,
                date=s.date,
                start_time=s.start_time,
                end_time=s.end_time,
                location=s.location,
            )
            for i, s in enumerate(sessions, start=1)
        ]
    )
    await db.flush()


async def create_event(db: AsyncSession, data: EventIn, sub: str) -> Event:
    event = Event(
        title=data.title,
        category=data.category,
        description=data.description,
        capacity=data.capacity,
        cert_min_sessions=data.cert_min_sessions,
        created_by=sub,
    )
    db.add(event)
    await db.flush()
    await _apply_sessions(db, event.id, data.sessions)
    await log_activity(db, "event", f"Program created: {data.title}", event.id, sub)
    await db.flush()
    return event


async def update_event(db: AsyncSession, event: Event, data: dict, sub: str) -> Event:
    for key, value in data.items():
        if key == "sessions":
            continue
        if key == "cert_min_sessions" or value is not None:
            setattr(event, key, value)
    if "sessions" in data and data["sessions"] is not None:
        await _apply_sessions(db, event.id, data["sessions"])
    if event.cert_min_sessions is not None:
        count = (
            await db.execute(
                select(func.count()).select_from(Session).where(Session.event_id == event.id)
            )
        ).scalar_one()
        event.cert_min_sessions = min(event.cert_min_sessions, max(1, count))
    await db.flush()
    await log_activity(db, "event", f"Program updated: {event.title}", event.id, sub)
    return event


def to_session_out(s: Session) -> SessionOut:
    return SessionOut(
        id=s.id,
        ordinal=s.ordinal,
        label=s.label,
        date=s.date,
        start_time=s.start_time,
        end_time=s.end_time,
        location=s.location,
    )


def to_event_out(e: Event) -> EventOut:
    return EventOut(
        id=e.id,
        title=e.title,
        category=e.category,
        description=e.description,
        capacity=e.capacity,
        cert_min_sessions=e.cert_min_sessions,
        created_at=e.created_at,
        sessions=[to_session_out(s) for s in e.sessions],
        total_sessions=len(e.sessions),
    )


async def list_events(db: AsyncSession) -> list[Event]:
    stmt = select(Event).order_by(Event.created_at.desc())
    return list((await db.execute(stmt)).scalars().all())


def new_id() -> str:
    return str(uuid.uuid4())
