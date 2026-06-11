import os
import tempfile
import stat

import pytest


def test_read_file(tmp_path):
    from utils import read_file
    f = tmp_path / "test.txt"
    f.write_text("hello")
    assert read_file(str(f)) == "hello"


def test_read_file_not_found(tmp_path):
    from utils import read_file
    with pytest.raises(FileNotFoundError):
        read_file(str(tmp_path / "nope.txt"))


def test_write_file_creates(tmp_path):
    from utils import write_file
    path = str(tmp_path / "new.txt")
    write_file(path, "content")
    assert (tmp_path / "new.txt").read_text() == "content"


def test_write_file_preserves_mode(tmp_path):
    from utils import write_file
    f = tmp_path / "exe.sh"
    f.write_text("old")
    os.chmod(str(f), 0o755)
    write_file(str(f), "new")
    assert stat.S_IMODE(os.stat(str(f)).st_mode) == 0o755


def test_write_file_atomic(tmp_path):
    from utils import write_file
    f = tmp_path / "target.txt"
    f.write_text("original")
    write_file(str(f), "updated")
    assert f.read_text() == "updated"


def test_run_cmd_ok():
    from utils import run_cmd
    rc, out, err = run_cmd(["echo", "hi"])
    assert rc == 0
    assert "hi" in out


def test_run_cmd_fail():
    from utils import run_cmd
    rc, out, err = run_cmd(["sh", "-c", "exit 1"])
    assert rc == 1


def test_run_cmd_timeout(monkeypatch):
    from utils import run_cmd
    monkeypatch.setattr("utils.subprocess.run", lambda cmd, **kw: (_ for _ in ()).throw(TimeoutExpired("cmd", 1)))
    import subprocess
    with monkeypatch.context() as m:
        m.setattr("subprocess.TimeoutExpired", subprocess.TimeoutExpired)
        rc, out, err = run_cmd(["sleep", "99"], timeout=1)
        assert rc == -1


def test_run_cmd_exception(monkeypatch):
    from utils import run_cmd
    def blow(*a, **kw):
        raise ValueError("boom")
    monkeypatch.setattr("utils.subprocess.run", blow)
    rc, out, err = run_cmd(["foo"])
    assert rc == -1
    assert "boom" in err


def test_ups_variables_parses(monkeypatch):
    from utils import run_cmd
    sample_out = (
        "battery.charge: 100\n"
        "ups.status: OL\n"
        "ups.load: 35.5\n"
        "ups.mfr: APC\n"
    )
    def fake_run(cmd, **kw):
        return type("R", (), {"returncode": 0, "stdout": sample_out, "stderr": ""})()
    monkeypatch.setattr("utils.subprocess.run", fake_run)
    from utils import ups_variables
    result = ups_variables("myups")
    assert result["battery.charge"] == 100
    assert result["ups.load"] == 35.5
    assert result["ups.mfr"] == "APC"
    assert result["ups.status"] == "OL"


def test_ups_variables_failure(monkeypatch):
    def fake_run(cmd, **kw):
        return type("R", (), {"returncode": 1, "stdout": "", "stderr": "error"})()
    monkeypatch.setattr("utils.subprocess.run", fake_run)
    from utils import ups_variables
    assert ups_variables("myups") is None


def test_ups_status_online(monkeypatch):
    def fake_run(cmd, **kw):
        return type("R", (), {"returncode": 0, "stdout": "ups.status: OL\n", "stderr": ""})()
    monkeypatch.setattr("utils.subprocess.run", fake_run)
    from utils import ups_status
    assert ups_status("myups") == "online"


def test_ups_status_onbatt(monkeypatch):
    def fake_run(cmd, **kw):
        return type("R", (), {"returncode": 0, "stdout": "ups.status: OB\n", "stderr": ""})()
    monkeypatch.setattr("utils.subprocess.run", fake_run)
    from utils import ups_status
    assert ups_status("myups") == "onbatt"


def test_ups_status_unknown(monkeypatch):
    def fake_run(cmd, **kw):
        return type("R", (), {"returncode": 1, "stdout": "", "stderr": ""})()
    monkeypatch.setattr("utils.subprocess.run", fake_run)
    from utils import ups_status
    assert ups_status("myups") == "unknown"


def test_stop_driver_and_cleanup_upsdrvctl_ok(monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr("utils.subprocess.run", fake_run)
    from utils import stop_driver_and_cleanup
    rc, out, err = stop_driver_and_cleanup("myups")
    assert rc == 0
    assert any("upsdrvctl" in c and "stop" in c for c in calls)


def test_stop_driver_and_cleanup_fallback_systemctl(monkeypatch):
    results = [
        type("R", (), {"returncode": 1, "stdout": "", "stderr": ""})(),
        type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})(),
    ]
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return results.pop(0)

    monkeypatch.setattr("utils.subprocess.run", fake_run)
    from utils import stop_driver_and_cleanup
    rc, out, err = stop_driver_and_cleanup("myups")
    assert rc == 0