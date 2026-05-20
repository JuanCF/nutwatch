import re

from config import IDENTIFIER_REGEX


def parse_upsd_users(content: str) -> list:
    entries = []
    current = None
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        m = re.match(r"^\[(.+)\]$", stripped)
        if m:
            if current:
                entries.append(current)
            current = {"name": m.group(1), "directives": []}
            continue
        if current is None:
            continue
        if "=" in stripped:
            key, val = stripped.split("=", 1)
            key = key.strip()
            val = val.strip()
            if key == "password":
                current["password"] = val
            elif key == "upsmon":
                current["upsmon"] = val
            elif key == "actions":
                current["actions"] = val
            elif key == "instcmds":
                current["instcmds"] = val
            else:
                current["directives"].append([key, val])
        else:
            parts = stripped.split(None, 1)
            key = parts[0]
            val = parts[1] if len(parts) > 1 else ""
            if key == "upsmon":
                current["upsmon"] = val
            else:
                current["directives"].append([key, val])
    if current:
        entries.append(current)
    return entries


def serialize_upsd_users(entries: list) -> str:
    known_fields = ("password", "actions", "instcmds", "upsmon")
    lines = []
    for e in entries:
        name = e["name"]
        if "\n" in name or "\r" in name:
            raise ValueError(f"Invalid section name: contains newline")
        if not IDENTIFIER_REGEX.match(name):
            raise ValueError(f"Invalid section name: {name!r}")
        lines.append(f"[{name}]")
        for field in known_fields:
            if field in e:
                val = str(e[field])
                if "\n" in val or "\r" in val:
                    raise ValueError(f"Invalid {field}: contains newline")
                lines.append(f"  {field} = {val}")
        for key, val in e.get("directives", []):
            key = str(key)
            val = str(val)
            if "\n" in key or "\r" in key:
                raise ValueError(f"Invalid directive key: contains newline")
            if not IDENTIFIER_REGEX.match(key):
                raise ValueError(f"Invalid directive key: {key!r}")
            if "\n" in val or "\r" in val:
                raise ValueError(f"Invalid directive value for {key!r}: contains newline")
            lines.append(f"  {key} = {val}")
        lines.append("")
    return "\n".join(lines)