import os

from config import NUT_DIR
from parsers.upsd_users import parse_upsd_users, serialize_upsd_users
from utils import read_file, write_file

PASSWORD_PLACEHOLDER = "\u2022\u2022\u2022\u2022\u2022\u2022"


def list_users():
    try:
        content = read_file(os.path.join(NUT_DIR, "upsd.users"))
    except FileNotFoundError:
        return []
    entries = parse_upsd_users(content)
    for e in entries:
        e["password"] = PASSWORD_PLACEHOLDER
    return entries


def add_user(data: dict) -> tuple:
    name = data.get("name", "").strip()
    if not name:
        return None, "name is required"
    directives = data.get("directives")

    path = os.path.join(NUT_DIR, "upsd.users")
    try:
        content = read_file(path)
    except FileNotFoundError:
        content = ""
    entries = parse_upsd_users(content)
    if any(e["name"] == name for e in entries):
        return None, "user already exists"
    new_entry = {"name": name, "directives": []}
    for key in ("password", "upsmon", "actions", "instcmds"):
        if key in data:
            new_entry[key] = data[key]
    for key, val in (directives or {}).items():
        new_entry["directives"].append([key, val])
    entries.append(new_entry)
    write_file(path, serialize_upsd_users(entries))
    new_entry["password"] = PASSWORD_PLACEHOLDER
    return new_entry, None


def edit_user(name: str, data: dict):
    directives = data.get("directives")
    path = os.path.join(NUT_DIR, "upsd.users")
    try:
        content = read_file(path)
    except FileNotFoundError:
        return None
    entries = parse_upsd_users(content)
    for e in entries:
        if e["name"] == name:
            for key in ("password", "upsmon", "actions", "instcmds"):
                if key in data:
                    e[key] = data[key]
            if directives is not None:
                e["directives"] = []
                for k, v in directives.items():
                    e["directives"].append([k, v])
            write_file(path, serialize_upsd_users(entries))
            e["password"] = PASSWORD_PLACEHOLDER
            return e
    return None


def delete_user(name: str) -> bool:
    path = os.path.join(NUT_DIR, "upsd.users")
    try:
        content = read_file(path)
    except FileNotFoundError:
        return False
    entries = parse_upsd_users(content)
    new_entries = [e for e in entries if e["name"] != name]
    if len(new_entries) == len(entries):
        return False
    write_file(path, serialize_upsd_users(new_entries))
    return True