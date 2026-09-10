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


def test_cert_download_token_roundtrip():
    token = tokens.cert_download_token("MU-2026-0001")
    assert tokens.verify_cert_download_token("MU-2026-0001", token)


def test_cert_download_token_rejects_other_cert():
    token = tokens.cert_download_token("MU-2026-0001")
    assert not tokens.verify_cert_download_token("MU-2026-0002", token)


def test_cert_download_token_rejects_tampered():
    token = tokens.cert_download_token("MU-2026-0001")
    tampered = token[:-1] + ("0" if token[-1] != "0" else "1")
    assert not tokens.verify_cert_download_token("MU-2026-0001", tampered)
