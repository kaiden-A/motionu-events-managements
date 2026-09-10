from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import UserPrincipal, get_current_user
from app.models import Attendance, Event, Participant, Session
from app.schemas import ParticipantIn, ParticipantOut, ParticipantUpdateIn
from app.services import events as event_svc
from app.services import mail as mail_svc
from app.services import participants as participant_svc

router = APIRouter(prefix="/events/{event_id}/participants", tags=["participants"])


async def _get_event(db: AsyncSession, event_id: str) -> Event:
    stmt = (
        select(Event)
        .where(Event.id == event_id)
        .options(
            selectinload(Event.sessions),
            selectinload(Event.participants).selectinload(Participant.attendance),
        )
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Program not found")
    return event


async def _get_participant(db: AsyncSession, event: Event, participant_id: str) -> Participant:
    for p in event.participants:
        if p.id == participant_id:
            return p
    raise HTTPException(status_code=404, detail="Participant not found")


@router.get("", response_model=list[ParticipantOut])
async def list_participants(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    return [participant_svc.to_participant_out(p, event) for p in event.participants]


@router.post("", response_model=ParticipantOut, status_code=201)
async def add_participant(
    event_id: str,
    data: ParticipantIn,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    participant = await participant_svc.add_participant(db, event, data, user.sub)
    await db.commit()
    return participant_svc.to_participant_out(participant, event)


@router.put("/{participant_id}", response_model=ParticipantOut)
async def update_participant(
    event_id: str,
    participant_id: str,
    data: ParticipantUpdateIn,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    p = await _get_participant(db, event, participant_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(p, key, value)
    await db.commit()
    return participant_svc.to_participant_out(p, event)


@router.delete("/{participant_id}", status_code=204)
async def remove_participant(
    event_id: str,
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    p = await _get_participant(db, event, participant_id)
    await db.delete(p)
    await db.commit()


@router.post("/{participant_id}/attendance")
async def set_attendance(
    event_id: str,
    participant_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    session_id = payload.get("session_id")
    attended = payload.get("attended")
    if not session_id or attended not in (True, False):
        raise HTTPException(status_code=422, detail="session_id and attended (bool) required")
    event = await _get_event(db, event_id)
    p = await _get_participant(db, event, participant_id)

    stmt = select(Attendance).where(
        Attendance.session_id == session_id,
        Attendance.participant_id == p.id,
    )
    att = (await db.execute(stmt)).scalar_one_or_none()
    if att is None:
        raise HTTPException(status_code=404, detail="Attendance row not found")

    session = next((s for s in event.sessions if s.id == session_id), None)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if attended:
        att.attended = True
        att.joined_by = "manual"
        att.joined_at = datetime.now(timezone.utc)
        unlocked = await participant_svc.unlock_next_pass(db, p, event, session)
        if unlocked is not None and unlocked.qr_sent_at is None:
            await participant_svc.deliver_qr_pass(db, event, p, unlocked)
        await event_svc.log_activity(
            db, "join", f"{p.name} joined {session.label} of {event.title}", event.id, user.sub
        )
    else:
        att.attended = False
        att.joined_by = None
        await event_svc.log_activity(
            db, "no-show", f"{p.name} marked no-show for {session.label} of {event.title}",
            event.id, user.sub,
        )
    await db.commit()
    return participant_svc.to_participant_out(p, event)


@router.post("/{participant_id}/unlock/{session_id}", response_model=ParticipantOut)
async def unlock_pass(
    event_id: str,
    participant_id: str,
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    p = await _get_participant(db, event, participant_id)
    session = next((s for s in event.sessions if s.id == session_id), None)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    att = await participant_svc.unlock_pass(db, p, session)
    if att is None:
        raise HTTPException(status_code=404, detail="Attendance row not found")
    await event_svc.log_activity(
        db, "qr", f"QR pass unlocked for {p.name} — {session.label} of {event.title}",
        event.id, user.sub,
    )
    await db.commit()
    return participant_svc.to_participant_out(p, event)


@router.post("/{participant_id}/send-pass/{session_id}")
async def send_pass(
    event_id: str,
    participant_id: str,
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    p = await _get_participant(db, event, participant_id)
    stmt = select(Attendance).where(
        Attendance.session_id == session_id,
        Attendance.participant_id == p.id,
    )
    att = (await db.execute(stmt)).scalar_one_or_none()
    if att is None or att.qr_token is None:
        raise HTTPException(status_code=409, detail="Pass not unlocked for this session yet")
    try:
        mode = await participant_svc.deliver_qr_pass(db, event, p, att, strict=True)
    except mail_svc.EmailError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    await event_svc.log_activity(
        db, "qr", f"QR pass emailed to {p.name} — {event.title}", event.id, user.sub
    )
    await db.commit()
    return {
        "ok": True,
        "sent": mode == "live",
        "mode": mode,
        "to": p.email,
        "session_id": session_id,
    }
