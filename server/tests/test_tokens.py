from app.services import tokens


def test_generate_token_nonempty():
    assert tokens.generate_token()


def test_generate_token_unique():
    seen = {tokens.generate_token() for _ in range(100)}
    assert len(seen) == 100


def test_generate_token_urlsafe():
    value = tokens.generate_token()
    assert all(c in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in value)


def test_qr_payload_identity():
    token = tokens.generate_token()
    assert tokens.qr_payload(token) == token
