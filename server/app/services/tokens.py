import secrets


def generate_token() -> str:
    return secrets.token_urlsafe(24)


def qr_payload(token: str) -> str:
    return token
