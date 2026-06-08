from flask import Blueprint, request, jsonify

from auth import require_admin
from config import IDENTIFIER_REGEX
from services.ups import list_ups, get_ups, add_ups, edit_ups, delete_ups, scan_ups, get_ups_detail

ups_bp = Blueprint("ups", __name__)


@ups_bp.route("/api/ups", methods=["GET"])
@require_admin
def list_ups_handler():
    entries = list_ups()
    return jsonify(entries)


@ups_bp.route("/api/ups", methods=["POST"])
@require_admin
def add_ups_handler():
    data = request.get_json(force=True) or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    if not IDENTIFIER_REGEX.match(name):
        return jsonify({"error": "name contains invalid characters"}), 400
    directives = data.get("directives")
    if directives is not None and not isinstance(directives, dict):
        return jsonify({"error": "directives must be an object"}), 400
    new_entry, err = add_ups(data)
    if err:
        return jsonify({"error": err}), 409
    return jsonify(new_entry), 201


@ups_bp.route("/api/ups/<name>", methods=["GET"])
@require_admin
def get_ups_handler(name):
    if not IDENTIFIER_REGEX.match(name):
        return jsonify({"error": "name contains invalid characters"}), 400
    e = get_ups(name)
    if e is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(e)


@ups_bp.route("/api/ups/<name>/detail", methods=["GET"])
@require_admin
def get_ups_detail_handler(name):
    if not IDENTIFIER_REGEX.match(name):
        return jsonify({"error": "name contains invalid characters"}), 400
    try:
        return jsonify(get_ups_detail(name))
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500


@ups_bp.route("/api/ups/<name>", methods=["PUT"])
@require_admin
def edit_ups_handler(name):
    if not IDENTIFIER_REGEX.match(name):
        return jsonify({"error": "name contains invalid characters"}), 400
    data = request.get_json(force=True) or {}
    directives = data.get("directives")
    if directives is not None and not isinstance(directives, dict):
        return jsonify({"error": "directives must be an object"}), 400
    e = edit_ups(name, data)
    if e is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(e)


@ups_bp.route("/api/ups/<name>", methods=["DELETE"])
@require_admin
def delete_ups_handler(name):
    if not IDENTIFIER_REGEX.match(name):
        return jsonify({"error": "name contains invalid characters"}), 400
    if not delete_ups(name):
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})


@ups_bp.route("/api/ups/scan", methods=["POST"])
@require_admin
def scan_ups_handler():
    return jsonify(scan_ups())