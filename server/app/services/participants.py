from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Attendance, Event, Participant, Session
from app.schemas import AttendanceOut, ParticipantIn, ParticipantOut
from app.services import events as event_svc
from app.services import tokens


def _sort_sessions(event: Event) -> list[Session]:
    return sorted(event.sessions, key=lambda s: s.ordinal)


def to_attendance_out(a: Attendance, s: Session) -> AttendanceOut:
    return AttendanceOut(
        session_id=a.session_id,
        ordinal=s.ordinal,
        label=s.label,
        date=s.date,
        attended=a.attended,
        joined_by=a.joined_by,
        joined_at=a.joined_at,
        qr_token=a.qr_token,
        qr_sent_at=a.qr_sent_at,
    )


def to_participant_out(p: Participant, event: Event) -> ParticipantOut:
    sessions = _sort_sessions(event)
    by_id = {s.id: s for s in sessions}
    rows = sorted(p.attendance, key=lambda a: by_id[a.session_id].ordinal)
    return ParticipantOut(
        id=p.id,
        event_id=p.event_id,
        name=p.name,
        student_id=p.student_id,
        email=p.email,
        phone=p.phone,
        added_at=p.added_at,
        attendance=[to_attendance_out(a, by_id[a.session_id]) for a in rows],
    )


async def add_participant(
    db: AsyncSession, event: Event, data: ParticipantIn, sub: str
) -> Participant:
    participant = Participant(
        event_id=event.id,
        name=data.name,
        student_id=data.student_id,
        email=data.email,
        phone=data.phone,
        added_at=event_svc._now_iso(),
        created_by=sub,
    )
    db.add(participant)
    await db.flush()

    sessions = _sort_sessions(event)
    for i, s in enumerate(sessions):
        token = tokens.generate_token() if i == 0 else None
        db.add(
            Attendance(
                session_id=s.id,
                participant_id=participant.id,
                qr_token=token,
            )
        )
    await db.flush()
    await db.refresh(participant, attribute_names=["attendance"])
    await event_svc.log_activity(
        db, "register", f"{data.name} added to {event.title}", event.id, sub
    )
    return participant


async def find_attendance_by_token(
    db: AsyncSession, token: str
) -> Attendance | None:
    stmt = select(Attendance).where(Attendance.qr_token == token)
    return (await db.execute(stmt)).scalar_one_or_none()


async def next_session_after(db: AsyncSession, event: Event, session: Session) -> Session | None:
    sessions = _sort_sessions(event)
    for s in sessions:
        if s.ordinal > session.ordinal:
            return s
    return None


async def unlock_next_pass(
    db: AsyncSession, participant: Participant, event: Event, session: Session
) -> Attendance | None:
    """Generate the token for the next session if it doesn't have one yet."""
    nxt = await next_session_after(db, event, session)
    if nxt is None:
        return None
    stmt = select(Attendance).where(
        Attendance.session_id == nxt.id,
        Attendance.participant_id == participant.id,
    )
    a = (await db.execute(stmt)).scalar_one_or_none()
    if a is None or a.qr_token is not None:
        return a if a else None
    a.qr_token = tokens.generate_token()
    a.qr_sent_at = None
    await db.flush()
    return a


async def send_pass_stub(db: AsyncSession, attendance: Attendance) -> None:
    """Stub email delivery: record that the pass was sent. Real email provider
    will be wired in later per product guidelines."""
    attendance.qr_sent_at = event_svc._now_iso()
    await db.flush()
