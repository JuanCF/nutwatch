import glob
import os
import re

from config import NUT_DIR, IDENTIFIER_REGEX
from parsers.ups_conf import parse_ups_conf, serialize_ups_conf
from parsers.monitor import (
    parse_monitor_lines,
    add_monitor_line,
    remove_monitor_line,
    find_monitor_user,
    ensure_minsupplies,
    set_minsupplies,
)
from parsers.nut_scanner import parse_nut_scanner_output
from utils import read_file, write_file, run_cmd, ups_status

DEFAULT_POLLINTERVAL = "5"


def _apply_recommended_defaults(entry: dict) -> None:
    directives = {k: v for k, v in entry.get("directives", [])}
    if "pollinterval" not in directives:
        directives["pollinterval"] = DEFAULT_POLLINTERVAL
    entry["directives"] = [[k, v] for k, v in directives.items()]


def _stop_driver_and_cleanup(name: str, driver: str = None) -> None:
    run_cmd(["upsdrvctl", "stop", name], timeout=30)
    for base in ("/var/run/nut", "/run/nut"):
        for pid_file in glob.glob(os.path.join(base, f"*-{name}.pid")):
            try:
                os.unlink(pid_file)
            except OSError:
                pass
    safe_name = re.escape(name)
    run_cmd(["pkill", "-9", "-f", f".*-a\\s*{safe_name}"], timeout=5)


def list_ups():
    try:
        content = read_file(os.path.join(NUT_DIR, "ups.conf"))
    except FileNotFoundError:
        return []
    entries = parse_ups_conf(content)
    for e in entries:
        e["status"] = ups_status(e["name"])
    return entries


def get_ups(name: str):
    path = os.path.join(NUT_DIR, "ups.conf")
    try:
        content = read_file(path)
    except FileNotFoundError:
        return None
    entries = parse_ups_conf(content)
    for e in entries:
        if e["name"] == name:
            e["status"] = ups_status(name)
            return e
    return None


def add_ups(data: dict) -> tuple:
    name = data.get("name", "").strip()
    if not name:
        return None, "name is required"
    directives = data.get("directives")
    if directives is not None:
        for key in directives:
            if not IDENTIFIER_REGEX.match(key):
                return None, f"invalid directive key: {key!r}"

    path = os.path.join(NUT_DIR, "ups.conf")
    try:
        content = read_file(path)
    except FileNotFoundError:
        content = ""
    entries = parse_ups_conf(content)
    if any(e["name"] == name for e in entries):
        return None, "UPS already exists"
    new_entry = {"name": name, "directives": []}
    for key in ("driver", "port", "desc"):
        if key in data:
            new_entry[key] = data[key]
    for key, val in (directives or {}).items():
        new_entry["directives"].append([key, val])

    _apply_recommended_defaults(new_entry)

    entries.append(new_entry)
    write_file(path, serialize_ups_conf(entries))

    upsmon_path = os.path.join(NUT_DIR, "upsmon.conf")
    try:
        upsmon_content = read_file(upsmon_path)
    except FileNotFoundError:
        upsmon_content = ""

    upsmon_content = ensure_minsupplies(upsmon_content, 0)

    monitors = parse_monitor_lines(upsmon_content)
    if not any(m["upsname"] == name for m in monitors):
        mon_user, mon_pass, mon_role = None, None, None
        if monitors:
            mon_user = monitors[0]["username"]
            mon_pass = monitors[0]["password"]
            mon_role = monitors[0]["role"]
        else:
            users_path = os.path.join(NUT_DIR, "upsd.users")
            try:
                users_content = read_file(users_path)
                mon_user, mon_pass, mon_role = find_monitor_user(users_content)
            except FileNotFoundError:
                pass
        if mon_user:
            upsmon_content = add_monitor_line(
                upsmon_content, name, 1, mon_user, mon_pass, mon_role
            )
    write_file(upsmon_path, upsmon_content)
    return new_entry, None


def edit_ups(name: str, data: dict):
    directives = data.get("directives")
    path = os.path.join(NUT_DIR, "ups.conf")
    try:
        content = read_file(path)
    except FileNotFoundError:
        return None
    entries = parse_ups_conf(content)
    for e in entries:
        if e["name"] == name:
            for key in ("driver", "port", "desc"):
                if key in data:
                    e[key] = data[key]
                elif data.get("remove_" + key, False) and key in e:
                    del e[key]
            if directives is not None:
                e["directives"] = []
                for k, v in directives.items():
                    if not IDENTIFIER_REGEX.match(k):
                        continue
                    e["directives"].append([k, v])
            _apply_recommended_defaults(e)
            write_file(path, serialize_ups_conf(entries))
            e["status"] = ups_status(name)
            return e
    return None


def delete_ups(name: str) -> bool:
    path = os.path.join(NUT_DIR, "ups.conf")
    try:
        content = read_file(path)
    except FileNotFoundError:
        return False
    entries = parse_ups_conf(content)
    new_entries = [e for e in entries if e["name"] != name]
    if len(new_entries) == len(entries):
        return False

    driver = None
    for e in entries:
        if e["name"] == name:
            driver = e.get("driver")
            break

    _stop_driver_and_cleanup(name, driver)

    write_file(path, serialize_ups_conf(new_entries))
    upsmon_path = os.path.join(NUT_DIR, "upsmon.conf")
    try:
        upsmon_content = read_file(upsmon_path)
        upsmon_new = remove_monitor_line(upsmon_content, name)
        if upsmon_new != upsmon_content:
            write_file(upsmon_path, upsmon_new)
    except FileNotFoundError:
        pass

    if not new_entries:
        try:
            upsmon_content = read_file(upsmon_path)
            upsmon_content = set_minsupplies(upsmon_content, 0)
            write_file(upsmon_path, upsmon_content)
        except FileNotFoundError:
            pass

    return True


def scan_ups():
    rc, out, err = run_cmd(["nut-scanner", "-U"], timeout=30)
    devices = parse_nut_scanner_output(out) if rc == 0 else []
    return {"returncode": rc, "stdout": out, "stderr": err, "devices": devices}
