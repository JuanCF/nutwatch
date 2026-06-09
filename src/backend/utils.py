import glob
import os
import re
import subprocess
import tempfile


def read_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_file(path: str, content: str) -> None:
    dir_path = os.path.dirname(path)
    fd, tmp_path = tempfile.mkstemp(dir=dir_path, prefix=".nutwatch-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        try:
            st = os.stat(path)
            os.chmod(tmp_path, st.st_mode)
            os.chown(tmp_path, st.st_uid, st.st_gid)
        except (FileNotFoundError, PermissionError):
            os.chmod(tmp_path, 0o640)
        os.replace(tmp_path, path)
        tmp_path = None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def run_cmd(cmd: list, timeout: int = 30) -> tuple:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return proc.returncode, proc.stdout, proc.stderr
    except Exception as e:
        return -1, "", str(e)


def stop_driver_and_cleanup(name: str) -> tuple:
    """Stop a NUT driver and clean up stale PID files / orphaned processes.

    Returns the (rc, stdout, stderr) from the primary ``upsdrvctl stop``
    attempt so callers can surface legacy error text when needed.
    """
    # 1. Primary stop for traditional / non-systemd installs.
    rc, out, err = run_cmd(["upsdrvctl", "stop", name], timeout=30)

    # 2. Fallback for modern systemd-managed NUT (nut-driver-enumerator).
    rc2, _, _ = run_cmd(["systemctl", "stop", f"nut-driver@{name}"], timeout=15)

    # 3. Kill by PID file and remove the files so subsequent starts don't warn.
    fallback_ok = False
    for base in ("/var/run/nut", "/run/nut"):
        for pid_file in glob.glob(os.path.join(base, f"*-{name}.pid")):
            try:
                with open(pid_file, "r", encoding="utf-8") as f:
                    pid = f.read().strip()
                if pid and pid.isdigit():
                    rc3, _, _ = run_cmd(["kill", "-9", pid], timeout=5)
                    if rc3 == 0:
                        fallback_ok = True
                    try:
                        os.kill(int(pid), 0)
                    except ProcessLookupError:
                        pass
                    except (PermissionError, OSError):
                        continue
                    else:
                        continue
                try:
                    os.unlink(pid_file)
                except OSError:
                    pass
            except (OSError, ValueError):
                pass

    # 4. Final safety net: pkill any remaining driver processes for this UPS.
    #    pkill -f interprets POSIX Extended Regular Expressions.
    safe_name = re.escape(name)
    rc4, _, _ = run_cmd(["pkill", "-9", "-f", f".*-a[[:space:]]+{safe_name}([[:space:]]|$)"], timeout=5)

    if rc != 0 and (rc2 == 0 or rc4 == 0 or fallback_ok):
        rc = 0
        out = ""
        err = ""

    return rc, out, err


def ups_variables(name: str) -> dict | None:
    rc, out, _ = run_cmd(["upsc", f"{name}@localhost"], timeout=10)
    if rc != 0:
        return None
    result = {}
    for line in out.splitlines():
        line = line.strip()
        if not line or ": " not in line:
            continue
        key, val = line.split(": ", 1)
        try:
            if "." in val:
                val = float(val)
            else:
                val = int(val)
        except ValueError:
            pass
        result[key] = val
    return result


def ups_status(name: str) -> str:
    rc, out, _ = run_cmd(["upsc", f"{name}@localhost"], timeout=5)
    if rc != 0:
        return "unknown"
    for line in out.splitlines():
        if line.startswith("ups.status:"):
            status = line.split(":", 1)[1].strip()
            if "OL" in status:
                return "online"
            elif "OB" in status:
                return "onbatt"
            return "offline"
    return "unknown"
