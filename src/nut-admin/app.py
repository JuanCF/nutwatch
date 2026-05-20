#!/usr/bin/env python3
import logging
import os

try:
    from flask import Flask, send_from_directory
except ImportError:  # pragma: no cover
    class _FakeFlask:
        def __init__(self, *args, **kwargs):
            pass

        def route(self, *args, **kwargs):
            return lambda f: f

    def send_from_directory(*args, **kwargs):
        pass

    Flask = _FakeFlask

from config import NUT_ADMIN_HOST, NUT_ADMIN_PORT
from parsers import (
    parse_ups_conf, serialize_ups_conf,
    parse_upsd_users, serialize_upsd_users,
    parse_nut_scanner_output,
    parse_monitor_lines, remove_monitor_line, add_monitor_line,
    find_monitor_user,
)
from routes import ups_bp, users_bp, system_bp, logs_bp

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nut-admin")


def create_app():
    app = Flask(__name__)

    app.register_blueprint(ups_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(system_bp)
    app.register_blueprint(logs_bp)

    @app.route("/")
    def index():
        return send_from_directory(
            os.path.join(os.path.dirname(__file__), "static"), "index.html"
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host=NUT_ADMIN_HOST, port=NUT_ADMIN_PORT)