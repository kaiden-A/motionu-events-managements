import logging

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models import Attendance, Event, Participant, Session
from app.schemas import AttendanceOut, ParticipantIn, ParticipantOut
from app.services import events as event_svc
from app.services import mail as mail_svc
from app.services import tokens

logger = logging.getLogger("motionu.mail")


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

    today = event_svc._now_iso()
    sessions = _sort_sessions(event)
    for s in sessions:
        missed = bool(s.date) and s.date < today
        db.add(
            Attendance(
                session_id=s.id,
                participant_id=participant.id,
                attended=False if missed else None,
                qr_token=None if missed else tokens.generate_token(),
            )
        )
    await db.flush()
    await db.refresh(participant, attribute_names=["attendance"])
    await event_svc.log_activity(
        db, "register", f"{data.name} added to {event.title}", event.id, sub
    )
    return participant


async def find_duplicate(
    db: AsyncSession, event_id: str, data: ParticipantIn
) -> Participant | None:
    """Existing roster member in the same program with the same email or
    student ID (case-insensitive). Keeps the public form webhook idempotent."""
    stmt = (
        select(Participant)
        .where(
            Participant.event_id == event_id,
            or_(
                func.lower(Participant.email) == data.email.strip().lower(),
                func.lower(Participant.student_id) == data.student_id.strip().lower(),
            ),
        )
        .options(selectinload(Participant.attendance))
    )
    return (await db.execute(stmt)).scalars().first()


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


async def unlock_pass(
    db: AsyncSession, participant: Participant, session: Session
) -> Attendance | None:
    """Generate the token for a specific session if it doesn't have one yet."""
    stmt = select(Attendance).where(
        Attendance.session_id == session.id,
        Attendance.participant_id == participant.id,
    )
    a = (await db.execute(stmt)).scalar_one_or_none()
    if a is None:
        return None
    if a.qr_token is None:
        a.qr_token = tokens.generate_token()
        a.qr_sent_at = None
        await db.flush()
    return a


async def unlock_next_pass(
    db: AsyncSession, participant: Participant, event: Event, session: Session
) -> Attendance | None:
    """Generate the token for the next session if it doesn't have one yet."""
    nxt = await next_session_after(db, event, session)
    if nxt is None:
        return None
    return await unlock_pass(db, participant, nxt)


async def deliver_qr_pass(
    db: AsyncSession,
    event: Event,
    participant: Participant,
    attendance: Attendance,
    *,
    strict: bool = False,
) -> str:
    """Render the QR pass from the Jinja2 template and deliver it through the
    configured provider. Returns the mode used:

    - 'live'      sent through the provider and qr_sent_at recorded
    - 'simulated' provider not configured — recorded as sent for demo/dev
    - 'skipped'   provider failure, best-effort (strict=False): qr_sent_at kept unset

    With strict=True an EmailError is re-raised and nothing is recorded."""
    if not get_settings().email_enabled:
        logger.info("email provider not configured — simulated send to %s", participant.email)
        attendance.qr_sent_at = event_svc._now_iso()
        await db.flush()
        return "simulated"

    session = next(
        (s for s in event.sessions if s.id == attendance.session_id), None
    )
    if session is None:
        raise ValueError(f"attendance {attendance.id} has no matching session")
    if not attendance.qr_token:
        raise ValueError(f"attendance {attendance.id} has no QR token")

    name_parts = participant.name.split()
    context = {
        "first_name": name_parts[0] if name_parts else participant.name,
        "participant_name": participant.name,
        "student_id": participant.student_id,
        "event_title": event.title,
        "session_label": session.label,
        "date_label": mail_svc.fmt_date(session.date),
        "time_label": mail_svc.fmt_time_range(session.start_time, session.end_time),
        "location": session.location,
        "token": attendance.qr_token,
        "qr_rows": mail_svc.qr_matrix(attendance.qr_token),
    }
    subject = f"Motion-U QR Pass — {event.title} · {session.label}"
    html = mail_svc.render_email("qr_pass.html", context)

    try:
        await mail_svc.send_html(participant.email, subject, html)
    except mail_svc.EmailError as exc:
        if strict:
            raise
        logger.warning("auto email skipped for %s: %s", participant.email, exc)
        return "skipped"

    attendance.qr_sent_at = event_svc._now_iso()
    await db.flush()
    logger.info("QR pass emailed to %s (%s)", participant.email, event.title)
    return "live"
