import re

from config import IDENTIFIER_REGEX
from .monitor import MONITOR_RE

NOTIFYMSG_RE = re.compile(
    r'^\s*NOTIFYMSG\s+(\S+)\s+"(.*)"\s*$', re.IGNORECASE
)
NOTIFYFLAG_RE = re.compile(
    r'^\s*NOTIFYFLAG\s+(\S+)\s+(.+)\s*$', re.IGNORECASE
)
TIMING_KEYS = (
    "POLLFREQ",
    "POLLFREQALERT",
    "HOSTSYNC",
    "DEADTIME",
    "RBWARNTIME",
    "NOCOMMWARNTIME",
    "FINALDELAY",
)
VALID_FLAGS = {"SYSLOG", "WALL", "EXEC", "IGNORE"}


def parse_upsmon_conf(content: str) -> dict:
    monitors = []
    minsupplies = 1
    shutdowncmd = None
    notifycmd = None
    powerdownflag = None
    notify_msg = {}
    notify_flag = {}
    timing = {}

    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        m = MONITOR_RE.match(stripped)
        if m:
            monitors.append({
                "upsname": m.group(1),
                "hostspec": m.group(2) or "@localhost",
                "power": int(m.group(3)),
                "username": m.group(4),
                "password": m.group(5),
                "role": m.group(6),
            })
            continue

        m = re.match(r'^\s*MINSUPPLIES\s+(\d+)\s*$', stripped, re.IGNORECASE)
        if m:
            minsupplies = int(m.group(1))
            continue

        for cmd_key in ("SHUTDOWNCMD", "NOTIFYCMD", "POWERDOWNFLAG") :
            pattern = rf'^\s*{cmd_key}\s+(.+?)\s*$'
            m = re.match(pattern, stripped, re.IGNORECASE)
            if m:
                val = m.group(1).strip()
                if val.startswith('"') and val.endswith('"'):
                    val = val[1:-1]
                if cmd_key == "SHUTDOWNCMD":
                    shutdowncmd = val
                elif cmd_key == "NOTIFYCMD":
                    notifycmd = val
                elif cmd_key == "POWERDOWNFLAG":
                    powerdownflag = val
                break
        else:
            m = NOTIFYMSG_RE.match(stripped)
            if m:
                notify_msg[m.group(1).upper()] = m.group(2)
                continue

            m = NOTIFYFLAG_RE.match(stripped)
            if m:
                flags = re.split(r"[\s+]", m.group(2).upper().strip())
                flags = [f for f in flags if f]
                notify_flag[m.group(1).upper()] = flags
                continue

            for tkey in TIMING_KEYS:
                pattern = rf'^\s*{tkey}\s+(\d+)\s*$'
                m = re.match(pattern, stripped, re.IGNORECASE)
                if m:
                    timing[tkey] = int(m.group(1))
                    break

    return {
        "monitors": monitors,
        "minsupplies": minsupplies,
        "shutdowncmd": shutdowncmd,
        "notifycmd": notifycmd,
        "powerdownflag": powerdownflag,
        "notify_msg": notify_msg,
        "notify_flag": notify_flag,
        "timing": timing,
    }


def serialize_upsmon_conf(data: dict) -> str:
    lines = []

    for m in data.get("monitors", []):
        name = m["upsname"]
        if "\n" in name or "\r" in name:
            raise ValueError(f"Invalid upsname: contains newline")
        if not IDENTIFIER_REGEX.match(name):
            raise ValueError(f"Invalid upsname: {name!r}")
        hostspec = m.get("hostspec", "@localhost")
        power = int(m["power"])
        username = m["username"]
        password = m["password"]
        role = m["role"]
        for field, value in [("upsname", name), ("username", username),
                             ("password", password), ("role", role)]:
            if "\n" in str(value) or "\r" in str(value):
                raise ValueError(f"Invalid {field}: contains newline")
        if role not in ("master", "slave"):
            raise ValueError(f"Invalid role: {role!r}")
        lines.append(
            f"MONITOR {name}{hostspec} {power} {username} {password} {role}"
        )

    lines.append(f"MINSUPPLIES {data.get('minsupplies', 1)}")

    if data.get("shutdowncmd"):
        val = data["shutdowncmd"]
        if "\n" in val or "\r" in val:
            raise ValueError("Invalid shutdowncmd: contains newline")
        lines.append(f'SHUTDOWNCMD "{val}"')

    if data.get("notifycmd"):
        val = data["notifycmd"]
        if "\n" in val or "\r" in val:
            raise ValueError("Invalid notifycmd: contains newline")
        lines.append(f'NOTIFYCMD "{val}"')

    if data.get("powerdownflag"):
        val = data["powerdownflag"]
        if "\n" in val or "\r" in val:
            raise ValueError("Invalid powerdownflag: contains newline")
        lines.append(f'POWERDOWNFLAG "{val}"')

    EVENT_TOKEN_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.:-]{0,127}$")

    for event in sorted(data.get("notify_msg", {}).keys()):
        if not EVENT_TOKEN_RE.match(event):
            raise ValueError(f"Invalid notify_msg event name: {event!r}")
        msg = data["notify_msg"][event]
        if "\n" in msg or "\r" in msg:
            raise ValueError(f"Invalid notify_msg for {event}: contains newline")
        lines.append(f'NOTIFYMSG {event} "{msg}"')

    for event in sorted(data.get("notify_flag", {}).keys()):
        if not EVENT_TOKEN_RE.match(event):
            raise ValueError(f"Invalid notify_flag event name: {event!r}")
        flags = data["notify_flag"][event]
        if flags:
            lines.append(f"NOTIFYFLAG {event} {' '.join(flags)}")

    for tkey in TIMING_KEYS:
        if tkey in data.get("timing", {}):
            lines.append(f"{tkey} {data['timing'][tkey]}")

    return "\n".join(lines) + "\n"
