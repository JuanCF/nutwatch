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

from config import NUTWATCH_HOST, NUTWATCH_PORT
from routes import ups_bp, users_bp, upsmon_bp, hooks_bp, system_bp, logs_bp, wol_bp

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nutwatch")


def create_app():
    app = Flask(__name__)

    app.register_blueprint(ups_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(upsmon_bp)
    app.register_blueprint(hooks_bp)
    app.register_blueprint(system_bp)
    app.register_blueprint(logs_bp)
    app.register_blueprint(wol_bp)

    @app.route("/")
    def index():
        return send_from_directory(
            os.path.join(os.path.dirname(__file__), "static"), "index.html"
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host=NUTWATCH_HOST, port=NUTWATCH_PORT)
