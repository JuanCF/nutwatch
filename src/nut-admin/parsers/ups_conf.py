import re


def parse_ups_conf(content: str) -> list:
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
            if key == "driver":
                current["driver"] = val
            elif key == "port":
                current["port"] = val
            elif key == "desc":
                current["desc"] = val.strip('"')
            else:
                current["directives"].append([key, val])
    if current:
        entries.append(current)
    return entries


def serialize_ups_conf(entries: list) -> str:
    lines = []
    for e in entries:
        lines.append(f"[{e['name']}]")
        if "driver" in e:
            lines.append(f"  driver = {e['driver']}")
        if "port" in e:
            lines.append(f"  port = {e['port']}")
        if "desc" in e:
            lines.append(f'  desc = "{e["desc"]}"')
        for key, val in e.get("directives", []):
            lines.append(f"  {key} = {val}")
        lines.append("")
    return "\n".join(lines)