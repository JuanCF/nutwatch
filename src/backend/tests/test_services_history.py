import os
import time
import threading
import pytest
import sqlite3

from services.history import (
    record_snapshot,
    get_history,
    get_available_variables,
    get_latest_timestamp,
    prune,
    get_db,
    HISTORY_DB,
)


@pytest.fixture(autouse=True)
def _patch_db(tmp_path, monkeypatch):
    db_path = os.path.join(tmp_path, "test_history.db")
    monkeypatch.setattr("services.history.HISTORY_DB", db_path)


def test_record_and_query():
    ts = time.time()
    record_snapshot("myups", {"battery.charge": 100, "ups.load": 35})
    time.sleep(0.01)
    record_snapshot("myups", {"battery.charge": 99, "ups.load": 38})
    since = ts - 1
    result = get_history("myups", since=since)
    assert result["ups"] == "myups"
    assert "battery.charge" in result["variables"]
    assert "ups.load" in result["variables"]
    assert len(result["variables"]["battery.charge"]) == 2
    assert result["variables"]["battery.charge"][0][1] == 100
    assert result["variables"]["battery.charge"][1][1] == 99


def test_empty_history():
    result = get_history("nonexistent", since=0)
    assert result["ups"] == "nonexistent"
    assert result["variables"] == {}


def test_variable_filter():
    record_snapshot("myups", {"battery.charge": 100, "ups.load": 35, "input.voltage": 120})
    result = get_history("myups", variables=["battery.charge", "input.voltage"], since=0)
    assert "battery.charge" in result["variables"]
    assert "input.voltage" in result["variables"]
    assert "ups.load" not in result["variables"]


def test_prune(monkeypatch):
    record_snapshot("myups", {"battery.charge": 100})
    result = get_history("myups", since=0)
    assert len(result["variables"].get("battery.charge", [])) > 0

    real_time = time.time
    monkeypatch.setattr("services.history.time.time", lambda: real_time() + 999999)
    deleted = prune(retention_days=1)
    assert deleted > 0

    result = get_history("myups", since=0)
    assert len(result["variables"].get("battery.charge", [])) == 0


def test_non_numeric_skipped():
    record_snapshot("myups", {"ups.status": "OL", "battery.charge": 100})
    result = get_history("myups", since=0)
    assert "ups.status" not in result["variables"]
    assert "battery.charge" in result["variables"]


def test_concurrent_read_write():
    import threading as _threading

    errors = []

    def writer():
        for i in range(20):
            try:
                record_snapshot("concurrent_ups", {"battery.charge": i})
            except Exception as e:
                errors.append(e)

    def reader():
        for i in range(20):
            try:
                get_history("concurrent_ups", since=0)
            except Exception as e:
                errors.append(e)

    threads = []
    for _ in range(4):
        t = _threading.Thread(target=writer)
        t.start()
        threads.append(t)
    for _ in range(4):
        t = _threading.Thread(target=reader)
        t.start()
        threads.append(t)
    for t in threads:
        t.join()
    assert not errors


def test_get_available_variables():
    record_snapshot("myups", {"battery.charge": 100, "ups.load": 35, "input.voltage": 120})
    vars_list = get_available_variables("myups")
    assert "battery.charge" in vars_list
    assert "ups.load" in vars_list
    assert "input.voltage" in vars_list
    assert len(vars_list) == 3


def test_get_latest_timestamp():
    assert get_latest_timestamp("myups") is None
    record_snapshot("myups", {"battery.charge": 100})
    ts = get_latest_timestamp("myups")
    assert ts is not None
    assert isinstance(ts, float)


def test_get_db_idempotent():
    conn1 = get_db()
    conn1.close()
    conn2 = get_db()
    conn2.close()


def test_record_snapshot_empty_dict():
    record_snapshot("myups", {})


def test_record_snapshot_all_non_numeric():
    record_snapshot("myups", {"ups.status": "OL", "device.model": "test"})
    result = get_history("myups", since=0)
    assert result["variables"] == {}


def test_prune_noop():
    record_snapshot("myups", {"battery.charge": 100})
    deleted = prune(retention_days=90)
    assert deleted == 0