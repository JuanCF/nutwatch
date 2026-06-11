import pytest


def test_list_targets_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("services.wol.WOL_JSON", str(tmp_path / "wol.json"))
    (tmp_path / "wol.json").write_text("{}")
    from services.wol import list_targets
    assert list_targets() == {}


def test_list_targets_not_found(tmp_path, monkeypatch):
    monkeypatch.setattr("services.wol.WOL_JSON", str(tmp_path / "wol.json"))
    from services.wol import list_targets
    assert list_targets() == {}


def test_add_target(monkeypatch):
    ops = {}
    monkeypatch.setattr("services.wol.WOL_JSON", "/tmp/test_wol.json")
    monkeypatch.setattr("services.wol.write_file", lambda p, c: ops.update({p: c}))
    monkeypatch.setattr("os.chmod", lambda p, m: None)
    monkeypatch.setattr("os.chown", lambda p, u, g: None)
    from services.wol import add_target
    result = add_target("server1", "aa:bb:cc:dd:ee:ff", "192.168.1.255", "Server room")
    assert result is not None
    assert result["mac"] == "aa:bb:cc:dd:ee:ff"


def test_add_target_invalid_mac():
    from services.wol import add_target
    with pytest.raises(ValueError, match="Invalid MAC"):
        add_target("s", "not-a-mac")


def test_add_target_duplicate(monkeypatch):
    monkeypatch.setattr("services.wol.WOL_JSON", "/tmp/test_wol2.json")
    monkeypatch.setattr("services.wol.write_file", lambda p, c: None)
    monkeypatch.setattr("os.chmod", lambda p, m: None)
    monkeypatch.setattr("os.chown", lambda p, u, g: None)
    from services.wol import add_target
    add_target("dup", "11:22:33:44:55:66")
    monkeypatch.setattr("services.wol._load_json", lambda p: {"targets": {"dup": {"mac": "11:22:33:44:55:66"}}})
    result = add_target("dup", "aa:bb:cc:dd:ee:ff")
    assert result is None


def test_get_target(monkeypatch):
    monkeypatch.setattr("services.wol.list_targets", lambda: {"box": {"mac": "11:22:33:44:55:66"}})
    from services.wol import get_target
    assert get_target("box")["mac"] == "11:22:33:44:55:66"


def test_get_target_missing(monkeypatch):
    monkeypatch.setattr("services.wol.list_targets", lambda: {})
    from services.wol import get_target
    assert get_target("box") is None


def test_update_target(monkeypatch):
    monkeypatch.setattr("services.wol.get_target", lambda n: {"mac": "aa:bb:cc:dd:ee:ff", "broadcast": "255.255.255.255", "description": ""})
    monkeypatch.setattr("services.wol.write_file", lambda p, c: None)
    monkeypatch.setattr("os.chmod", lambda p, m: None)
    monkeypatch.setattr("os.chown", lambda p, u, g: None)
    monkeypatch.setattr("services.wol._load_json", lambda p: {"targets": {"box": {"mac": "aa:bb:cc:dd:ee:ff", "broadcast": "255.255.255.255"}}})
    from services.wol import update_target
    result = update_target("box", description="Updated")
    assert result["description"] == "Updated"


def test_update_target_not_found(monkeypatch):
    monkeypatch.setattr("services.wol.get_target", lambda n: None)
    from services.wol import update_target
    assert update_target("box") is None


def test_update_target_invalid_mac(monkeypatch):
    monkeypatch.setattr("services.wol.get_target", lambda n: {"mac": "aa:bb:cc:dd:ee:ff"})
    from services.wol import update_target
    with pytest.raises(ValueError, match="Invalid MAC"):
        update_target("box", mac="bad")


def test_delete_target(monkeypatch):
    monkeypatch.setattr("services.wol.WOL_JSON", "/tmp/wol_del.json")
    monkeypatch.setattr("services.wol.WOL_EVENTS_JSON", "/tmp/wol_ev_del.json")
    monkeypatch.setattr("services.wol.write_file", lambda p, c: None)
    monkeypatch.setattr("os.chmod", lambda p, m: None)
    monkeypatch.setattr("os.chown", lambda p, u, g: None)

    def fake_load(p):
        if "wol-events" in p:
            return {"mappings": [{"ups": "u", "event": "ONLINE", "targets": ["box"]}]}
        return {"targets": {"box": {"mac": "aa:bb:cc:dd:ee:ff"}}}

    monkeypatch.setattr("services.wol._load_json", fake_load)
    from services.wol import delete_target
    result = delete_target("box")
    assert result is True


def test_delete_target_not_found(monkeypatch):
    monkeypatch.setattr("services.wol._load_json", lambda p: {})
    from services.wol import delete_target
    assert delete_target("box") is False


def test_send_wol(monkeypatch):
    monkeypatch.setattr("services.wol.get_target", lambda n: {"mac": "aa:bb:cc:dd:ee:ff", "broadcast": "255.255.255.255"})
    sent = []
    monkeypatch.setattr("wakeonlan.send_magic_packet", lambda mac, ip_address, port: sent.append((mac, ip_address, port)))
    from services.wol import send_wol
    assert send_wol("box") is True
    assert len(sent) == 1


def test_send_wol_not_found(monkeypatch):
    monkeypatch.setattr("services.wol.get_target", lambda n: None)
    from services.wol import send_wol
    with pytest.raises(ValueError, match="not found"):
        send_wol("box")


def test_send_wol_no_package(monkeypatch):
    monkeypatch.setattr("services.wol.get_target", lambda n: {"mac": "aa:bb:cc:dd:ee:ff"})
    import sys
    monkeypatch.setitem(sys.modules, "wakeonlan", None)
    import importlib
    monkeypatch.setattr(importlib, "import_module", lambda n: (_ for _ in ()).throw(ImportError("no package")))
    from services.wol import send_wol
    with pytest.raises(RuntimeError, match="not installed"):
        send_wol("box")


def test_wake_all(monkeypatch):
    monkeypatch.setattr("services.wol.list_targets", lambda: {"box": {"mac": "aa:bb:cc:dd:ee:ff"}, "box2": {"mac": "11:22:33:44:55:66"}})
    monkeypatch.setattr("services.wol.send_wol", lambda n: True)
    from services.wol import wake_all
    results = wake_all()
    assert results["box"] == "ok"
    assert results["box2"] == "ok"


def test_wake_all_partial_failure(monkeypatch):
    monkeypatch.setattr("services.wol.list_targets", lambda: {"ok": {}, "fail": {}})
    def send(n):
        if n == "fail":
            raise RuntimeError("boom")
        return True
    monkeypatch.setattr("services.wol.send_wol", send)
    from services.wol import wake_all
    results = wake_all()
    assert results["ok"] == "ok"
    assert "boom" in results["fail"]


def test_list_mappings(monkeypatch):
    monkeypatch.setattr("services.wol._load_json", lambda p: {"mappings": [{"ups": "u", "event": "ONLINE", "targets": ["box"]}]})
    from services.wol import list_mappings
    assert len(list_mappings()) == 1


def test_add_mapping(monkeypatch):
    monkeypatch.setattr("services.wol.list_targets", lambda: {"box": {"mac": "aa:bb:cc:dd:ee:ff"}})
    monkeypatch.setattr("services.wol.write_file", lambda p, c: None)
    monkeypatch.setattr("os.chmod", lambda p, m: None)
    monkeypatch.setattr("os.chown", lambda p, u, g: None)
    from services.wol import add_mapping
    m = add_mapping("myups", "ONLINE", ["box"])
    assert m["ups"] == "myups"
    assert m["targets"] == ["box"]


def test_add_mapping_unknown_target(monkeypatch):
    monkeypatch.setattr("services.wol.list_targets", lambda: {})
    from services.wol import add_mapping
    with pytest.raises(ValueError, match="Unknown"):
        add_mapping("u", "ONLINE", ["nope"])


def test_add_mapping_duplicate(monkeypatch):
    monkeypatch.setattr("services.wol.list_targets", lambda: {"box": {}})
    monkeypatch.setattr("services.wol._load_json", lambda p: {"mappings": [{"ups": "u", "event": "ONLINE", "targets": ["box"]}]})
    from services.wol import add_mapping
    with pytest.raises(ValueError, match="already exists"):
        add_mapping("u", "ONLINE", ["box"])


def test_delete_mapping(monkeypatch):
    monkeypatch.setattr("services.wol.write_file", lambda p, c: None)
    monkeypatch.setattr("os.chmod", lambda p, m: None)
    monkeypatch.setattr("os.chown", lambda p, u, g: None)
    from services.wol import delete_mapping
    monkeypatch.setattr("services.wol._load_json", lambda p: {"mappings": [{"ups": "u", "event": "O", "targets": ["b"]}]})
    assert delete_mapping(0) is True


def test_delete_mapping_out_of_range(monkeypatch):
    monkeypatch.setattr("services.wol._load_json", lambda p: {"mappings": []})
    from services.wol import delete_mapping
    assert delete_mapping(0) is False


def test_dispatch(monkeypatch):
    monkeypatch.setattr("services.wol.list_mappings", lambda: [{"ups": "myups", "event": "ONLINE", "targets": ["box"]}])
    sent = []
    monkeypatch.setattr("services.wol.send_wol", lambda n: sent.append(n))
    from services.wol import dispatch
    dispatch("myups", "ONLINE")
    assert sent == ["box"]


def test_dispatch_no_match(monkeypatch):
    monkeypatch.setattr("services.wol.list_mappings", lambda: [{"ups": "myups", "event": "ONBATT", "targets": ["box"]}])
    sent = []
    monkeypatch.setattr("services.wol.send_wol", lambda n: sent.append(n))
    from services.wol import dispatch
    dispatch("myups", "ONLINE")
    assert sent == []


def test_dispatch_error_logged(monkeypatch):
    monkeypatch.setattr("services.wol.list_mappings", lambda: [{"ups": "u", "event": "ONLINE", "targets": ["bad"]}])
    monkeypatch.setattr("services.wol.send_wol", lambda n: (_ for _ in ()).throw(RuntimeError("fail")))
    from services.wol import dispatch
    dispatch("u", "ONLINE")


def test_cleanup_for_ups(monkeypatch):
    monkeypatch.setattr("services.wol.WOL_EVENTS_JSON", "/tmp/wol_ev_clean.json")
    monkeypatch.setattr("services.wol.write_file", lambda p, c: None)
    monkeypatch.setattr("os.chmod", lambda p, m: None)
    monkeypatch.setattr("os.chown", lambda p, u, g: None)
    from services.wol import cleanup_for_ups
    monkeypatch.setattr("services.wol._load_json", lambda p: {"mappings": [{"ups": "gone", "event": "O", "targets": ["b"]}, {"ups": "keep", "event": "O", "targets": ["b"]}]})
    cleanup_for_ups("gone")