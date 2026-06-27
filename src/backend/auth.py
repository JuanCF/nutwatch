import functools
import logging
import os

from flask import request, jsonify

from config import NUTWATCH_API_KEY

logger = logging.getLogger("nutwatch")


def require_admin(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not NUTWATCH_API_KEY:
            return f(*args, **kwargs)
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer "):]
            if token == NUTWATCH_API_KEY:
                return f(*args, **kwargs)
        logger.warning("Auth failure from %s for %s", request.remote_addr, request.path)
        return jsonify({"error": "unauthorized"}), 401

    return decorated


def require_admin_strict(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not NUTWATCH_API_KEY:
            logger.warning("Strict-auth endpoint %s called without API key configured", request.path)
            return jsonify({"error": "this endpoint requires NUTWATCH_API_KEY to be set"}), 403
        return require_admin(f)(*args, **kwargs)

    return decorated
