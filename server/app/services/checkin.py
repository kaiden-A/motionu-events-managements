from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Attendance, Event, Participant, Session
from app.services import events as event_svc
from app.services import participants as participant_svc


class CheckinError(Exception):
    def __init__(self, detail: str, status_code: int = 409):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


async def resolve_token(db: AsyncSession, token: str) -> tuple[Attendance, Session, Participant, Event]:
    stmt = (
        select(Attendance)
        .where(Attendance.qr_token == token)
        .options(
            selectinload(Attendance.session),
            selectinload(Attendance.participant).selectinload(Participant.attendance),
            selectinload(Attendance.participant)
            .selectinload(Participant.event)
            .selectinload(Event.sessions),
        )
    )
    attendance = (await db.execute(stmt)).scalar_one_or_none()
    if attendance is None:
        raise CheckinError("Code not found in any roster.", 404)
    session = attendance.session
    participant = attendance.participant
    event = participant.event
    return attendance, session, participant, event


async def mark_attended(
    db: AsyncSession, attendance: Attendance, joined_by: str = "qr"
) -> bool:
    """Atomic, idempotent attendance write. Returns True if this scan marked it,
    False if it was already attended."""
    result = await db.execute(
        update(Attendance)
        .where(Attendance.id == attendance.id, Attendance.attended.is_(None))
        .values(
            attended=True,
            joined_by=joined_by,
            joined_at=datetime.now(timezone.utc),
        )
    )
    if result.rowcount == 0:
        return False
    await db.flush()
    return True


async def checkin(db: AsyncSession, token: str, actor_sub: str) -> dict:
    attendance, session, participant, event = await resolve_token(db, token)

    marked = await mark_attended(db, attendance, joined_by="qr")
    if not marked:
        raise CheckinError(
            f"{participant.name} already attended {session.label}.", 409
        )

    next_unlocked = False
    unlocked = await participant_svc.unlock_next_pass(db, participant, event, session)
    if unlocked is not None and unlocked.qr_sent_at is None:
        await participant_svc.deliver_qr_pass(db, event, participant, unlocked)
        next_unlocked = True

    await event_svc.log_activity(
        db,
        "join",
        f"{participant.name} joined {session.label} of {event.title} via QR scan",
        event.id,
        actor_sub,
    )
    await db.commit()
    await db.refresh(attendance)
    return {
        "participant": participant_svc.to_participant_out(participant, event),
        "event": event_svc.to_event_out(event),
        "session": event_svc.to_session_out(session),
        "next_unlocked": next_unlocked,
    }
