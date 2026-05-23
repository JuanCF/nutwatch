import grp
import os

from config import NUT_DIR, IDENTIFIER_REGEX
from utils import read_file, write_file

HOOKDIR = os.path.join(NUT_DIR, "notify.d")


def get_hook_path(upsname: str, event: str) -> str:
    return os.path.join(HOOKDIR, f"{upsname}_{event}.sh")


def list_hooks(upsname: str) -> list:
    hooks = []
    for event in (
        "ONLINE",
        "ONBATT",
        "LOWBATT",
        "COMMOK",
        "COMMBAD",
        "SHUTDOWN",
        "REPLBATT",
        "NOCOMM",
        "NOPARENT",
    ):
        path = get_hook_path(upsname, event)
        if os.path.isfile(path):
            hooks.append(event)
    return hooks


def get_hook(upsname: str, event: str) -> str | None:
    path = get_hook_path(upsname, event)
    try:
        return read_file(path)
    except FileNotFoundError:
        return None


def put_hook(upsname: str, event: str, content: str) -> None:
    if not IDENTIFIER_REGEX.match(upsname):
        raise ValueError(f"Invalid upsname: {upsname!r}")
    if event not in (
        "ONLINE",
        "ONBATT",
        "LOWBATT",
        "COMMOK",
        "COMMBAD",
        "SHUTDOWN",
        "REPLBATT",
        "NOCOMM",
        "NOPARENT",
    ):
        raise ValueError(f"Invalid event: {event!r}")
    if "\r" in content:
        raise ValueError("Content contains carriage return")
    os.makedirs(HOOKDIR, exist_ok=True)
    path = get_hook_path(upsname, event)
    write_file(path, content)
    # Ensure executable and correct ownership (root:nut so upsmon can run it)
    os.chmod(path, 0o750)
    try:
        nut_gid = grp.getgrnam("nut").gr_gid
        os.chown(path, 0, nut_gid)
    except (KeyError, OSError):
        pass


def delete_hook(upsname: str, event: str) -> None:
    path = get_hook_path(upsname, event)
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
