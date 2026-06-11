import os

import pytest


def test_get_hook_path():
    from services.hooks import get_hook_path
    path = get_hook_path("myups", "ONLINE")
    assert path.endswith("myups_ONLINE.sh")
    assert "/etc/nut/notify.d/" in path


def test_list_hooks_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("services.hooks.HOOKDIR", str(tmp_path))
    monkeypatch.setattr("services.hooks.os.path.isfile", lambda p: False)
    from services.hooks import list_hooks
    assert list_hooks("myups") == []


def test_list_hooks_found(tmp_path, monkeypatch):
    hookdir = str(tmp_path)
    monkeypatch.setattr("services.hooks.HOOKDIR", hookdir)
    for ev in ("ONLINE", "ONBATT"):
        (tmp_path / f"myups_{ev}.sh").write_text("#!/bin/sh")
    from services.hooks import list_hooks
    result = list_hooks("myups")
    assert "ONLINE" in result
    assert "ONBATT" in result
    assert len(result) == 2


def test_get_hook_found(tmp_path, monkeypatch):
    hookdir = str(tmp_path)
    monkeypatch.setattr("services.hooks.HOOKDIR", hookdir)
    (tmp_path / "myups_ONLINE.sh").write_text("echo hello")
    from services.hooks import get_hook
    assert get_hook("myups", "ONLINE") == "echo hello"


def test_get_hook_not_found(tmp_path, monkeypatch):
    hookdir = str(tmp_path)
    monkeypatch.setattr("services.hooks.HOOKDIR", hookdir)
    from services.hooks import get_hook
    assert get_hook("myups", "ONLINE") is None


def test_put_hook_writes(tmp_path, monkeypatch):
    hookdir = str(tmp_path)
    monkeypatch.setattr("services.hooks.HOOKDIR", hookdir)
    monkeypatch.setattr("os.chmod", lambda p, m: None)
    monkeypatch.setattr("os.chown", lambda p, u, g: None)
    monkeypatch.setattr("grp.getgrnam", lambda n: type("g", (), {"gr_gid": 999})())
    from services.hooks import put_hook
    put_hook("myups", "ONLINE", "echo hello")
    path = tmp_path / "myups_ONLINE.sh"
    assert path.read_text() == "echo hello"


def test_put_hook_invalid_event(tmp_path, monkeypatch):
    monkeypatch.setattr("services.hooks.HOOKDIR", str(tmp_path))
    from services.hooks import put_hook
    with pytest.raises(ValueError, match="Invalid event"):
        put_hook("myups", "INVALID", "content")


def test_put_hook_carriage_return(tmp_path, monkeypatch):
    monkeypatch.setattr("services.hooks.HOOKDIR", str(tmp_path))
    from services.hooks import put_hook
    with pytest.raises(ValueError, match="carriage return"):
        put_hook("myups", "ONLINE", "line\rcontent")


def test_put_hook_missing_group(tmp_path, monkeypatch):
    hookdir = str(tmp_path)
    monkeypatch.setattr("services.hooks.HOOKDIR", hookdir)
    monkeypatch.setattr("os.chmod", lambda p, m: None)
    monkeypatch.setattr("grp.getgrnam", lambda n: (_ for _ in ()).throw(KeyError("nut")))
    from services.hooks import put_hook
    with pytest.raises(KeyError):
        put_hook("myups", "ONLINE", "echo hello")


def test_delete_hook_exists(tmp_path, monkeypatch):
    hookdir = str(tmp_path)
    monkeypatch.setattr("services.hooks.HOOKDIR", hookdir)
    f = tmp_path / "myups_ONLINE.sh"
    f.write_text("content")
    from services.hooks import delete_hook
    delete_hook("myups", "ONLINE")
    assert not f.exists()


def test_delete_hook_missing(tmp_path, monkeypatch):
    hookdir = str(tmp_path)
    monkeypatch.setattr("services.hooks.HOOKDIR", hookdir)
    from services.hooks import delete_hook
    delete_hook("myups", "ONLINE")


def test_list_hooks_invalid_name():
    from services.hooks import list_hooks
    with pytest.raises(ValueError):
        list_hooks("")


def test_get_hook_invalid_name():
    from services.hooks import get_hook
    with pytest.raises(ValueError):
        get_hook("", "ONLINE")


def test_get_hook_invalid_event():
    from services.hooks import get_hook
    with pytest.raises(ValueError):
        get_hook("myups", "")


def test_delete_hook_invalid_name():
    from services.hooks import delete_hook
    with pytest.raises(ValueError):
        delete_hook("", "ONLINE")