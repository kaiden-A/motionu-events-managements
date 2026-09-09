import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import UserPrincipal, get_current_user
from app.models import Certificate, CertificateTemplate, Event, Participant
from app.services import certificates as cert_svc
from app.services import events as event_svc
from app.services import participants as participant_svc
from app.services import r2

router = APIRouter(prefix="/certificates", tags=["certificates"])


class PresignIn(BaseModel):
    event_id: str
    file_name: str
    content_type: str
    file_size: int


class PresignOut(BaseModel):
    upload_url: str
    r2_key: str
    file_name: str


class ConfirmIn(BaseModel):
    event_id: str
    r2_key: str
    file_name: str
    file_type: str
    file_size: int


class TemplateOut(BaseModel):
    event_id: str
    file_name: str
    file_type: str
    file_size: int
    uploaded_at: str
    download_url: str | None = None


class CertificateOut(BaseModel):
    cert_no: str
    issued_at: str
    revoked_at: str | None = None
    download_url: str | None = None


async def _get_event(db: AsyncSession, event_id: str) -> Event:
    stmt = (
        select(Event)
        .where(Event.id == event_id)
        .options(
            selectinload(Event.template),
            selectinload(Event.participants).selectinload(Participant.attendance),
            selectinload(Event.participants).selectinload(Participant.certificates),
        )
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Program not found")
    return event


@router.post("/presign", response_model=PresignOut)
async def presign_upload(
    data: PresignIn,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    await _get_event(db, data.event_id)
    key = cert_svc._template_key(data.event_id, data.file_name)
    return PresignOut(
        upload_url=r2.presign_put(key, data.content_type),
        r2_key=key,
        file_name=data.file_name,
    )


@router.post("/confirm", response_model=TemplateOut)
async def confirm_template(
    data: ConfirmIn,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, data.event_id)
    tpl = await cert_svc.create_template(
        db, event, data.r2_key, data.file_name, data.file_type, data.file_size, user.sub
    )
    await db.commit()
    return TemplateOut(
        event_id=event.id,
        file_name=tpl.file_name,
        file_type=tpl.file_type,
        file_size=tpl.file_size,
        uploaded_at=tpl.uploaded_at,
        download_url=r2.presign_get(tpl.r2_key),
    )


@router.get("/template/{event_id}", response_model=TemplateOut | None)
async def get_template(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    tpl: CertificateTemplate | None = event.template
    if tpl is None:
        return None
    return TemplateOut(
        event_id=event.id,
        file_name=tpl.file_name,
        file_type=tpl.file_type,
        file_size=tpl.file_size,
        uploaded_at=tpl.uploaded_at,
        download_url=r2.presign_get(tpl.r2_key),
    )


@router.delete("/template/{event_id}", status_code=204)
async def remove_template(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    if event.template is None:
        raise HTTPException(status_code=404, detail="No template set")
    key = event.template.r2_key
    await db.delete(event.template)
    await db.flush()
    try:
        r2.delete_object(key)
    except Exception:
        pass
    await db.commit()


@router.post("/issue/{event_id}/{participant_id}", response_model=CertificateOut, status_code=201)
async def issue_certificate(
    event_id: str,
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    participant = next((p for p in event.participants if p.id == participant_id), None)
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found")
    try:
        cert = await cert_svc.issue_certificate(db, participant, event, user.sub)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    await db.commit()
    return CertificateOut(
        cert_no=cert.cert_no,
        issued_at=cert.issued_at,
        download_url=r2.presign_get(cert.template_key) if cert.template_key else None,
    )


@router.delete("/revoke/{event_id}/{participant_id}", status_code=204)
async def revoke_certificate(
    event_id: str,
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    participant = next((p for p in event.participants if p.id == participant_id), None)
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found")
    stmt = select(Certificate).where(
        Certificate.participant_id == participant.id, Certificate.revoked_at.is_(None)
    )
    cert = (await db.execute(stmt)).scalar_one_or_none()
    if cert is None:
        raise HTTPException(status_code=404, detail="No active certificate")
    await cert_svc.revoke_certificate(db, cert, user.sub)
    await db.commit()


@router.get("/cert/{participant_id}", response_model=CertificateOut | None)
async def get_certificate(
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    stmt = (
        select(Certificate)
        .where(Certificate.participant_id == participant_id, Certificate.revoked_at.is_(None))
    )
    cert = (await db.execute(stmt)).scalar_one_or_none()
    if cert is None:
        return None
    return CertificateOut(
        cert_no=cert.cert_no,
        issued_at=cert.issued_at,
        download_url=r2.presign_get(cert.template_key) if cert.template_key else None,
    )
