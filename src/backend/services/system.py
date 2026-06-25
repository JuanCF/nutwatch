import glob
import os

from config import NUT_DIR, ALLOWED_CONFIGS, IDENTIFIER_REGEX
from utils import run_cmd, read_file, write_file, stop_driver_and_cleanup


def restart_server():
    return run_cmd(["systemctl", "restart", "nut-server"])


def restart_monitor():
    return run_cmd(["systemctl", "restart", "nut-monitor"])


def restart_driver():
    return run_cmd(["systemctl", "restart", "nut-driver"])


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


def _remove_stale_pid_files(ups_name: str) -> None:
    for base in ("/var/run/nut", "/run/nut"):
        for pid_file in glob.glob(os.path.join(base, f"*-{ups_name}.pid")):
            try:
                with open(pid_file, "r", encoding="utf-8") as f:
                    pid = f.read().strip()
                if pid and pid.isdigit() and not os.path.exists(f"/proc/{pid}"):
                    os.unlink(pid_file)
            except (OSError, ValueError):
                pass


def driver_action(ups_name: str, action: str):
    if not IDENTIFIER_REGEX.fullmatch(ups_name):
        return 1, "", f"Invalid UPS name: {ups_name}"
    if action == "stop":
        return stop_driver_and_cleanup(ups_name)
    if action == "restart":
        rc1, out1, err1 = stop_driver_and_cleanup(ups_name)
        rc2, out2, err2 = run_cmd(["upsdrvctl", "start", ups_name], timeout=30)
        return rc2, out1 + out2, err1 + err2
    if action == "start":
        _remove_stale_pid_files(ups_name)
        return run_cmd(["upsdrvctl", "start", ups_name], timeout=30)
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
