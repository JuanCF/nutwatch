import os
import subprocess
import tempfile


def read_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_file(path: str, content: str) -> None:
    dir_path = os.path.dirname(path)
    fd, tmp_path = tempfile.mkstemp(dir=dir_path, prefix=".nut-admin-", suffix=".tmp")
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