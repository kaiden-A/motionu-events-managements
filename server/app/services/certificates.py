import io
import logging
import re
from datetime import datetime, timezone

from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Attendance, Certificate, CertificateTemplate, Event, Participant, Session
from app.services import events as event_svc
from app.services import mail as mail_svc
from app.services import r2
from app.services import tokens

logger = logging.getLogger("motionu.certificates")

FIELD_KEYS = ("name", "cert_no", "date")

_FONTS = {"Helvetica", "Helvetica-Bold", "Times-Roman", "Courier"}
_DEFAULT_FONT = "Helvetica-Bold"
_DEFAULT_COLOR = "#1E3A8A"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _template_key(event_id: str, file_name: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9]+", "-", file_name).strip("-").lower() or "template"
    return f"events/{event_id}/templates/{_now_iso()}/{safe}"


def _rendered_key(event_id: str, cert_no: str) -> str:
    return f"events/{event_id}/issued/{cert_no}.pdf"


def download_link(cert_no: str) -> str:
    base = get_settings().public_app_url.rstrip("/")
    return f"{base}/certificate/{cert_no}?token={tokens.cert_download_token(cert_no)}"


def image_to_pdf(data: bytes) -> bytes:
    """Embed a raster template (PNG/JPEG/WebP/…) on a single PDF page at 1:1
    (1 image pixel = 1 PDF point) so the same overlay pipeline can handle it.
    Raises ValueError if the bytes are not a readable image."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img.load()
    except Exception as exc:
        raise ValueError("not a readable image") from exc
    w, h = img.size
    packet = io.BytesIO()
    draw = canvas.Canvas(packet, pagesize=(w, h))
    draw.drawImage(ImageReader(img), 0, 0, width=w, height=h)
    draw.save()
    packet.seek(0)
    writer = PdfWriter()
    writer.append(packet)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def _field_value(field: dict, name: str, cert_no: str, issued_at: str) -> str:
    key = field.get("key")
    if key == "name":
        return name
    if key == "cert_no":
        return cert_no
    if key == "date":
        return mail_svc.fmt_date(issued_at)
    return ""


def render_certificate_pdf(
    template_bytes: bytes,
    fields: list[dict],
    name: str,
    cert_no: str,
    issued_at: str,
) -> bytes:
    """Overlay the placeholder fields (name, cert no, date) onto the template
    PDF. Each field's (x, y) is the center point in PDF points, origin at the
    bottom-left of the page. Returns a new PDF; the template is left untouched."""
    if not fields:
        return template_bytes
    reader = PdfReader(io.BytesIO(template_bytes))
    if not reader.pages:
        return template_bytes
    page = reader.pages[0]
    page_w = float(page.mediabox.width)
    page_h = float(page.mediabox.height)

    packet = io.BytesIO()
    draw = canvas.Canvas(packet, pagesize=(page_w, page_h))
    drew = False
    for field in fields:
        if field.get("key") not in FIELD_KEYS:
            continue
        text = _field_value(field, name, cert_no, issued_at)
        if not text:
            continue
        drew = True
        font = field.get("font") or _DEFAULT_FONT
        size = float(field.get("font_size") or 28)
        width = stringWidth(text, font, size)
        while width > page_w - 40 and size > 8:
            size *= 0.9
            width = stringWidth(text, font, size)
        try:
            color = HexColor(field.get("color") or _DEFAULT_COLOR)
        except Exception:
            color = HexColor(_DEFAULT_COLOR)
        draw.setFillColor(color)
        draw.setFont(font, size)
        draw.drawCentredString(
            float(field.get("x") or 0),
            float(field.get("y") or 0) + size * 0.36,
            text,
        )
    draw.save()
    packet.seek(0)
    if not drew:
        return template_bytes

    overlay_page = PdfReader(packet).pages[0]
    page.merge_page(overlay_page)
    writer = PdfWriter()
    writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


async def certificate_requirement(db: AsyncSession, event: Event) -> tuple[int, int]:
    """Returns (required, total) attended-session counts for a certificate."""
    total = (
        await db.execute(
            select(func.count()).select_from(Session).where(Session.event_id == event.id)
        )
    ).scalar_one()
    if event.cert_min_sessions is None:
        required = total
    else:
        required = min(event.cert_min_sessions, total)
    return required, total


async def qualifies_for_certificate(
    db: AsyncSession, event: Event, participant: Participant
) -> bool:
    required, _ = await certificate_requirement(db, event)
    attended = (
        await db.execute(
            select(func.count())
            .select_from(Attendance)
            .where(
                Attendance.participant_id == participant.id,
                Attendance.attended.is_(True),
            )
        )
    ).scalar_one()
    return attended >= required


async def next_cert_no(db: AsyncSession) -> str:
    """`MU-{year}-{0001+}` derived from the max existing number, so it survives
    cascade deletes (count-based numbering could reuse a number)."""
    year = datetime.now(timezone.utc).year
    prefix = f"MU-{year}-"
    stmt = select(func.max(Certificate.cert_no)).where(Certificate.cert_no.like(prefix + "%"))
    latest = (await db.execute(stmt)).scalar_one_or_none()
    if latest:
        seq = int(latest.rsplit("-", 1)[1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def send_certificate_email(
    event: Event, participant: Participant, cert: Certificate
) -> str:
    """Email the rendered certificate with a long-lived download link. Returns
    the delivery mode:

    - 'live'      sent through the provider, emailed_at recorded
    - 'simulated' provider not configured — recorded as sent for demo/dev
    - 'skipped'   provider failure or no rendered file — emailed_at kept unset
    """
    if cert.rendered_key is None:
        return "skipped"
    settings = get_settings()
    if not settings.email_enabled:
        logger.info("email provider not configured — simulated certificate email to %s", participant.email)
        cert.emailed_at = _now_iso()
        return "simulated"

    name_parts = participant.name.split()
    context = {
        "first_name": name_parts[0] if name_parts else participant.name,
        "participant_name": participant.name,
        "cert_no": cert.cert_no,
        "event_title": event.title,
        "issued_label": mail_svc.fmt_date(cert.issued_at),
        "download_url": download_link(cert.cert_no),
    }
    subject = f"Your Motion-U certificate - {event.title}"
    html = mail_svc.render_email("certificate.html", context)

    try:
        await mail_svc.send_html(participant.email, subject, html)
    except mail_svc.EmailError as exc:
        logger.warning("certificate email skipped for %s: %s", participant.email, exc)
        return "skipped"

    cert.emailed_at = _now_iso()
    logger.info("certificate emailed to %s (%s)", participant.email, event.title)
    return "live"


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
    required, total = await certificate_requirement(db, event)
    if not await qualifies_for_certificate(db, event, participant):
        if required >= total:
            raise ValueError(
                "Only participants who attended every session can receive a certificate."
            )
        raise ValueError(
            f"Only participants who attended at least {required} of {total} sessions "
            "can receive a certificate."
        )
    existing = await db.execute(
        select(Certificate).where(
            Certificate.participant_id == participant.id, Certificate.revoked_at.is_(None)
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ValueError(f"{participant.name} already has a certificate.")

    cert_no = await next_cert_no(db)
    rendered_key = None
    if template.file_type == "application/pdf":
        rendered_key = _rendered_key(event.id, cert_no)
        template_bytes = r2.get_bytes(template.r2_key)
        pdf = render_certificate_pdf(
            template_bytes,
            template.fields or [],
            participant.name,
            cert_no,
            _now_iso(),
        )
        r2.put_bytes(rendered_key, pdf, "application/pdf")

    cert = Certificate(
        participant_id=participant.id,
        event_id=event.id,
        cert_no=cert_no,
        issued_at=_now_iso(),
        template_key=template.r2_key,
        rendered_key=rendered_key,
    )
    db.add(cert)
    await db.flush()
    await event_svc.log_activity(
        db, "cert", f"Certificate {cert.cert_no} issued to {participant.name} — {event.title}",
        event.id, actor_sub,
    )
    cert.email_mode = None
    if rendered_key is not None:
        cert.email_mode = await send_certificate_email(event, participant, cert)
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