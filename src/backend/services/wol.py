import json
import logging
import os
import re
import grp

from config import NUT_DIR
from utils import read_file, write_file

logger = logging.getLogger(__name__)

WOL_JSON = os.path.join(NUT_DIR, "wol.json")
WOL_EVENTS_JSON = os.path.join(NUT_DIR, "wol-events.json")

MAC_REGEX = re.compile(r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$")


def _load_json(path: str) -> dict:
    try:
        content = read_file(path)
        return json.loads(content)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_json(path: str, data: dict) -> None:
    content = json.dumps(data, indent=2) + "\n"
    write_file(path, content)
    try:
        os.chmod(path, 0o640)
        nut_gid = grp.getgrnam("nut").gr_gid
        os.chown(path, 0, nut_gid)
    except (FileNotFoundError, PermissionError, KeyError):
        pass


def list_targets() -> dict:
    data = _load_json(WOL_JSON)
    return data.get("targets", {})


def get_target(name: str) -> dict | None:
    targets = list_targets()
    return targets.get(name)


def add_target(name: str, mac: str, broadcast: str = "255.255.255.255", description: str = "") -> dict | None:
    if not MAC_REGEX.match(mac):
        raise ValueError(f"Invalid MAC address: {mac!r}")
    data = _load_json(WOL_JSON)
    if "targets" not in data:
        data["targets"] = {}
    if name in data["targets"]:
        return None
    data["targets"][name] = {
        "mac": mac,
        "broadcast": broadcast,
        "description": description,
    }
    _save_json(WOL_JSON, data)
    return data["targets"][name]


def update_target(name: str, mac: str | None = None, broadcast: str | None = None, description: str | None = None) -> dict | None:
    target = get_target(name)
    if target is None:
        return None
    if mac is not None:
        if not MAC_REGEX.match(mac):
            raise ValueError(f"Invalid MAC address: {mac!r}")
        target["mac"] = mac
    if broadcast is not None:
        target["broadcast"] = broadcast
    if description is not None:
        target["description"] = description
    data = _load_json(WOL_JSON)
    data["targets"][name] = target
    _save_json(WOL_JSON, data)
    return target


def delete_target(name: str) -> bool:
    data = _load_json(WOL_JSON)
    targets = data.get("targets", {})
    if name not in targets:
        return False
    del targets[name]
    _save_json(WOL_JSON, data)

    events_data = _load_json(WOL_EVENTS_JSON)
    mappings = events_data.get("mappings", [])
    changed = False
    for m in mappings:
        if name in m.get("targets", []):
            m["targets"] = [t for t in m["targets"] if t != name]
            changed = True
    mappings = [m for m in mappings if m.get("targets")]
    events_data["mappings"] = mappings
    if changed:
        _save_json(WOL_EVENTS_JSON, events_data)
    return True


def send_wol(name: str) -> bool:
    target = get_target(name)
    if target is None:
        raise ValueError(f"WOL target not found: {name!r}")
    try:
        from wakeonlan import send_magic_packet
    except ImportError:
        logger.exception("wakeonlan Python package is not installed")
        raise RuntimeError("wakeonlan package is not installed") from None
    send_magic_packet(target["mac"], ip_address=target.get("broadcast", "255.255.255.255"), port=9)
    logger.info("Sent WOL magic packet to %s (%s) via %s", name, target["mac"], target.get("broadcast", "255.255.255.255"))
    return True


def wake_all() -> dict:
    targets = list_targets()
    results = {}
    for name in targets:
        try:
            send_wol(name)
            results[name] = "ok"
        except Exception as e:
            results[name] = str(e)
    return results


def list_mappings() -> list:
    data = _load_json(WOL_EVENTS_JSON)
    return data.get("mappings", [])


def add_mapping(ups: str, event: str, targets: list[str]) -> dict:
    data = _load_json(WOL_EVENTS_JSON)
    if "mappings" not in data:
        data["mappings"] = []

    existing_targets = list_targets()
    for t in targets:
        if t not in existing_targets:
            raise ValueError(f"Unknown WOL target: {t!r}")

    for m in data["mappings"]:
        if m["ups"] == ups and m["event"] == event:
            raise ValueError(f"Mapping already exists for UPS '{ups}' event '{event}'")

    mapping = {"ups": ups, "event": event, "targets": targets}
    data["mappings"].append(mapping)
    _save_json(WOL_EVENTS_JSON, data)
    return mapping


def delete_mapping(index: int) -> bool:
    data = _load_json(WOL_EVENTS_JSON)
    mappings = data.get("mappings", [])
    if index < 0 or index >= len(mappings):
        return False
    mappings.pop(index)
    data["mappings"] = mappings
    _save_json(WOL_EVENTS_JSON, data)
    return True


def dispatch(upsname: str, event: str) -> None:
    mappings = list_mappings()
    for m in mappings:
        if m["ups"] == upsname and m["event"] == event:
            for target_name in m.get("targets", []):
                try:
                    send_wol(target_name)
                except Exception as e:
                    logger.exception("WOL dispatch failed for %s/%s -> %s", upsname, event, target_name)


def cleanup_for_ups(upsname: str) -> None:
    data = _load_json(WOL_EVENTS_JSON)
    mappings = data.get("mappings", [])
    new_mappings = [m for m in mappings if m["ups"] != upsname]
    if len(new_mappings) != len(mappings):
        data["mappings"] = new_mappings
        _save_json(WOL_EVENTS_JSON, data)
        logger.info("Cleaned up %d WOL mapping(s) for UPS '%s'", len(mappings) - len(new_mappings), upsname)