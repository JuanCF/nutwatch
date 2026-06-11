import pytest
from flask import Flask


def _make_app(api_key):
    app = Flask(__name__)
    app.config["TESTING"] = True
    return app


def test_no_auth_when_key_empty(monkeypatch):
    monkeypatch.setattr("auth.NUTWATCH_API_KEY", "")
    app = _make_app(None)

    from auth import require_admin

    @app.route("/test")
    @require_admin
    def handler():
        return "ok"

    with app.test_client() as c:
        resp = c.get("/test")
        assert resp.status_code == 200
        assert resp.data.decode() == "ok"


def test_auth_valid_token(monkeypatch):
    monkeypatch.setattr("auth.NUTWATCH_API_KEY", "secret123")
    app = _make_app(None)

    from auth import require_admin

    @app.route("/test")
    @require_admin
    def handler():
        return "ok"

    with app.test_client() as c:
        resp = c.get("/test", headers={"Authorization": "Bearer secret123"})
        assert resp.status_code == 200


def test_auth_invalid_token(monkeypatch):
    monkeypatch.setattr("auth.NUTWATCH_API_KEY", "secret123")
    app = _make_app(None)

    from auth import require_admin

    @app.route("/test")
    @require_admin
    def handler():
        return "ok"

    with app.test_client() as c:
        resp = c.get("/test", headers={"Authorization": "Bearer wrong"})
        assert resp.status_code == 401
        assert resp.get_json()["error"] == "unauthorized"


def test_auth_missing_header(monkeypatch):
    monkeypatch.setattr("auth.NUTWATCH_API_KEY", "secret123")
    app = _make_app(None)

    from auth import require_admin

    @app.route("/test")
    @require_admin
    def handler():
        return "ok"

    with app.test_client() as c:
        resp = c.get("/test")
        assert resp.status_code == 401