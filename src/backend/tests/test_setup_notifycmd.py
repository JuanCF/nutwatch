"""scripts/setup.sh: notifycmd.sh deployment (deploy_notifycmd and friends).

Each test sources setup.sh in a bash subprocess with NUT_DIR, the backup dir
and the state dir pointed at tmp_path, and chown stubbed out (tests don't run
as root).
"""

import hashlib
import re
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SETUP_SH = REPO / "scripts" / "setup.sh"
RELEASE_SCRIPT = REPO / "src" / "backend" / "scripts" / "notifycmd.sh"


def run_setup(tmp_path, body, env=None):
    script = f"""
source {SETUP_SH}
chown() {{ :; }}
NUT_DIR={tmp_path}/nut
NUT_BACKUP_DIR={tmp_path}/backups
NUTWATCH_STATE_DIR={tmp_path}/state
NOTIFYCMD_HASH_FILE={tmp_path}/state/notifycmd.sha256
mkdir -p "$NUT_DIR"
{body}
"""
    full_env = {"PATH": "/usr/bin:/bin", "NUTWATCH_SETUP_SOURCE_ONLY": "1"}
    full_env.update(env or {})
    result = subprocess.run(
        ["bash", "-c", script], env=full_env, capture_output=True, text=True, stdin=subprocess.DEVNULL
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout


@pytest.fixture
def nut(tmp_path):
    (tmp_path / "nut").mkdir()
    return tmp_path / "nut"


def backups(tmp_path):
    d = tmp_path / "backups"
    return sorted(d.iterdir()) if d.exists() else []


def deploy(tmp_path, env=None):
    return run_setup(tmp_path, f'deploy_notifycmd "{RELEASE_SCRIPT}"', env)


def test_installs_when_absent_and_records_hash(tmp_path, nut):
    deploy(tmp_path)
    target = nut / "notifycmd.sh"
    assert target.read_bytes() == RELEASE_SCRIPT.read_bytes()
    assert target.stat().st_mode & 0o777 == 0o750
    recorded = (tmp_path / "state" / "notifycmd.sha256").read_text().strip()
    assert recorded == hashlib.sha256(RELEASE_SCRIPT.read_bytes()).hexdigest()
    assert backups(tmp_path) == []


def test_replaces_unedited_script_from_previous_deploy_silently(tmp_path, nut):
    old = b"#!/bin/bash\n# an older NutWatch notifycmd.sh\n"
    (nut / "notifycmd.sh").write_bytes(old)
    (tmp_path / "state").mkdir()
    (tmp_path / "state" / "notifycmd.sha256").write_text(hashlib.sha256(old).hexdigest() + "\n")
    out = deploy(tmp_path, {"AUTO": "1"})
    assert (nut / "notifycmd.sh").read_bytes() == RELEASE_SCRIPT.read_bytes()
    assert "WARN" not in out
    assert backups(tmp_path) == []


def test_replaces_known_template_without_recorded_hash(tmp_path, nut):
    run_setup(tmp_path, 'default_notifycmd >"$NUT_DIR/notifycmd.sh"')
    deploy(tmp_path, {"AUTO": "1"})
    assert (nut / "notifycmd.sh").read_bytes() == RELEASE_SCRIPT.read_bytes()
    assert backups(tmp_path) == []


@pytest.mark.parametrize(
    "content",
    [
        "#!/bin/bash\nmail -s \"$NOTIFYTYPE\" root </dev/null\n",
        # NutWatch's script plus a local edit still mentions notify.d.
        RELEASE_SCRIPT.read_text() + 'curl -s https://example.invalid/push -d "$NOTIFYTYPE"\n',
    ],
)
def test_auto_keeps_foreign_or_edited_script(tmp_path, nut, content):
    (nut / "notifycmd.sh").write_text(content)
    out = deploy(tmp_path, {"AUTO": "1"})
    assert (nut / "notifycmd.sh").read_text() == content
    assert "Keeping it" in out
    assert backups(tmp_path) == []
    assert not (tmp_path / "state" / "notifycmd.sha256").exists()


def test_force_backs_up_then_replaces_edited_script(tmp_path, nut):
    content = RELEASE_SCRIPT.read_text() + "echo custom\n"
    (nut / "notifycmd.sh").write_text(content)
    deploy(tmp_path, {"AUTO": "1", "FORCE_NUT_OVERWRITE": "1"})
    assert (nut / "notifycmd.sh").read_bytes() == RELEASE_SCRIPT.read_bytes()
    (saved,) = backups(tmp_path)
    assert saved.name.startswith("notifycmd.sh-")
    assert saved.read_text() == content
    assert saved.stat().st_mode & 0o777 == 0o700


def test_force_replaces_symlink_without_touching_its_target(tmp_path, nut):
    real = tmp_path / "managed" / "notify.sh"
    real.parent.mkdir()
    real.write_text("#!/bin/bash\necho mine\n")
    real.chmod(0o755)
    (nut / "notifycmd.sh").symlink_to(real)
    deploy(tmp_path, {"AUTO": "1", "FORCE_NUT_OVERWRITE": "1"})
    target = nut / "notifycmd.sh"
    assert not target.is_symlink()
    assert target.read_bytes() == RELEASE_SCRIPT.read_bytes()
    assert real.read_text() == "#!/bin/bash\necho mine\n"
    assert real.stat().st_mode & 0o777 == 0o755
    (saved,) = backups(tmp_path)
    assert saved.read_text() == "#!/bin/bash\necho mine\n"


def test_auto_keeps_symlink_even_to_identical_content(tmp_path, nut):
    (nut / "notifycmd.sh").symlink_to(RELEASE_SCRIPT)
    deploy(tmp_path, {"AUTO": "1"})
    assert (nut / "notifycmd.sh").is_symlink()


@pytest.mark.parametrize(
    "upsmon, expected",
    [
        ('NOTIFYCMD "{nut}/notifycmd.sh"\nNOTIFYFLAG ONBATT SYSLOG+WALL+EXEC\n', None),
        ('NOTIFYCMD "/usr/local/bin/other.sh"\nNOTIFYFLAG ONBATT SYSLOG+WALL+EXEC\n', "sets NOTIFYCMD"),
        ("NOTIFYFLAG ONBATT SYSLOG+WALL+EXEC\n", "sets NOTIFYCMD to nothing"),
        ('NOTIFYCMD "{nut}/notifycmd.sh"\nNOTIFYFLAG ONBATT SYSLOG+WALL\n', "includes EXEC"),
    ],
)
def test_warns_when_upsmon_wont_run_notifycmd(tmp_path, nut, upsmon, expected):
    (nut / "upsmon.conf").write_text(upsmon.format(nut=nut))
    out = run_setup(tmp_path, "warn_if_notifycmd_unused")
    if expected is None:
        assert "WARN" not in out
    else:
        assert expected in out


def test_vm_template_hash_is_known():
    """vm/nut-vm.sh never records a hash, so its template must be listed."""
    vm = (REPO / "vm" / "nut-vm.sh").read_text()
    m = re.search(r"cat >\"\$tmp_dir/notifycmd.sh\" <<'NOTIFY_EOF'\n(.*?\n)NOTIFY_EOF\n", vm, re.S)
    assert m, "notifycmd.sh template not found in vm/nut-vm.sh"
    known = re.search(r"NOTIFYCMD_KNOWN_SHA256=\((.*?)\)", SETUP_SH.read_text(), re.S).group(1).split()
    assert hashlib.sha256(m.group(1).encode()).hexdigest() in known
