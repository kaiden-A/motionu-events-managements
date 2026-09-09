import re
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Attendance, Certificate, CertificateTemplate, Event, Participant
from app.services import events as event_svc
from app.services import r2


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _template_key(event_id: str, file_name: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9]+", "-", file_name).strip("-").lower() or "template"
    return f"events/{event_id}/templates/{_now_iso()}/{safe}"


async def all_sessions_attended(db: AsyncSession, participant: Participant) -> bool:
    stmt = select(Attendance.attended).where(Attendance.participant_id == participant.id)
    rows = (await db.execute(stmt)).scalars().all()
    return bool(rows) and all(r is True for r in rows)


async def next_cert_no(db: AsyncSession) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"MU-{year}-"
    stmt = select(func.count()).select_from(Certificate).where(Certificate.cert_no.like(prefix + "%"))
    count = (await db.execute(stmt)).scalar_one()
    return f"{prefix}{count + 1:04d}"


async def issue_certificate(
    db: AsyncSession, participant: Participant, event: Event, actor_sub: str
) -> Certificate:
    template = (
        await db.execute(
            select(CertificateTemplate).where(CertificateTemplate.event_id == event.id)
        )
    ).scalar_one_or_none()
    if template is None:
        raise ValueError("Set a certificate template for this program first.")
    if not await all_sessions_attended(db, participant):
        raise ValueError("Only participants who attended every session can receive a certificate.")
    existing = await db.execute(
        select(Certificate).where(
            Certificate.participant_id == participant.id, Certificate.revoked_at.is_(None)
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ValueError(f"{participant.name} already has a certificate.")
    cert = Certificate(
        participant_id=participant.id,
        event_id=event.id,
        cert_no=await next_cert_no(db),
        issued_at=_now_iso(),
        template_key=template.r2_key,
    )
    db.add(cert)
    await db.flush()
    await event_svc.log_activity(
        db, "cert", f"Certificate {cert.cert_no} issued to {participant.name} — {event.title}",
        event.id, actor_sub,
    )
    return cert


async def revoke_certificate(db: AsyncSession, cert: Certificate, actor_sub: str) -> None:
    cert.revoked_at = _now_iso()
    await db.flush()
    await event_svc.log_activity(
        db, "cert", f"Certificate {cert.cert_no} revoked", cert.event_id, actor_sub
    )


async def create_template(
    db: AsyncSession,
    event: Event,
    r2_key: str,
    file_name: str,
    file_type: str,
    file_size: int,
    actor_sub: str,
) -> CertificateTemplate:
    if event.template is not None:
        old = event.template
        await db.delete(old)
        await db.flush()
        try:
            r2.delete_object(old.r2_key)
        except Exception:
            pass
    tpl = CertificateTemplate(
        event_id=event.id,
        r2_key=r2_key,
        file_name=file_name,
        file_type=file_type,
        file_size=file_size,
        uploaded_by=actor_sub,
        uploaded_at=_now_iso(),
    )
    db.add(tpl)
    await db.flush()
    await event_svc.log_activity(
        db, "cert", f"Certificate template saved for {event.title}", event.id, actor_sub
    )
    return tpl
