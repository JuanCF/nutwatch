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


# ── scan helper unit tests ─────────────────────────────────────────────────

def test_get_local_subnet_returns_cidr(monkeypatch):
    route_output = (
        "default via 192.168.1.1 dev eth0 proto dhcp\n"
        "192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.100\n"
    )
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (0, route_output, ""))
    from services.wol import _get_local_subnet
    assert _get_local_subnet() == "192.168.1.0/24"


def test_get_local_subnet_skips_linkdown(monkeypatch):
    """Docker bridge routes (linkdown) are ignored; real LAN route is returned."""
    route_output = (
        "default via 192.168.68.4 dev enp0s5 proto dhcp\n"
        "172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown\n"
        "172.18.0.0/16 dev br-abc proto kernel scope link src 172.18.0.1 linkdown\n"
        "192.168.68.0/24 dev enp0s5 proto kernel scope link src 192.168.68.116\n"
    )
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (0, route_output, ""))
    from services.wol import _get_local_subnet
    assert _get_local_subnet() == "192.168.68.0/24"


def test_get_local_subnet_skips_large_subnets(monkeypatch):
    """/16 subnets (even if up) are skipped to avoid scanning 65k hosts."""
    route_output = "10.0.0.0/16 dev eth0 proto kernel scope link src 10.0.1.100\n"
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (0, route_output, ""))
    from services.wol import _get_local_subnet
    assert _get_local_subnet() is None


def test_get_local_subnet_no_link_route(monkeypatch):
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (0, "default via 192.168.1.1 dev eth0\n", ""))
    from services.wol import _get_local_subnet
    assert _get_local_subnet() is None


def test_get_local_subnet_command_fails(monkeypatch):
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (1, "", "error"))
    from services.wol import _get_local_subnet
    assert _get_local_subnet() is None


def test_generate_ips_slash30():
    from services.wol import _generate_ips
    assert _generate_ips("192.168.1.0/30") == ["192.168.1.1", "192.168.1.2"]


def test_generate_ips_invalid():
    from services.wol import _generate_ips
    assert _generate_ips("not-valid") == []


# ── scan_network_hosts integration tests ──────────────────────────────────

def test_scan_arping_thomas_habets_format(monkeypatch):
    """arping (Thomas Habets) output is parsed to extract MAC."""
    import socket
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: "192.168.1.0/30")
    monkeypatch.setattr("services.wol._generate_ips", lambda s: ["192.168.1.1", "192.168.1.2"])

    def fake_run(cmd, timeout):
        if cmd[0] == "arping" and cmd[-1] == "192.168.1.1":
            return (0, "60 bytes from aa:bb:cc:dd:ee:ff (192.168.1.1): index=0 time=1ms", "")
        return (1, "", "")

    monkeypatch.setattr("services.wol.run_cmd", fake_run)
    monkeypatch.setattr(socket, "gethostbyaddr", lambda ip: ("router.local", [], [ip]))
    from services.wol import scan_network_hosts
    hosts = scan_network_hosts()
    assert len(hosts) == 1
    assert hosts[0] == {"ip": "192.168.1.1", "mac": "AA:BB:CC:DD:EE:FF", "hostname": "router.local"}


def test_scan_arping_iputils_format(monkeypatch):
    """arping (iputils) 'Unicast reply from' output is parsed correctly."""
    import socket
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: "192.168.1.0/30")
    monkeypatch.setattr("services.wol._generate_ips", lambda s: ["192.168.1.1"])

    iputils_out = (
        "ARPING 192.168.1.1 from 192.168.1.100 eth0\n"
        "Unicast reply from 192.168.1.1 [AA:BB:CC:DD:EE:FF]  1.234ms\n"
        "Sent 1 probes (1 broadcast(s))\nReceived 1 response(s)\n"
    )
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (0, iputils_out, ""))
    monkeypatch.setattr(socket, "gethostbyaddr", lambda ip: ("host", [], [ip]))
    from services.wol import scan_network_hosts
    hosts = scan_network_hosts()
    assert len(hosts) == 1
    assert hosts[0]["mac"] == "AA:BB:CC:DD:EE:FF"


def test_scan_arping_empty_result_falls_back_to_ping(monkeypatch):
    """arping runs but finds no hosts (wrong iface, bad env) → ping sweep + ARP cache fallback."""
    import socket
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: "192.168.1.0/30")
    monkeypatch.setattr("services.wol._generate_ips", lambda s: ["192.168.1.1"])

    arp_output = "192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE\n"

    def fake_run(cmd, timeout):
        if cmd[0] == "arping":
            return (1, "", "")  # exits non-zero, no MAC in output, no "not permitted"
        if cmd[0] == "ping":
            return (0, "", "")
        return (0, arp_output, "")

    monkeypatch.setattr("services.wol.run_cmd", fake_run)
    monkeypatch.setattr(socket, "gethostbyaddr", lambda ip: ("", [], [ip]))
    from services.wol import scan_network_hosts
    hosts = scan_network_hosts()
    assert len(hosts) == 1
    assert hosts[0]["mac"] == "AA:BB:CC:DD:EE:FF"


def test_scan_arping_permission_error_falls_back_to_ping(monkeypatch):
    """'Operation not permitted' from arping triggers ping sweep + ARP cache fallback."""
    import socket
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: "192.168.1.0/30")
    monkeypatch.setattr("services.wol._generate_ips", lambda s: ["192.168.1.1"])

    arp_output = "192.168.1.1 dev eth0 lladdr bb:cc:dd:ee:ff:aa REACHABLE\n"

    def fake_run(cmd, timeout):
        if cmd[0] == "arping":
            return (1, "", "arping: Operation not permitted")
        if cmd[0] == "ping":
            return (0, "", "")
        return (0, arp_output, "")

    monkeypatch.setattr("services.wol.run_cmd", fake_run)
    monkeypatch.setattr(socket, "gethostbyaddr", lambda ip: ("", [], [ip]))
    from services.wol import scan_network_hosts
    hosts = scan_network_hosts()
    assert len(hosts) == 1
    assert hosts[0]["mac"] == "BB:CC:DD:EE:FF:AA"


def test_scan_arping_not_installed_falls_back_to_ping(monkeypatch):
    """arping not installed (run_cmd returns -1 + 'No such file') triggers ping sweep fallback."""
    import socket
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: "192.168.1.0/30")
    monkeypatch.setattr("services.wol._generate_ips", lambda s: ["192.168.1.1"])

    arp_output = "192.168.1.1 dev eth0 lladdr cc:dd:ee:ff:aa:bb REACHABLE\n"

    def fake_run(cmd, timeout):
        if cmd[0] == "arping":
            return (-1, "", "[Errno 2] No such file or directory: 'arping'")
        if cmd[0] == "ping":
            return (0, "", "")
        return (0, arp_output, "")

    monkeypatch.setattr("services.wol.run_cmd", fake_run)
    monkeypatch.setattr(socket, "gethostbyaddr", lambda ip: ("", [], [ip]))
    from services.wol import scan_network_hosts
    hosts = scan_network_hosts()
    assert len(hosts) == 1
    assert hosts[0]["mac"] == "CC:DD:EE:FF:AA:BB"


def test_scan_ping_not_installed_uses_udp_fallback(monkeypatch):
    """When neither arping nor ping is installed, UDP sendto triggers ARP; cache is then read."""
    import socket
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: "192.168.1.0/30")
    monkeypatch.setattr("services.wol._generate_ips", lambda s: ["192.168.1.1"])

    arp_output = "192.168.1.1 dev eth0 lladdr dd:ee:ff:aa:bb:cc REACHABLE\n"

    def fake_run(cmd, timeout):
        if cmd[0] in ("arping", "ping"):
            return (-1, "", f"[Errno 2] No such file or directory: '{cmd[0]}'")
        return (0, arp_output, "")

    udp_targets = []

    class FakeSocket:
        def __init__(self, *a, **kw): pass
        def setblocking(self, v): pass
        def sendto(self, data, addr): udp_targets.append(addr[0])
        def __enter__(self): return self
        def __exit__(self, *a): pass

    monkeypatch.setattr("services.wol.run_cmd", fake_run)
    monkeypatch.setattr("services.wol.socket.socket", FakeSocket)
    monkeypatch.setattr(socket, "gethostbyaddr", lambda ip: ("", [], [ip]))
    from services.wol import scan_network_hosts
    hosts = scan_network_hosts()
    assert "192.168.1.1" in udp_targets
    assert len(hosts) == 1
    assert hosts[0]["mac"] == "DD:EE:FF:AA:BB:CC"


def test_scan_falls_back_to_passive_arp_without_subnet(monkeypatch):
    """No subnet detected → passive ip neigh show is used."""
    import socket
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: None)
    arp_output = (
        "192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE\n"
        "192.168.1.100 dev eth0 lladdr 11:22:33:44:55:66 STALE\n"
        "192.168.1.200 dev eth0 FAILED\n"
    )
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (0, arp_output, ""))
    monkeypatch.setattr(socket, "gethostbyaddr", lambda ip: (f"host-{ip.replace('.', '-')}", [], [ip]))
    from services.wol import scan_network_hosts
    hosts = scan_network_hosts()
    assert len(hosts) == 2
    macs = {h["mac"] for h in hosts}
    assert "AA:BB:CC:DD:EE:FF" in macs
    assert "11:22:33:44:55:66".upper() in macs
    for h in hosts:
        assert h["hostname"].startswith("host-")


def test_scan_passive_excludes_incomplete_entries(monkeypatch):
    """Passive ARP only returns entries with lladdr (skips FAILED/INCOMPLETE)."""
    import socket
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: None)
    arp_output = (
        "10.0.0.1 dev eth0 FAILED\n"
        "10.0.0.2 dev eth0 INCOMPLETE\n"
        "10.0.0.3 dev eth0 lladdr de:ad:be:ef:00:01 REACHABLE\n"
    )
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (0, arp_output, ""))
    monkeypatch.setattr(socket, "gethostbyaddr", lambda ip: ("host", [], [ip]))
    from services.wol import scan_network_hosts
    hosts = scan_network_hosts()
    assert len(hosts) == 1
    assert hosts[0]["mac"] == "DE:AD:BE:EF:00:01"


def test_scan_empty_arp_cache(monkeypatch):
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: None)
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (0, "", ""))
    from services.wol import scan_network_hosts
    assert scan_network_hosts() == []


def test_scan_handles_run_cmd_exception(monkeypatch):
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: None)
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (_ for _ in ()).throw(RuntimeError("fail")))
    from services.wol import scan_network_hosts
    assert scan_network_hosts() == []


def test_scan_hostname_resolution_failure(monkeypatch):
    import socket
    monkeypatch.setattr("services.wol._get_local_subnet", lambda: None)
    arp_output = "192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE\n"
    monkeypatch.setattr("services.wol.run_cmd", lambda cmd, timeout: (0, arp_output, ""))
    monkeypatch.setattr(socket, "gethostbyaddr", lambda ip: (_ for _ in ()).throw(OSError("no reverse DNS")))
    from services.wol import scan_network_hosts
    hosts = scan_network_hosts()
    assert len(hosts) == 1
    assert hosts[0]["mac"] == "AA:BB:CC:DD:EE:FF"
    assert hosts[0]["hostname"] == ""
    assert hosts[0]["ip"] == "192.168.1.1"