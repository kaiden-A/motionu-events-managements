from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import UserPrincipal, get_current_user
from app.models import Event, Participant
from app.schemas import EventIn, EventOut, EventUpdateIn
from app.services import events as event_svc

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventOut])
async def list_events(
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    stmt = (
        select(Event)
        .options(selectinload(Event.sessions))
        .order_by(Event.created_at.desc())
    )
    events = (await db.execute(stmt)).scalars().all()
    return [event_svc.to_event_out(e) for e in events]


@router.post("", response_model=EventOut, status_code=201)
async def create_event(
    data: EventIn,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await event_svc.create_event(db, data, user.sub)
    await db.commit()
    return event_svc.to_event_out(await _get_event(db, event.id))


async def _get_event(db: AsyncSession, event_id: str) -> Event:
    stmt = (
        select(Event)
        .where(Event.id == event_id)
        .options(
            selectinload(Event.sessions),
            selectinload(Event.participants).selectinload(Participant.attendance),
            selectinload(Event.template),
        )
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Program not found")
    return event


@router.get("/{event_id}", response_model=EventOut)
async def get_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    return event_svc.to_event_out(event)


@router.put("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: str,
    data: EventUpdateIn,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    payload = data.model_dump(exclude_unset=True)
    await event_svc.update_event(db, event, payload, user.sub)
    await db.commit()
    return event_svc.to_event_out(await _get_event(db, event_id))


@router.delete("/{event_id}", status_code=204)
async def delete_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    await db.delete(event)
    await db.commit()
