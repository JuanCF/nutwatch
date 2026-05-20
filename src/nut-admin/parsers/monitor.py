import re

from config import IDENTIFIER_REGEX
from .upsd_users import parse_upsd_users

MONITOR_RE = re.compile(
    r"^\s*MONITOR\s+(\S+?)(@\S+)?\s+(\d+)\s+(\S+)\s+(\S+)\s+(master|slave)\s*$",
    re.IGNORECASE,
)


def parse_monitor_lines(content: str) -> list:
    monitors = []
    for line in content.splitlines():
        m = MONITOR_RE.match(line)
        if m:
            monitors.append({
                "upsname": m.group(1),
                "hostspec": m.group(2) or "@localhost",
                "power": int(m.group(3)),
                "username": m.group(4),
                "password": m.group(5),
                "role": m.group(6),
                "raw": line,
            })
    return monitors


def remove_monitor_line(content: str, upsname: str) -> str:
    lines = []
    for line in content.splitlines():
        m = MONITOR_RE.match(line)
        if m and m.group(1) == upsname:
            continue
        lines.append(line)
    return "\n".join(lines)


def add_monitor_line(
    content: str, upsname: str, power: int, username: str, password: str, role: str
) -> str:
    for field_name, value in [("upsname", upsname), ("username", username),
                               ("password", password), ("role", role)]:
        if "\n" in value or "\r" in value:
            raise ValueError(f"Invalid {field_name}: contains newline")
        if not IDENTIFIER_REGEX.match(value):
            raise ValueError(f"Invalid {field_name}: {value!r}")
    hostspec = "@localhost"
    line = f"MONITOR {upsname}{hostspec} {power} {username} {password} {role}"
    if content and not content.endswith("\n"):
        content += "\n"
    return content + line + "\n"


def find_monitor_user(content: str) -> tuple:
    entries = parse_upsd_users(content)
    for e in entries:
        if e.get("upsmon") in ("master", "slave"):
            return e["name"], e.get("password", ""), e["upsmon"]
    return None, None, None