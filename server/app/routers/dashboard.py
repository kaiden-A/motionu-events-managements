from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import UserPrincipal, get_current_user
from app.models import ActivityLog, Attendance, Certificate, Event, Participant
from app.schemas import EventOut
from app.services import events as event_svc

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class StatItem(BaseModel):
    label: str
    value: int


class ActivityItem(BaseModel):
    type: str
    text: str
    created_at: str


class DashboardOut(BaseModel):
    events: int
    participants: int
    certificates: int
    attendance_rate: int
    activity: list[ActivityItem]
    events_list: list[EventOut]


@router.get("", response_model=DashboardOut)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    events = (
        await db.execute(
            select(Event)
            .options(
                selectinload(Event.sessions),
                selectinload(Event.participants).selectinload(Participant.attendance),
            )
            .order_by(Event.created_at.desc())
        )
    ).scalars().all()

    participants = sum(len(e.participants) for e in events)
    certificates = (
        await db.execute(
            select(func.count()).select_from(Certificate).where(Certificate.revoked_at.is_(None))
        )
    ).scalar_one()

    marked = 0
    joined = 0
    for e in events:
        for p in e.participants:
            for a in p.attendance:
                if a.attended is not None:
                    marked += 1
                    if a.attended:
                        joined += 1
    attendance_rate = round((joined / marked) * 100) if marked else 0

    activity = (
        await db.execute(select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(10))
    ).scalars().all()

    return DashboardOut(
        events=len(events),
        participants=participants,
        certificates=certificates,
        attendance_rate=attendance_rate,
        activity=[
            ActivityItem(
                type=a.type,
                text=a.text,
                created_at=a.created_at.strftime("%Y-%m-%d %H:%M"),
            )
            for a in activity
        ],
        events_list=[event_svc.to_event_out(e) for e in events],
    )
