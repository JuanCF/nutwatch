import functools
import logging
import os

from flask import request, jsonify

from config import NUT_ADMIN_API_KEY

logger = logging.getLogger("nut-admin")


def require_admin(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not NUT_ADMIN_API_KEY:
            return f(*args, **kwargs)
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer "):]
            if token == NUT_ADMIN_API_KEY:
                return f(*args, **kwargs)
        logger.warning("Auth failure from %s for %s", request.remote_addr, request.path)
        return jsonify({"error": "unauthorized"}), 401

    return decorated