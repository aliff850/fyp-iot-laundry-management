"""Access-control checks for the Pi's local pairing handler."""

import base64

from werkzeug.security import generate_password_hash

from pi5.dashboard import dashboard


def _configured(monkeypatch):
    monkeypatch.setattr(dashboard, "SETUP_USERNAME", "installer")
    monkeypatch.setattr(dashboard, "SETUP_PASSWORD_HASH", generate_password_hash("local-test-password"))
    monkeypatch.setattr(dashboard, "SETUP_CSRF_SECRET", "local-test-csrf-secret")
    monkeypatch.setattr(dashboard, "CLOUD_API_BASE", "https://api.example.test")


def _auth():
    encoded = base64.b64encode(b"installer:local-test-password").decode()
    return {"Authorization": f"Basic {encoded}"}


def test_dashboard_renders_repository_pairing_template():
    response = dashboard.app.test_client().get("/")
    assert response.status_code == 200
    assert b"Gateway Pairing" in response.data


def test_setup_requires_local_login(monkeypatch):
    _configured(monkeypatch)
    client = dashboard.app.test_client()
    response = client.get("/api/setup/gateway")
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"].startswith("Basic")
    assert client.post("/api/setup/pair", json={"code": "ABCDEFGHIJKL"}).status_code == 401


def test_pairing_requires_same_origin_csrf(monkeypatch):
    _configured(monkeypatch)
    client = dashboard.app.test_client()
    headers = _auth()
    assert client.post("/api/setup/pair", json={"code": "ABCDEFGHIJKL"}, headers=headers).status_code == 403
    headers.update({"Origin": "https://other.example", "X-Setup-CSRF": dashboard._csrf_token()})
    assert client.post("/api/setup/pair", json={"code": "ABCDEFGHIJKL"}, headers=headers).status_code == 403
    headers["Origin"] = "http://localhost"
    assert client.post("/api/setup/pair", json={"code": "bad"}, headers=headers).status_code == 400


def test_unconfigured_setup_fails_closed(monkeypatch):
    monkeypatch.setattr(dashboard, "SETUP_PASSWORD_HASH", "")
    assert dashboard.app.test_client().get("/api/setup/gateway").status_code == 503
