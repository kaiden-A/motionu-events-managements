import io
import re
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.responses import RedirectResponse
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models import Certificate, Event, Participant
from app.routers.certificates import download_certificate
from app.services import certificates as cert_svc
from app.services import events as event_svc
from app.services import mail as mail_svc
from app.services import participants as participant_svc
from app.services import tokens

from tests.conftest import make_event_in, make_participant_in


async def _event_with_sessions(db, cert_min_sessions=None):
    event = await event_svc.create_event(
        db, make_event_in(n_sessions=2, cert_min_sessions=cert_min_sessions), sub="u"
    )
    stmt = select(Event).where(Event.id == event.id).options(selectinload(Event.sessions))
    return (await db.execute(stmt)).scalar_one()


async def _reload_event_with_template(db, event_id):
    stmt = (
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.sessions), selectinload(Event.template))
        .execution_options(populate_existing=True)
    )
    return (await db.execute(stmt)).scalar_one()


async def _event_with_template(db, cert_min_sessions=None):
    event = await _event_with_sessions(db, cert_min_sessions=cert_min_sessions)
    return await _reload_event_with_template(db, event.id)


async def _add_participant(db, event):
    p = await participant_svc.add_participant(db, event, make_participant_in(), sub="u")
    stmt = (
        select(Participant)
        .where(Participant.id == p.id)
        .options(selectinload(Participant.attendance))
    )
    return (await db.execute(stmt)).scalar_one()


async def _set_attendance(db, participant, sessions):
    for s in sessions:
        a = next(x for x in participant.attendance if x.session_id == s.id)
        a.attended = True
        a.joined_by = "manual"
        await db.flush()


async def _add_template(db, event, key="events/e1/tpl.png", file_name="tpl.png", file_type="image/png"):
    return await cert_svc.create_template(
        db, event, r2_key=key, file_name=file_name, file_type=file_type, file_size=1024, actor_sub="u"
    )


# ---------- pure helpers ----------


def test_template_key_slugifies():
    key = cert_svc._template_key("evt-1", "My Certificate (Final).png")
    assert key.startswith("events/evt-1/templates/")
    assert key.endswith("my-certificate-final-png")
    assert re.fullmatch(r"events/[^/]+/templates/\d{4}-\d{2}-\d{2}/[a-z0-9-]+", key)


def test_template_key_empty_name_falls_back():
    key = cert_svc._template_key("evt-1", "!!!")
    assert key.endswith("template")


def test_download_link_points_to_frontend():
    link = cert_svc.download_link("MU-2026-0001")
    assert link.startswith(get_settings().public_app_url)
    assert "/certificate/MU-2026-0001?token=" in link


async def test_next_cert_no_format(db):
    no = await cert_svc.next_cert_no(db)
    assert re.fullmatch(r"MU-\d{4}-\d{4}", no)


async def test_next_cert_no_increments(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    first = await cert_svc.next_cert_no(db)
    assert first.endswith("0001")
    await cert_svc.issue_certificate(db, p, event, "u")
    second = await cert_svc.next_cert_no(db)
    assert second.endswith("0002")


async def test_next_cert_no_does_not_reuse_deleted_number(db):
    year = datetime.now(timezone.utc).year

    async def add(seq):
        c = Certificate(
            id=str(uuid.uuid4()),
            participant_id="p-x",
            event_id="e-x",
            cert_no=f"MU-{year}-{seq:04d}",
            issued_at="2026-01-01",
        )
        db.add(c)
        await db.flush()

    await add(1)
    await add(2)
    row = (
        await db.execute(select(Certificate).where(Certificate.cert_no == f"MU-{year}-0001"))
    ).scalar_one()
    await db.delete(row)
    await db.flush()
    # count-based numbering would return 0002 here and collide with the
    # surviving row; max-based numbering skips ahead.
    assert await cert_svc.next_cert_no(db) == f"MU-{year}-0003"


async def test_certificate_requirement_defaults_to_all(db):
    event = await _event_with_sessions(db)
    required, total = await cert_svc.certificate_requirement(db, event)
    assert (required, total) == (2, 2)


async def test_certificate_requirement_uses_min_sessions(db):
    event = await _event_with_sessions(db, cert_min_sessions=1)
    required, total = await cert_svc.certificate_requirement(db, event)
    assert (required, total) == (1, 2)


async def test_qualifies_true_when_all_attended(db):
    event = await _event_with_sessions(db)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    assert await cert_svc.qualifies_for_certificate(db, event, p) is True


async def test_qualifies_false_when_missing(db):
    event = await _event_with_sessions(db)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, [event.sessions[0]])
    assert await cert_svc.qualifies_for_certificate(db, event, p) is False


async def test_qualifies_false_when_empty(db):
    event = await _event_with_sessions(db)
    p = await _add_participant(db, event)
    assert await cert_svc.qualifies_for_certificate(db, event, p) is False


async def test_qualifies_with_min_sessions(db):
    event = await _event_with_sessions(db, cert_min_sessions=1)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, [event.sessions[0]])
    assert await cert_svc.qualifies_for_certificate(db, event, p) is True


# ---------- issue / revoke ----------


async def test_issue_requires_template(db):
    event = await _event_with_sessions(db)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    with pytest.raises(ValueError, match="template"):
        await cert_svc.issue_certificate(db, p, event, "u")


async def test_issue_requires_full_attendance(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, [event.sessions[0]])
    with pytest.raises(ValueError, match="every session"):
        await cert_svc.issue_certificate(db, p, event, "u")


async def test_issue_below_min_sessions_message(db):
    event = await _event_with_template(db, cert_min_sessions=1)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    with pytest.raises(ValueError, match="at least 1 of 2"):
        await cert_svc.issue_certificate(db, p, event, "u")


async def test_issue_succeeds_with_min_sessions(db):
    event = await _event_with_template(db, cert_min_sessions=1)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, [event.sessions[0]])
    cert = await cert_svc.issue_certificate(db, p, event, "u")
    assert cert.cert_no.startswith("MU-")


async def test_issue_prevents_duplicate(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    await cert_svc.issue_certificate(db, p, event, "u")
    with pytest.raises(ValueError, match="already has a certificate"):
        await cert_svc.issue_certificate(db, p, event, "u")


async def test_issue_success(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    cert = await cert_svc.issue_certificate(db, p, event, "u")
    assert cert.cert_no.startswith("MU-")
    assert cert.participant_id == p.id
    assert cert.event_id == event.id
    assert cert.template_key == "events/e1/tpl.png"
    assert cert.issued_at
    assert cert.revoked_at is None


async def test_revoke_certificate(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    cert = await cert_svc.issue_certificate(db, p, event, "u")
    assert cert.revoked_at is None
    await cert_svc.revoke_certificate(db, cert, "u")
    assert cert.revoked_at is not None


# ---------- download ----------


async def _add_cert(db, cert_no="MU-2026-0042", revoked_at=None):
    cert = Certificate(
        id=str(uuid.uuid4()),
        participant_id="p-x",
        event_id="e-x",
        cert_no=cert_no,
        issued_at="2026-01-01",
        revoked_at=revoked_at,
        template_key="events/e-x/tpl.pdf",
        rendered_key="events/e-x/issued/cert.pdf",
    )
    db.add(cert)
    await db.flush()
    return cert


async def test_download_rejects_bad_token(db):
    await _add_cert(db)
    with pytest.raises(HTTPException) as exc:
        await download_certificate("MU-2026-0042", "not-the-token", db)
    assert exc.value.status_code == 403


async def test_download_unknown_cert(db):
    token = tokens.cert_download_token("MU-2026-9999")
    with pytest.raises(HTTPException) as exc:
        await download_certificate("MU-2026-9999", token, db)
    assert exc.value.status_code == 404


async def test_download_revoked_cert(db):
    await _add_cert(db, revoked_at="2026-02-01")
    token = tokens.cert_download_token("MU-2026-0042")
    with pytest.raises(HTTPException) as exc:
        await download_certificate("MU-2026-0042", token, db)
    assert exc.value.status_code == 404


async def test_download_redirects_to_presigned_url(db, monkeypatch):
    await _add_cert(db)
    monkeypatch.setattr(
        cert_svc.r2, "presign_get", lambda key, expires_in=3600: f"https://dl/{key}"
    )
    token = tokens.cert_download_token("MU-2026-0042")
    resp = await download_certificate("MU-2026-0042", token, db)
    assert isinstance(resp, RedirectResponse)
    assert resp.status_code == 307
    assert resp.headers["location"] == "https://dl/events/e-x/issued/cert.pdf"


# ---------- rendering ----------


def _sample_pdf_bytes(width=595, height=842) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    c.drawString(50, 400, "Template")
    c.save()
    buf.seek(0)
    return buf.read()


def _sample_png_bytes(width=800, height=600) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (width, height), "#EEF2FF").save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


def test_image_to_pdf_page_size_matches_image():
    png = _sample_png_bytes(800, 600)
    pdf = cert_svc.image_to_pdf(png)
    page = PdfReader(io.BytesIO(pdf)).pages[0]
    assert float(page.mediabox.width) == 800
    assert float(page.mediabox.height) == 600


def test_image_to_pdf_rejects_invalid_bytes():
    with pytest.raises(ValueError, match="not a readable image"):
        cert_svc.image_to_pdf(b"not an image at all")


def test_render_overlays_fields():
    fields = [
        {"key": "name", "x": 300, "y": 400, "font_size": 32, "color": "#1E3A8A", "font": "Helvetica-Bold"},
        {"key": "cert_no", "x": 300, "y": 360, "font_size": 16, "color": "#334155", "font": "Helvetica"},
        {"key": "date", "x": 300, "y": 330, "font_size": 14, "color": "#334155", "font": "Helvetica"},
    ]
    pdf = cert_svc.render_certificate_pdf(
        _sample_pdf_bytes(), fields, "Alice Tan", "MU-2026-0001", "2026-09-10"
    )
    text = PdfReader(io.BytesIO(pdf)).pages[0].extract_text()
    assert "Alice Tan" in text
    assert "MU-2026-0001" in text
    assert "Sep 2026" in text


def test_render_returns_original_without_fields():
    src = _sample_pdf_bytes()
    assert cert_svc.render_certificate_pdf(src, [], "A", "B", "C") == src


def test_render_skips_unknown_field_keys():
    fields = [{"key": "logo", "x": 10, "y": 10, "font_size": 12}]
    pdf = cert_svc.render_certificate_pdf(_sample_pdf_bytes(), fields, "A", "B", "C")
    text = PdfReader(io.BytesIO(pdf)).pages[0].extract_text()
    assert "A" not in text


# ---------- issue chain: render + email ----------


async def _pdf_template_event(db, monkeypatch):
    event = await _event_with_template(db)
    pdf_bytes = _sample_pdf_bytes()
    monkeypatch.setattr(cert_svc.r2, "get_bytes", lambda key: pdf_bytes)
    await _add_template(db, event, key="events/e1/tpl.pdf", file_name="tpl.pdf", file_type="application/pdf")
    event = await _reload_event_with_template(db, event.id)
    event.template.fields = [
        {"key": "name", "x": 300, "y": 400, "font_size": 32, "color": "#1E3A8A", "font": "Helvetica-Bold"}
    ]
    await db.flush()
    return event


async def test_issue_pdf_template_renders_and_records(db, monkeypatch):
    uploaded = []

    def fake_put(key, data, content_type):
        uploaded.append((key, content_type))
        assert b"Alice" in data

    monkeypatch.setattr(cert_svc.r2, "put_bytes", fake_put)
    event = await _pdf_template_event(db, monkeypatch)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    cert = await cert_svc.issue_certificate(db, p, event, "u")
    assert cert.rendered_key == f"events/{event.id}/issued/{cert.cert_no}.pdf"
    assert uploaded == [(cert.rendered_key, "application/pdf")]
    # email provider disabled by conftest → simulated send, recorded
    assert cert.emailed_at is not None
    assert cert.email_mode == "simulated"


async def test_issue_pdf_template_email_live(db, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "email_api", "http://provider.test/api/v1")
    monkeypatch.setattr(settings, "api_key", "secret")
    sent = []

    async def fake_send(to_email, subject, html_content, from_email=None):
        sent.append((to_email, subject, html_content))

    monkeypatch.setattr(cert_svc.mail_svc, "send_html", fake_send)
    monkeypatch.setattr(cert_svc.r2, "put_bytes", lambda *a, **k: None)
    event = await _pdf_template_event(db, monkeypatch)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    cert = await cert_svc.issue_certificate(db, p, event, "u")
    assert len(sent) == 1
    assert sent[0][0] == "alice@example.com"
    assert "Tech Talk" in sent[0][1]
    assert cert.cert_no in sent[0][2]
    assert (
        f"{settings.public_app_url}/certificate/{cert.cert_no}?token="
        in sent[0][2]
    )
    assert cert.emailed_at is not None
    assert cert.email_mode == "live"


async def test_issue_pdf_template_email_skipped_on_provider_error(db, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "email_api", "http://provider.test")
    monkeypatch.setattr(settings, "api_key", "secret")

    async def boom(to_email, subject, html_content, from_email=None):
        raise mail_svc.EmailError("provider down")

    monkeypatch.setattr(cert_svc.mail_svc, "send_html", boom)
    monkeypatch.setattr(cert_svc.r2, "put_bytes", lambda *a, **k: None)
    event = await _pdf_template_event(db, monkeypatch)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    cert = await cert_svc.issue_certificate(db, p, event, "u")
    assert cert.emailed_at is None
    assert cert.email_mode == "skipped"


async def test_issue_image_template_skips_render_and_email(db):
    event = await _event_with_template(db)
    await _add_template(db, event)
    p = await _add_participant(db, event)
    await _set_attendance(db, p, event.sessions)
    cert = await cert_svc.issue_certificate(db, p, event, "u")
    assert cert.rendered_key is None
    assert cert.emailed_at is None
    assert cert.email_mode is None


# ---------- templates ----------


async def test_create_template(db):
    event = await _event_with_template(db)
    tpl = await _add_template(db, event)
    assert tpl.event_id == event.id
    assert tpl.file_name == "tpl.png"
    assert tpl.file_type == "image/png"
    assert tpl.file_size == 1024
    assert tpl.uploaded_by == "u"


async def test_create_template_replaces_old_and_deletes_r2(db, monkeypatch):
    event = await _event_with_template(db)
    deleted = []
    monkeypatch.setattr(cert_svc.r2, "delete_object", lambda key: deleted.append(key))

    await _add_template(db, event, key="old-key.png")
    event = await _reload_event_with_template(db, event.id)
    assert event.template.r2_key == "old-key.png"

    await _add_template(db, event, key="new-key.png")
    assert deleted == ["old-key.png"]

    event = await _reload_event_with_template(db, event.id)
    assert event.template.r2_key == "new-key.png"
