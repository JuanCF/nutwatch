import os

from config import NUT_DIR, ALLOWED_CONFIGS
from utils import run_cmd, read_file, write_file


def restart_server():
    return run_cmd(["systemctl", "restart", "nut-server"])


def restart_monitor():
    return run_cmd(["systemctl", "restart", "nut-monitor"])


def restart_all():
    rc1, out1, err1 = run_cmd(["systemctl", "restart", "nut-server"])
    rc2, out2, err2 = run_cmd(["systemctl", "restart", "nut-monitor"])
    return rc1 or rc2, out1 + out2, err1 + err2


def service_status():
    return run_cmd(["systemctl", "status", "nut-server", "nut-monitor"])


def detailed_service_status():
    services = ["nut-driver", "nut-server", "nut-monitor"]
    result = {}
    for svc in services:
        rc, out, err = run_cmd(["systemctl", "is-active", svc], timeout=5)
        state = (out or err).strip()
        result[svc] = {"active": rc == 0, "state": state}
    return result


def driver_action(ups_name: str, action: str):
    if action == "restart":
        rc1, out1, err1 = run_cmd(["upsdrvctl", "stop", ups_name], timeout=30)
        rc2, out2, err2 = run_cmd(["upsdrvctl", "start", ups_name], timeout=30)
        return rc1 or rc2, out1 + out2, err1 + err2
    return run_cmd(["upsdrvctl", action, ups_name], timeout=30)


def get_config(filename: str):
    if filename not in ALLOWED_CONFIGS:
        return None
    path = os.path.join(NUT_DIR, filename)
    try:
        return read_file(path)
    except FileNotFoundError:
        return None


def put_config(filename: str, content: str):
    if filename not in ALLOWED_CONFIGS:
        return False
    if filename == "upsd.users":
        return False
    path = os.path.join(NUT_DIR, filename)
    try:
        write_file(path, content)
    except OSError:
        return False
    return True
