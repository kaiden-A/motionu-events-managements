import httpx
import pytest

from app.config import get_settings
from app.services import mail as mail_svc


def _enable_email(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "email_api", "https://mail.example.test")
    monkeypatch.setattr(settings, "api_key", "secret-key")


def _fake_post(captured: dict, status_code: int = 200, text: str = ""):
    async def post(self, endpoint, *, json=None, headers=None, **kwargs):
        captured["endpoint"] = endpoint
        captured["json"] = json
        captured["headers"] = headers
        return httpx.Response(status_code, text=text, request=httpx.Request("POST", endpoint))

    return post


def test_qr_matrix_square():
    rows = mail_svc.qr_matrix("MOTIONU|token-123")
    assert len(rows) > 0
    assert all(len(r) == len(rows) for r in rows)
    assert all(cell in (0, 1) for r in rows for cell in r)
    # finder pattern marker top-left
    assert rows[0][0] == 1
    assert rows[0][1] == 1
    assert rows[1][0] == 1
    # no quiet-zone padding baked in (borderless grid)
    assert len(rows) < 40


def test_qr_matrix_deterministic():
    assert mail_svc.qr_matrix("token-a") == mail_svc.qr_matrix("token-a")
    assert mail_svc.qr_matrix("token-a") != mail_svc.qr_matrix("token-b")


def test_render_qr_pass_template_uses_all_context():
    html = mail_svc.render_email(
        "qr_pass.html",
        {
            "first_name": "Aina",
            "participant_name": "Aina Sofea Binti Hassan",
            "student_id": "SU21134",
            "event_title": "Hackathon Night",
            "session_label": "Day 1",
            "date_label": mail_svc.fmt_date("2026-09-10"),
            "time_label": mail_svc.fmt_time_range("09:00", "11:30"),
            "location": "Main Hall",
            "token": "abc-123",
            "qr_rows": mail_svc.qr_matrix("abc-123"),
        },
    )
    assert "Hackathon Night" in html
    assert "Aina Sofea Binti Hassan" in html
    assert "SU21134" in html
    assert "Thu 10 Sep 2026" in html
    assert "9:00 AM – 11:30 AM" in html
    assert "data:image/png;base64," not in html
    assert 'class="qrd"' in html
    assert 'class="qrl"' in html
    assert "background-color: #0F172A !important" in html
    assert 'name="color-scheme" content="light only"' in html


async def test_send_html_posts_expected_payload(monkeypatch):
    _enable_email(monkeypatch)
    captured: dict = {}
    monkeypatch.setattr(mail_svc.httpx.AsyncClient, "post", _fake_post(captured))

    await mail_svc.send_html(
        "recipient@example.com",
        "Subject here",
        "<p>hello</p>",
        from_email="info@motionukict.com",
    )
    assert captured["endpoint"] == "https://mail.example.test/api/v1/emails/send-html"
    assert captured["headers"]["motionu-api-key"] == "secret-key"
    assert captured["json"] == {
        "toEmail": "recipient@example.com",
        "subject": "Subject here",
        "fromEmail": "info@motionukict.com",
        "htmlContent": "<p>hello</p>",
    }


def test_send_html_normalizes_full_endpoint(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "email_api", "https://mail.example.test/api/v1/emails/send-html")
    assert (
        mail_svc.send_endpoint(settings.email_api)
        == "https://mail.example.test/api/v1/emails/send-html"
    )
    assert mail_svc.send_endpoint("https://mail.example.test") == (
        "https://mail.example.test/api/v1/emails/send-html"
    )


async def test_send_html_raises_email_error_on_provider_rejection(monkeypatch):
    _enable_email(monkeypatch)
    captured: dict = {}
    monkeypatch.setattr(
        mail_svc.httpx.AsyncClient, "post", _fake_post(captured, status_code=400, text="bad request")
    )

    with pytest.raises(mail_svc.EmailError, match="400"):
        await mail_svc.send_html("recipient@example.com", "Subject", "<p>hello</p>")
    assert captured["endpoint"] == "https://mail.example.test/api/v1/emails/send-html"


async def test_send_html_raises_when_disabled():
    with pytest.raises(mail_svc.EmailError, match="not configured"):
        await mail_svc.send_html("recipient@example.com", "Subject", "<p>hello</p>")
