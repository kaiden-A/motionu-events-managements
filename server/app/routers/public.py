from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import require_form_key
from app.models import Event
from app.schemas import ParticipantIn, ParticipantOut
from app.services import participants as participant_svc

router = APIRouter(prefix="/public", tags=["public"])

PUBLIC_ACTOR = "public-form"


async def _get_event(db: AsyncSession, event_id: str) -> Event:
    stmt = (
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.sessions))
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Program not found")
    return event


@router.post("/events/{event_id}/participants", response_model=ParticipantOut)
async def add_public_participant(
    event_id: str,
    data: ParticipantIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_form_key),
):
    """Webhook for Google Form submissions (via Apps Script). Adds the
    participant to the program; repeat submissions return the existing record."""
    event = await _get_event(db, event_id)
    existing = await participant_svc.find_duplicate(db, event_id, data)
    if existing is not None:
        response.status_code = 200
        return participant_svc.to_participant_out(existing, event)

    participant = await participant_svc.add_participant(db, event, data, PUBLIC_ACTOR)
    await db.commit()
    response.status_code = 201
    return participant_svc.to_participant_out(participant, event)
