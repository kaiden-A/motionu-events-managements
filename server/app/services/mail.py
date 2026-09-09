"""Email engine: Jinja2 templates from <repo>/template, delivered through the
configured provider (POST /api/v1/emails/send-html with `motionu-api-key`)."""

import logging
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import httpx
import qrcode
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.config import get_settings

logger = logging.getLogger("motionu.mail")

TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "template"
SEND_PATH = "/api/v1/emails/send-html"

_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


class EmailError(Exception):
    """Raised when the email provider rejects or cannot be reached."""


@lru_cache
def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "htm", "xml"]),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )


def render_email(template_name: str, context: dict) -> str:
    template = _env().get_template(template_name)
    return template.render(**context)


def send_endpoint(base_url: str | None) -> str:
    """Normalize the configured base URL into the full send endpoint so both a
    bare origin and a partially-prefixed URL are accepted."""
    if not base_url:
        return ""
    url = base_url.rstrip("/")
    if url.endswith("/send-html"):
        return url
    if url.endswith("/api/v1"):
        return url + "/emails/send-html"
    return url + SEND_PATH


def fmt_date(iso_date: str) -> str:
    """'2026-09-10' -> 'Wed 10 Sep 2026'."""
    try:
        d = datetime.strptime(iso_date, "%Y-%m-%d")
    except ValueError:
        return iso_date
    return f"{_WEEKDAYS[d.weekday()]} {d.day} {_MONTHS[d.month - 1]} {d.year}"


def fmt_time_range(start: str, end: str) -> str:
    return f"{_to12h(start)} – {_to12h(end)}"


def _to12h(t: str) -> str:
    try:
        h, m = t.split(":")
        hour = int(h)
        minute = int(m)
    except (ValueError, AttributeError):
        return t
    ap = "PM" if hour >= 12 else "AM"
    hh = hour % 12 or 12
    return f"{hh}:{minute:02d} {ap}"


def qr_matrix(token: str) -> list[list[int]]:
    """Return the QR module grid as 0/1 rows (no quiet zone baked in — the
    email template adds the white border padding instead, keeping the HTML
    small enough for provider request-size limits)."""
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=1,
        border=0,
    )
    qr.add_data(token)
    qr.make(fit=True)
    return [[1 if cell else 0 for cell in row] for row in qr.modules]


async def send_html(
    to_email: str,
    subject: str,
    html_content: str,
    from_email: str | None = None,
) -> None:
    """POST an HTML email to the configured provider. Raises EmailError on any
    non-2xx response or transport failure."""
    settings = get_settings()
    if not settings.email_enabled:
        raise EmailError("Email service is not configured (EMAIL_API / API_KEY)")

    endpoint = send_endpoint(settings.email_api)
    payload = {
        "toEmail": to_email,
        "subject": subject,
        "fromEmail": from_email or settings.email_from,
        "htmlContent": html_content,
    }
    headers = {
        "Content-Type": "application/json",
        "motionu-api-key": settings.api_key or "",
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("email provider unreachable: %s", exc)
        raise EmailError(f"Email provider unreachable: {exc}") from exc

    if response.status_code >= 400:
        detail = response.text[:300]
        logger.warning("email provider rejected send (%s): %s", response.status_code, detail)
        raise EmailError(
            f"Email provider rejected the send ({response.status_code}): {detail}"
        )
