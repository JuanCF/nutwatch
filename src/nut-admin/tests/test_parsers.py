from parsers import (
    parse_ups_conf, serialize_ups_conf,
    parse_upsd_users, serialize_upsd_users,
    parse_nut_scanner_output,
    parse_monitor_lines, remove_monitor_line, add_monitor_line,
    find_monitor_user,
    ensure_minsupplies, set_minsupplies,
)


def test_parse_ups_conf_basic():
    content = "[myups]\n  driver = usbhid-ups\n  port = auto\n"
    entries = parse_ups_conf(content)
    assert len(entries) == 1
    assert entries[0]["name"] == "myups"
    assert entries[0]["driver"] == "usbhid-ups"
    assert entries[0]["port"] == "auto"


def test_parse_ups_conf_with_comments():
    content = "# this is a comment\n\n[myups]\n  driver = usbhid-ups\n"
    entries = parse_ups_conf(content)
    assert len(entries) == 1
    assert entries[0]["name"] == "myups"


def test_ups_conf_roundtrip():
    content = '[myups]\n  driver = usbhid-ups\n  port = auto\n  desc = "My UPS"\n'
    entries = parse_ups_conf(content)
    serialized = serialize_ups_conf(entries)
    entries2 = parse_ups_conf(serialized)
    assert entries == entries2


def test_parse_upsd_users_basic():
    content = "[monuser]\n  password = secret\n  upsmon = slave\n"
    entries = parse_upsd_users(content)
    assert len(entries) == 1
    assert entries[0]["name"] == "monuser"
    assert entries[0]["password"] == "secret"
    assert entries[0]["upsmon"] == "slave"


def test_upsd_users_roundtrip():
    content = "[monuser]\n  password = secret\n  upsmon = slave\n"
    entries = parse_upsd_users(content)
    serialized = serialize_upsd_users(entries)
    entries2 = parse_upsd_users(serialized)
    assert entries == entries2


def test_upsd_users_with_actions():
    content = "[admin]\n  password = secret\n  actions = SET\n  instcmds = all\n"
    entries = parse_upsd_users(content)
    assert len(entries) == 1
    assert entries[0]["actions"] == "SET"
    assert entries[0]["instcmds"] == "all"


def test_parse_ups_conf_multiple():
    content = "[ups1]\n  driver = usbhid-ups\n\n[ups2]\n  driver = blazer_usb\n"
    entries = parse_ups_conf(content)
    assert len(entries) == 2
    assert entries[0]["name"] == "ups1"
    assert entries[1]["name"] == "ups2"


def test_ups_conf_extra_directives():
    content = "[myups]\n  driver = usbhid-ups\n  port = auto\n  vendorid = 0463\n"
    entries = parse_ups_conf(content)
    assert len(entries) == 1
    assert entries[0]["directives"] == [["vendorid", "0463"]]


def test_parse_nut_scanner_single():
    output = '[nutdev-usb1]\n  driver = "usbhid-ups"\n  port = "auto"\n  vendorid = "0463"\n  productid = "ffff"\n  desc = "Eaton UPS"\n'
    devices = parse_nut_scanner_output(output)
    assert len(devices) == 1
    d = devices[0]
    assert d["scanner_name"] == "nutdev-usb1"
    assert d["driver"] == "usbhid-ups"
    assert d["port"] == "auto"
    assert d["vendorid"] == "0463"
    assert d["productid"] == "ffff"
    assert d["desc"] == "Eaton UPS"
    assert d["extra"] == {}


def test_parse_nut_scanner_multiple():
    output = '[nutdev-usb1]\n  driver = "usbhid-ups"\n  port = "auto"\n\n[nutdev-usb2]\n  driver = "blazer_usb"\n  port = "/dev/usb/hiddev0"\n'
    devices = parse_nut_scanner_output(output)
    assert len(devices) == 2
    assert devices[0]["scanner_name"] == "nutdev-usb1"
    assert devices[0]["driver"] == "usbhid-ups"
    assert devices[1]["scanner_name"] == "nutdev-usb2"
    assert devices[1]["driver"] == "blazer_usb"


def test_parse_nut_scanner_extra_directives():
    output = '[nutdev-usb1]\n  driver = "usbhid-ups"\n  port = "auto"\n  vendorid = "0463"\n  productid = "ffff"\n  pollinterval = "5"\n'
    devices = parse_nut_scanner_output(output)
    assert len(devices) == 1
    d = devices[0]
    assert d["vendorid"] == "0463"
    assert d["productid"] == "ffff"
    assert d["extra"] == {"pollinterval": "5"}


def test_parse_nut_scanner_empty():
    assert parse_nut_scanner_output("") == []
    assert parse_nut_scanner_output("No matching device found") == []


def test_parse_monitor_lines():
    content = "MONITOR ups@localhost 1 monuser secret master\nMINSUPPLIES 1\n"
    monitors = parse_monitor_lines(content)
    assert len(monitors) == 1
    assert monitors[0]["upsname"] == "ups"
    assert monitors[0]["hostspec"] == "@localhost"
    assert monitors[0]["power"] == 1
    assert monitors[0]["username"] == "monuser"
    assert monitors[0]["password"] == "secret"
    assert monitors[0]["role"] == "master"


def test_remove_monitor_line():
    content = "MONITOR ups@localhost 1 monuser secret master\nMINSUPPLIES 1\n"
    result = remove_monitor_line(content, "ups")
    assert "MONITOR" not in result
    assert "MINSUPPLIES 1" in result


def test_remove_monitor_line_preserves_others():
    content = "MONITOR ups1@localhost 1 user1 pass1 master\nMONITOR ups2@localhost 1 user2 pass2 slave\nMINSUPPLIES 1\n"
    result = remove_monitor_line(content, "ups1")
    assert "MONITOR ups2@localhost" in result
    assert "MONITOR ups1@localhost" not in result


def test_add_monitor_line():
    content = "MINSUPPLIES 1\nSHUTDOWNCMD \"/sbin/shutdown -h now\"\n"
    result = add_monitor_line(content, "myups", 1, "monuser", "secret", "master")
    assert "MONITOR myups@localhost 1 monuser secret master" in result
    assert "MINSUPPLIES 1" in result


def test_add_monitor_line_no_duplicate_newline():
    content = "MINSUPPLIES 1\n"
    result = add_monitor_line(content, "myups", 1, "monuser", "secret", "master")
    lines = result.split("\n")
    monitor_lines = [line for line in lines if line.startswith("MONITOR")]
    assert len(monitor_lines) == 1


def test_find_monitor_user_with_master():
    content = "[monuser]\n  password = secret\n  upsmon = master\n"
    name, pwd, role = find_monitor_user(content)
    assert name == "monuser"
    assert pwd == "secret"
    assert role == "master"


def test_find_monitor_user_picks_first():
    content = "[admin]\n  password = adminpass\n  upsmon = master\n\n[slave]\n  password = slavepass\n  upsmon = slave\n"
    name, _pwd, role = find_monitor_user(content)
    assert name == "admin"
    assert role == "master"


def test_find_monitor_user_empty():
    name, pwd, role = find_monitor_user("")
    assert name is None
    assert pwd is None
    assert role is None


def test_ensure_minsupplies_adds_when_missing():
    assert ensure_minsupplies("", 0) == "MINSUPPLIES 0"
    assert ensure_minsupplies('SHUTDOWNCMD "test"', 0) == 'SHUTDOWNCMD "test"\nMINSUPPLIES 0'


def test_ensure_minsupplies_preserves_existing():
    assert ensure_minsupplies("MINSUPPLIES 1", 0) == "MINSUPPLIES 1"


def test_set_minsupplies_overrides():
    assert set_minsupplies("MINSUPPLIES 1", 0) == "MINSUPPLIES 0"
    assert set_minsupplies("", 2) == "MINSUPPLIES 2"


def test_ensure_minsupplies_none_input():
    assert ensure_minsupplies(None, 0) == "MINSUPPLIES 0"
    assert ensure_minsupplies(None, 3) == "MINSUPPLIES 3"


def test_set_minsupplies_none_input():
    assert set_minsupplies(None, 0) == "MINSUPPLIES 0"
    assert set_minsupplies(None, 2) == "MINSUPPLIES 2"
