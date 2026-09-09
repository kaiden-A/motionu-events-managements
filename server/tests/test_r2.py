from app.services import r2


class _FakeS3:
    def __init__(self):
        self.calls = []

    def generate_presigned_url(self, method, Params=None, ExpiresIn=None):
        self.calls.append({"method": method, "Params": Params, "ExpiresIn": ExpiresIn})
        return f"https://presigned/{method}"

    def delete_object(self, **kwargs):
        self.calls.append({"method": "delete_object", **kwargs})


def _patch_s3(monkeypatch):
    fake = _FakeS3()
    monkeypatch.setattr(r2, "_s3", lambda: fake)
    return fake


def test_presign_put(monkeypatch):
    fake = _patch_s3(monkeypatch)
    url = r2.presign_put("events/e1/t.png", "image/png", expires_in=120)
    assert url == "https://presigned/put_object"
    call = fake.calls[0]
    assert call["method"] == "put_object"
    assert call["Params"]["Key"] == "events/e1/t.png"
    assert call["Params"]["ContentType"] == "image/png"
    assert call["Params"]["Bucket"] == "motionu-certs"
    assert call["ExpiresIn"] == 120


def test_presign_put_default_expiry(monkeypatch):
    fake = _patch_s3(monkeypatch)
    r2.presign_put("k", "text/plain")
    assert fake.calls[0]["ExpiresIn"] == 600


def test_presign_get(monkeypatch):
    fake = _patch_s3(monkeypatch)
    url = r2.presign_get("events/e1/t.png", expires_in=60)
    assert url == "https://presigned/get_object"
    call = fake.calls[0]
    assert call["method"] == "get_object"
    assert call["Params"]["Key"] == "events/e1/t.png"
    assert call["ExpiresIn"] == 60


def test_delete_object(monkeypatch):
    fake = _patch_s3(monkeypatch)
    r2.delete_object("events/e1/t.png")
    call = fake.calls[0]
    assert call["method"] == "delete_object"
    assert call["Bucket"] == "motionu-certs"
    assert call["Key"] == "events/e1/t.png"
