import grp
import logging
import os

from config import NUT_DIR, IDENTIFIER_REGEX
from utils import read_file, write_file

logger = logging.getLogger(__name__)

HOOKDIR = os.path.join(NUT_DIR, "notify.d")

EVENTS = (
    "ONLINE",
    "ONBATT",
    "LOWBATT",
    "COMMOK",
    "COMMBAD",
    "SHUTDOWN",
    "REPLBATT",
    "NOCOMM",
    "NOPARENT",
)


def get_hook_path(upsname: str, event: str) -> str:
    return os.path.join(HOOKDIR, f"{upsname}_{event}.sh")


def _validate_upsname(upsname: str) -> None:
    if not IDENTIFIER_REGEX.match(upsname):
        raise ValueError(f"Invalid upsname: {upsname!r}")


def _validate_event(event: str) -> None:
    if not IDENTIFIER_REGEX.match(event):
        raise ValueError(f"Invalid event: {event!r}")


def list_hooks(upsname: str) -> list:
    _validate_upsname(upsname)
    hooks = []
    for event in EVENTS:
        path = get_hook_path(upsname, event)
        if os.path.isfile(path):
            hooks.append(event)
    return hooks


def get_hook(upsname: str, event: str) -> str | None:
    _validate_upsname(upsname)
    _validate_event(event)
    path = get_hook_path(upsname, event)
    try:
        return read_file(path)
    except FileNotFoundError:
        return None


def put_hook(upsname: str, event: str, content: str) -> None:
    if not IDENTIFIER_REGEX.match(upsname):
        raise ValueError(f"Invalid upsname: {upsname!r}")
    if event not in EVENTS:
        raise ValueError(f"Invalid event: {event!r}")
    if "\r" in content:
        raise ValueError("Content contains carriage return")
    os.makedirs(HOOKDIR, exist_ok=True)
    path = get_hook_path(upsname, event)
    write_file(path, content)
    os.chmod(path, 0o750)
    try:
        nut_gid = grp.getgrnam("nut").gr_gid
    except KeyError:
        logger.error("Group 'nut' does not exist — cannot set hook ownership")
        raise
    os.chown(path, 0, nut_gid)


def delete_hook(upsname: str, event: str) -> None:
    _validate_upsname(upsname)
    _validate_event(event)
    path = get_hook_path(upsname, event)
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
