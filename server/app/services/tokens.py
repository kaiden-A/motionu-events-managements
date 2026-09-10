import hashlib
import hmac
import secrets

from app.config import get_settings


def generate_token() -> str:
    return secrets.token_urlsafe(24)


def qr_payload(token: str) -> str:
    return token


def cert_download_token(cert_no: str) -> str:
    secret = get_settings().cert_link_secret
    return hmac.new(
        secret.encode(), f"cert-download:{cert_no}".encode(), hashlib.sha256
    ).hexdigest()


def verify_cert_download_token(cert_no: str, token: str) -> bool:
    return hmac.compare_digest(cert_download_token(cert_no), token)
