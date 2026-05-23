import os

from config import NUT_DIR, IDENTIFIER_REGEX
from parsers.upsmon_conf import parse_upsmon_conf, serialize_upsmon_conf
from parsers.ups_conf import parse_ups_conf
from utils import read_file, write_file

UPSMON_PATH = os.path.join(NUT_DIR, "upsmon.conf")
UPSCONF_PATH = os.path.join(NUT_DIR, "ups.conf")

VALID_FLAGS = {"SYSLOG", "WALL", "EXEC", "IGNORE"}
TIMING_KEYS = (
    "POLLFREQ",
    "POLLFREQALERT",
    "HOSTSYNC",
    "DEADTIME",
    "RBWARNTIME",
    "NOCOMMWARNTIME",
    "FINALDELAY",
)
VALID_ROLES = {"master", "slave"}


def get_upsmon_config():
    try:
        content = read_file(UPSMON_PATH)
    except FileNotFoundError:
        content = ""
    return parse_upsmon_conf(content)


def put_upsmon_config(data: dict):
    # Validate no newlines in any string field
    def _check_newlines(val, path):
        if isinstance(val, str):
            if "\n" in val or "\r" in val:
                raise ValueError(f"Newline in {path}")
        elif isinstance(val, dict):
            for k, v in val.items():
                _check_newlines(v, f"{path}.{k}")
        elif isinstance(val, list):
            for i, v in enumerate(val):
                _check_newlines(v, f"{path}[{i}]")

    _check_newlines(data, "data")

    # Validate notify_flag values
    for event, flags in data.get("notify_flag", {}).items():
        if not isinstance(flags, list):
            raise ValueError(f"notify_flag[{event}] must be a list")
        for flag in flags:
            if flag not in VALID_FLAGS:
                raise ValueError(f"Invalid flag {flag!r} for event {event}")

    # Validate timing values
    for tkey in TIMING_KEYS:
        if tkey in data.get("timing", {}):
            val = data["timing"][tkey]
            if not isinstance(val, int) or val <= 0:
                raise ValueError(f"{tkey} must be a positive integer")

    # Validate minsupplies
    minsupplies = data.get("minsupplies", 1)
    if not isinstance(minsupplies, int) or minsupplies < 0:
        raise ValueError(f"minsupplies must be an integer >= 0")

    # Validate monitors
    for i, m in enumerate(data.get("monitors", [])):
        upsname = m.get("upsname", "")
        if not IDENTIFIER_REGEX.match(upsname):
            raise ValueError(f"Invalid upsname in monitor[{i}]: {upsname!r}")
        role = m.get("role", "")
        if role not in VALID_ROLES:
            raise ValueError(f"Invalid role in monitor[{i}]: {role!r}")
        power = m.get("power", 0)
        if not isinstance(power, int) or power < 0:
            raise ValueError(f"power in monitor[{i}] must be >= 0")
        username = m.get("username", "")
        if not isinstance(username, str) or not username:
            raise ValueError(f"missing or invalid username in monitor[{i}]")
        password = m.get("password", "")
        if not isinstance(password, str) or not password:
            raise ValueError(f"missing or invalid password in monitor[{i}]")

    # Validate monitors[].upsname exists in ups.conf
    try:
        ups_content = read_file(UPSCONF_PATH)
    except FileNotFoundError:
        ups_content = ""
    ups_entries = parse_ups_conf(ups_content)
    ups_names = {e["name"] for e in ups_entries}
    for i, m in enumerate(data.get("monitors", [])):
        if not isinstance(m.get("username", ""), str) or not m.get("username", ""):
            raise ValueError(f"missing or invalid username in monitor[{i}]")
        if not isinstance(m.get("password", ""), str) or not m.get("password", ""):
            raise ValueError(f"missing or invalid password in monitor[{i}]")
        if m["upsname"] not in ups_names:
            raise ValueError(
                f"upsname {m['upsname']!r} in monitor[{i}] does not exist in ups.conf"
            )

    serialized = serialize_upsmon_conf(data)
    write_file(UPSMON_PATH, serialized)
