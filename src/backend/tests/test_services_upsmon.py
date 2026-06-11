import pytest


SAMPLE_UPSMON = """MONITOR myups@localhost 1 monuser secret master
MINSUPPLIES 1
"""

SAMPLE_UPSCONF = """[myups]
  driver = usbhid-ups
  port = auto
"""


def test_get_upsmon_config(monkeypatch):
    monkeypatch.setattr("services.upsmon.read_file", lambda p: SAMPLE_UPSMON)
    from services.upsmon import get_upsmon_config
    cfg = get_upsmon_config()
    assert len(cfg["monitors"]) == 1
    assert cfg["minsupplies"] == 1


def test_get_upsmon_config_not_found(monkeypatch):
    monkeypatch.setattr("services.upsmon.read_file", lambda p: (_ for _ in ()).throw(FileNotFoundError))
    from services.upsmon import get_upsmon_config
    cfg = get_upsmon_config()
    assert cfg["monitors"] == []


def test_put_upsmon_config(monkeypatch):
    writes = {}
    monkeypatch.setattr("services.upsmon.read_file", lambda p: SAMPLE_UPSCONF)
    monkeypatch.setattr("services.upsmon.write_file", lambda p, c: writes.update({p: c}))
    from services.upsmon import put_upsmon_config
    data = {
        "monitors": [{"upsname": "myups", "hostspec": "@localhost", "power": 1, "username": "monuser", "password": "secret", "role": "master"}],
        "minsupplies": 1,
    }
    put_upsmon_config(data)
    assert len(writes) == 1


def test_put_upsmon_config_newline_in_field():
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="Newline"):
        put_upsmon_config({"notify_flag": {"ONLINE": "bad\nflag"}})


def test_put_upsmon_config_invalid_flag():
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="Invalid flag"):
        put_upsmon_config({"notify_flag": {"ONLINE": ["BADFLAG"]}})


def test_put_upsmon_config_invalid_timing():
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="positive integer"):
        put_upsmon_config({"timing": {"POLLFREQ": -1}})


def test_put_upsmon_config_invalid_minsupplies():
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="minsupplies"):
        put_upsmon_config({"minsupplies": -1})


def test_put_upsmon_config_invalid_upsname(monkeypatch):
    monkeypatch.setattr("services.upsmon.read_file", lambda p: SAMPLE_UPSCONF)
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="Invalid upsname"):
        put_upsmon_config({"monitors": [{"upsname": "", "hostspec": "@localhost", "power": 1, "username": "u", "password": "p", "role": "master"}]})


def test_put_upsmon_config_invalid_role(monkeypatch):
    monkeypatch.setattr("services.upsmon.read_file", lambda p: SAMPLE_UPSCONF)
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="Invalid role"):
        put_upsmon_config({"monitors": [{"upsname": "myups", "hostspec": "@localhost", "power": 1, "username": "u", "password": "p", "role": "invalid"}]})


def test_put_upsmon_config_upsname_not_in_upsconf(monkeypatch):
    monkeypatch.setattr("services.upsmon.read_file", lambda p: SAMPLE_UPSCONF)
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="does not exist in ups.conf"):
        put_upsmon_config({"monitors": [{"upsname": "nonexistent", "hostspec": "@localhost", "power": 1, "username": "u", "password": "p", "role": "master"}]})


def test_put_upsmon_config_missing_username(monkeypatch):
    monkeypatch.setattr("services.upsmon.read_file", lambda p: SAMPLE_UPSCONF)
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="username"):
        put_upsmon_config({"monitors": [{"upsname": "myups", "hostspec": "@localhost", "power": 1, "username": "", "password": "p", "role": "master"}]})


def test_put_upsmon_config_missing_password(monkeypatch):
    monkeypatch.setattr("services.upsmon.read_file", lambda p: SAMPLE_UPSCONF)
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="password"):
        put_upsmon_config({"monitors": [{"upsname": "myups", "hostspec": "@localhost", "power": 1, "username": "u", "password": "", "role": "master"}]})


def test_put_upsmon_config_negative_power(monkeypatch):
    monkeypatch.setattr("services.upsmon.read_file", lambda p: SAMPLE_UPSCONF)
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="power"):
        put_upsmon_config({"monitors": [{"upsname": "myups", "hostspec": "@localhost", "power": -1, "username": "u", "password": "p", "role": "master"}]})


def test_put_upsmon_config_notify_flag_not_list():
    from services.upsmon import put_upsmon_config
    with pytest.raises(ValueError, match="must be a list"):
        put_upsmon_config({"notify_flag": {"ONLINE": "SYSLOG"}})