import pytest


SAMPLE_UPS_CONF = """[myups]
  driver = usbhid-ups
  port = auto
  desc = "Test UPS"
"""

SAMPLE_UPSMON = """MONITOR myups@localhost 1 monuser secret master
MINSUPPLIES 1
"""

SAMPLE_USERS = """[monuser]
  password = secret
  upsmon = master
"""


def test_list_ups(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: SAMPLE_UPS_CONF)
    monkeypatch.setattr("services.ups.ups_status", lambda n: "online")
    from services.ups import list_ups
    entries = list_ups()
    assert len(entries) == 1
    assert entries[0]["name"] == "myups"
    assert entries[0]["status"] == "online"


def test_list_ups_not_found(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: (_ for _ in ()).throw(FileNotFoundError))
    from services.ups import list_ups
    assert list_ups() == []


def test_get_ups(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: SAMPLE_UPS_CONF)
    monkeypatch.setattr("services.ups.ups_status", lambda n: "online")
    from services.ups import get_ups
    e = get_ups("myups")
    assert e is not None
    assert e["name"] == "myups"
    assert e["status"] == "online"


def test_get_ups_not_found(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: SAMPLE_UPS_CONF)
    from services.ups import get_ups
    assert get_ups("nonexistent") is None


def test_get_ups_detail(monkeypatch):
    monkeypatch.setattr("services.ups.ups_variables", lambda n: {"battery.charge": 100})
    from services.ups import get_ups_detail
    assert get_ups_detail("myups")["battery.charge"] == 100


def test_get_ups_detail_fail(monkeypatch):
    monkeypatch.setattr("services.ups.ups_variables", lambda n: None)
    from services.ups import get_ups_detail
    with pytest.raises(RuntimeError, match="Failed to query UPS"):
        get_ups_detail("myups")


def test_add_ups(monkeypatch):
    ops = {}
    monkeypatch.setattr("services.ups.read_file", lambda p: "")
    monkeypatch.setattr("services.ups.write_file", lambda p, c: ops.update({p: c}))
    monkeypatch.setattr("services.ups.ups_status", lambda n: "unknown")
    from services.ups import add_ups
    entry, err = add_ups({"name": "newups", "driver": "usbhid-ups", "port": "auto"})
    assert err is None
    assert entry["name"] == "newups"
    assert "pollinterval" in str(ops)


def test_add_ups_no_name():
    from services.ups import add_ups
    entry, err = add_ups({})
    assert entry is None
    assert err == "name is required"


def test_add_ups_duplicate(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: SAMPLE_UPS_CONF)
    from services.ups import add_ups
    entry, err = add_ups({"name": "myups", "driver": "usbhid-ups"})
    assert entry is None
    assert err == "UPS already exists"


def test_add_ups_invalid_directive(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: "")
    from services.ups import add_ups
    entry, err = add_ups({"name": "n", "directives": {"": "val"}})
    assert entry is None
    assert "invalid directive key" in err


def test_edit_ups(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: SAMPLE_UPS_CONF)
    monkeypatch.setattr("services.ups.write_file", lambda p, c: None)
    monkeypatch.setattr("services.ups.ups_status", lambda n: "online")
    from services.ups import edit_ups
    e = edit_ups("myups", {"desc": "Updated"})
    assert e is not None
    assert e["desc"] == "Updated"


def test_edit_ups_not_found(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: SAMPLE_UPS_CONF)
    from services.ups import edit_ups
    assert edit_ups("nope", {}) is None


def test_edit_ups_remove_field(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: SAMPLE_UPS_CONF)
    monkeypatch.setattr("services.ups.write_file", lambda p, c: None)
    monkeypatch.setattr("services.ups.ups_status", lambda n: "online")
    from services.ups import edit_ups
    e = edit_ups("myups", {"remove_desc": True})
    assert e is not None
    assert "desc" not in e


def test_edit_ups_directives(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: SAMPLE_UPS_CONF)
    monkeypatch.setattr("services.ups.write_file", lambda p, c: None)
    monkeypatch.setattr("services.ups.ups_status", lambda n: "online")
    from services.ups import edit_ups
    e = edit_ups("myups", {"directives": {"pollinterval": "10"}})
    assert e is not None


def test_delete_ups(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: SAMPLE_UPS_CONF if "ups.conf" in p else SAMPLE_UPSMON)
    writes = {}
    monkeypatch.setattr("services.ups.write_file", lambda p, c: writes.update({p: c}))
    monkeypatch.setattr("services.ups.stop_driver_and_cleanup", lambda n: None)
    monkeypatch.setattr("services.ups.list_hooks", lambda n: [])
    monkeypatch.setattr("services.ups.cleanup_for_ups", lambda n: None)
    from services.ups import delete_ups
    assert delete_ups("myups") is True


def test_delete_ups_not_found(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: SAMPLE_UPS_CONF)
    from services.ups import delete_ups
    assert delete_ups("nope") is False


def test_delete_ups_no_file(monkeypatch):
    monkeypatch.setattr("services.ups.read_file", lambda p: (_ for _ in ()).throw(FileNotFoundError))
    from services.ups import delete_ups
    assert delete_ups("myups") is False


def test_scan_ups(monkeypatch):
    monkeypatch.setattr("services.ups.run_cmd", lambda cmd, **kw: (0, '[nutdev-usb1]\n  driver = "usbhid-ups"\n', ""))
    from services.ups import scan_ups
    result = scan_ups()
    assert result["returncode"] == 0
    assert len(result["devices"]) == 1


def test_scan_ups_fail(monkeypatch):
    monkeypatch.setattr("services.ups.run_cmd", lambda cmd, **kw: (1, "", "error"))
    from services.ups import scan_ups
    result = scan_ups()
    assert result["returncode"] == 1
    assert result["devices"] == []


def test_apply_recommended_defaults_adds_pollinterval():
    from services.ups import _apply_recommended_defaults
    e = {"name": "u", "directives": [["driver", "usbhid-ups"]]}
    _apply_recommended_defaults(e)
    dirs = dict(e["directives"])
    assert dirs["pollinterval"] == "5"


def test_apply_recommended_defaults_preserves_existing():
    from services.ups import _apply_recommended_defaults
    e = {"name": "u", "directives": [["pollinterval", "10"]]}
    _apply_recommended_defaults(e)
    dirs = dict(e["directives"])
    assert dirs["pollinterval"] == "10"