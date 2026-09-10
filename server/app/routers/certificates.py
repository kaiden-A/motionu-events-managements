from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import UserPrincipal, get_current_user
from app.models import Certificate, CertificateTemplate, Event, Participant
from app.services import certificates as cert_svc
from app.services import events as event_svc
from app.services import r2
from app.services import tokens

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


class FieldConfig(BaseModel):
    key: Literal["name", "cert_no", "date"]
    x: float = 0
    y: float = 0
    font_size: float = 28
    color: str = "#1E3A8A"
    font: str = "Helvetica-Bold"

    @field_validator("x", "y")
    @classmethod
    def _non_negative(cls, v):
        if v < 0:
            raise ValueError("must be >= 0")
        return v

    @field_validator("font_size")
    @classmethod
    def _positive(cls, v):
        if v <= 0:
            raise ValueError("must be > 0")
        return v

    @field_validator("color")
    @classmethod
    def _hex_color(cls, v):
        if not v.startswith("#") or len(v) != 7:
            raise ValueError("must be #RRGGBB")
        int(v[1:], 16)
        return v

    @field_validator("font")
    @classmethod
    def _known_font(cls, v):
        if v not in cert_svc._FONTS:
            raise ValueError("unknown font")
        return v


class FieldsIn(BaseModel):
    fields: list[FieldConfig] = []

    @field_validator("fields")
    @classmethod
    def _unique_keys(cls, v):
        keys = [f.key for f in v]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate field key")
        return v


class TemplateOut(BaseModel):
    event_id: str
    file_name: str
    file_type: str
    file_size: int
    uploaded_at: str
    download_url: str | None = None
    fields: list[FieldConfig] = []


class CertificateOut(BaseModel):
    cert_no: str
    issued_at: str
    revoked_at: str | None = None
    download_url: str | None = None
    rendered: bool = False
    emailed: str | None = None


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


def _to_template_out(event: Event, tpl: CertificateTemplate) -> TemplateOut:
    return TemplateOut(
        event_id=event.id,
        file_name=tpl.file_name,
        file_type=tpl.file_type,
        file_size=tpl.file_size,
        uploaded_at=tpl.uploaded_at,
        download_url=r2.presign_get(tpl.r2_key),
        fields=[FieldConfig(**f) for f in (tpl.fields or [])],
    )


def _cert_download_url(cert: Certificate) -> str | None:
    if cert.rendered_key:
        return r2.presign_get(cert.rendered_key)
    if cert.template_key:
        return r2.presign_get(cert.template_key)
    return None


@router.get("/download/{cert_no}")
async def download_certificate(
    cert_no: str,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    if not tokens.verify_cert_download_token(cert_no, token):
        raise HTTPException(status_code=403, detail="Invalid download link")
    stmt = select(Certificate).where(Certificate.cert_no == cert_no)
    cert = (await db.execute(stmt)).scalar_one_or_none()
    if cert is None or cert.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Certificate not found")
    key = cert.rendered_key or cert.template_key
    if key is None:
        raise HTTPException(status_code=404, detail="Certificate file not available")
    return RedirectResponse(r2.presign_get(key, expires_in=300), status_code=307)


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
    file_type = data.file_type
    if file_type.startswith("image/") and file_type != "image/svg+xml":
        raw = r2.get_bytes(data.r2_key)
        try:
            pdf = cert_svc.image_to_pdf(raw)
        except ValueError as exc:
            try:
                r2.delete_object(data.r2_key)
            except Exception:
                pass
            raise HTTPException(
                status_code=400, detail="Could not read the uploaded image — try a PNG, JPEG or WebP file."
            ) from exc
        r2.put_bytes(data.r2_key, pdf, "application/pdf")
        file_type = "application/pdf"
    tpl = await cert_svc.create_template(
        db, event, data.r2_key, data.file_name, file_type, data.file_size, user.sub
    )
    await db.commit()
    return _to_template_out(event, tpl)


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
    return _to_template_out(event, tpl)


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
    return _to_template_out(event, tpl)


@router.put("/template/{event_id}/fields", response_model=TemplateOut)
async def save_template_fields(
    event_id: str,
    data: FieldsIn,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    event = await _get_event(db, event_id)
    if event.template is None:
        raise HTTPException(status_code=404, detail="No template set")
    if event.template.file_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Fields require a PDF template")
    event.template.fields = [f.model_dump() for f in data.fields]
    await event_svc.log_activity(
        db, "cert", f"Certificate fields updated for {event.title}", event.id, user.sub
    )
    await db.commit()
    return _to_template_out(event, event.template)


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
        download_url=_cert_download_url(cert),
        rendered=cert.rendered_key is not None,
        emailed=getattr(cert, "email_mode", None),
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
        download_url=_cert_download_url(cert),
        rendered=cert.rendered_key is not None,
        emailed=None,
    )