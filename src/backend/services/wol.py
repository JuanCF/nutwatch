import ipaddress
import json
import logging
import os
import re
import socket
import grp
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FutureTimeoutError

from config import NUT_DIR
from utils import read_file, run_cmd, write_file

logger = logging.getLogger(__name__)

WOL_JSON = os.path.join(NUT_DIR, "wol.json")
WOL_EVENTS_JSON = os.path.join(NUT_DIR, "wol-events.json")

MAC_REGEX = re.compile(r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$")

_ARPING_MAC_RE = re.compile(
    r'(?:'
    r'\d+ bytes from ([0-9a-fA-F:]{17}) \((\d+\.\d+\.\d+\.\d+)\)'  # Thomas Habets arping
    r'|'
    r'Unicast reply from (\d+\.\d+\.\d+\.\d+) \[([0-9a-fA-F:]{17})\]'  # iputils arping
    r')'
)


def _load_json(path: str) -> dict:
    try:
        content = read_file(path)
        return json.loads(content)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_json(path: str, data: dict) -> None:
    content = json.dumps(data, indent=2) + "\n"
    write_file(path, content)
    try:
        os.chmod(path, 0o640)
        nut_gid = grp.getgrnam("nut").gr_gid
        os.chown(path, 0, nut_gid)
    except (FileNotFoundError, PermissionError, KeyError):
        pass


def list_targets() -> dict:
    data = _load_json(WOL_JSON)
    return data.get("targets", {})


def get_target(name: str) -> dict | None:
    targets = list_targets()
    return targets.get(name)


def add_target(name: str, mac: str, broadcast: str = "255.255.255.255", description: str = "") -> dict | None:
    if not MAC_REGEX.match(mac):
        raise ValueError(f"Invalid MAC address: {mac!r}")
    data = _load_json(WOL_JSON)
    if "targets" not in data:
        data["targets"] = {}
    if name in data["targets"]:
        return None
    data["targets"][name] = {
        "mac": mac,
        "broadcast": broadcast,
        "description": description,
    }
    _save_json(WOL_JSON, data)
    return data["targets"][name]


def update_target(name: str, mac: str | None = None, broadcast: str | None = None, description: str | None = None) -> dict | None:
    target = get_target(name)
    if target is None:
        return None
    if mac is not None:
        if not MAC_REGEX.match(mac):
            raise ValueError(f"Invalid MAC address: {mac!r}")
        target["mac"] = mac
    if broadcast is not None:
        target["broadcast"] = broadcast
    if description is not None:
        target["description"] = description
    data = _load_json(WOL_JSON)
    data["targets"][name] = target
    _save_json(WOL_JSON, data)
    return target


def delete_target(name: str) -> bool:
    data = _load_json(WOL_JSON)
    targets = data.get("targets", {})
    if name not in targets:
        return False
    del targets[name]
    _save_json(WOL_JSON, data)

    events_data = _load_json(WOL_EVENTS_JSON)
    mappings = events_data.get("mappings", [])
    changed = False
    for m in mappings:
        if name in m.get("targets", []):
            m["targets"] = [t for t in m["targets"] if t != name]
            changed = True
    mappings = [m for m in mappings if m.get("targets")]
    events_data["mappings"] = mappings
    if changed:
        _save_json(WOL_EVENTS_JSON, events_data)
    return True


def send_wol(name: str) -> bool:
    target = get_target(name)
    if target is None:
        raise ValueError(f"WOL target not found: {name!r}")
    try:
        from wakeonlan import send_magic_packet
    except ImportError:
        logger.exception("wakeonlan Python package is not installed")
        raise RuntimeError("wakeonlan package is not installed") from None
    send_magic_packet(target["mac"], ip_address=target.get("broadcast", "255.255.255.255"), port=9)
    logger.info("Sent WOL magic packet to %s (%s) via %s", name, target["mac"], target.get("broadcast", "255.255.255.255"))
    return True


def wake_all() -> dict:
    targets = list_targets()
    results = {}
    for name in targets:
        try:
            send_wol(name)
            results[name] = "ok"
        except Exception as e:
            results[name] = str(e)
    return results


def list_mappings() -> list:
    data = _load_json(WOL_EVENTS_JSON)
    return data.get("mappings", [])


def add_mapping(ups: str, event: str, targets: list[str]) -> dict:
    data = _load_json(WOL_EVENTS_JSON)
    if "mappings" not in data:
        data["mappings"] = []

    existing_targets = list_targets()
    for t in targets:
        if t not in existing_targets:
            raise ValueError(f"Unknown WOL target: {t!r}")

    for m in data["mappings"]:
        if m["ups"] == ups and m["event"] == event:
            raise ValueError(f"Mapping already exists for UPS '{ups}' event '{event}'")

    mapping = {"ups": ups, "event": event, "targets": targets}
    data["mappings"].append(mapping)
    _save_json(WOL_EVENTS_JSON, data)
    return mapping


def delete_mapping(index: int) -> bool:
    data = _load_json(WOL_EVENTS_JSON)
    mappings = data.get("mappings", [])
    if index < 0 or index >= len(mappings):
        return False
    mappings.pop(index)
    data["mappings"] = mappings
    _save_json(WOL_EVENTS_JSON, data)
    return True


def dispatch(upsname: str, event: str) -> None:
    mappings = list_mappings()
    for m in mappings:
        if m["ups"] == upsname and m["event"] == event:
            for target_name in m.get("targets", []):
                try:
                    send_wol(target_name)
                except Exception as e:
                    logger.exception("WOL dispatch failed for %s/%s -> %s", upsname, event, target_name)


def _resolve_hostname(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0]
    except OSError:
        return ''


def _get_local_subnet() -> str | None:
    """Return the first active link-scoped subnet (/24 or smaller) from the routing table."""
    try:
        rc, stdout, _ = run_cmd(["ip", "route", "show"], timeout=5)
        if rc != 0:
            return None
        for line in stdout.splitlines():
            if 'linkdown' in line:
                continue
            parts = line.split()
            if not (parts and '/' in parts[0] and 'scope link' in line):
                continue
            try:
                net = ipaddress.ip_network(parts[0], strict=False)
                if net.num_addresses <= 256:  # /24 or smaller; skip Docker /16s etc.
                    return parts[0]
            except ValueError:
                continue
    except Exception:
        pass
    return None


def _generate_ips(subnet: str) -> list[str]:
    """Return all host addresses for a subnet (excludes network and broadcast)."""
    try:
        return [str(ip) for ip in ipaddress.ip_network(subnet, strict=False).hosts()]
    except ValueError:
        return []


def _probe_arping(ip: str) -> dict | None:
    """
    ARP-probe one IP via arping. Returns {ip, mac, hostname} or None on timeout/no-reply.
    Raises PermissionError if arping needs cap_net_raw or is not installed.
    """
    rc, stdout, stderr = run_cmd(["arping", "-c", "1", "-w", "1", ip], timeout=3)
    # run_cmd never raises: it returns (-1, "", str(exc)) when arping can't be
    # executed. Detect both "needs root" and "not installed" from the message.
    low = stderr.lower()
    if "not permitted" in low or "no such file" in low or "not found" in low:
        raise PermissionError(stderr.strip())
    m = _ARPING_MAC_RE.search(stdout)
    if m:
        mac = m.group(1) or m.group(4)
        return {"ip": ip, "mac": mac.upper(), "hostname": ""}
    return None


def _scan_with_arping(ips: list[str]) -> list[dict] | None:
    """
    Probe all IPs via arping in parallel.
    Returns host list on success, or None if arping is unavailable or requires root.
    """
    hosts: list[dict] = []
    _denied = [False]

    def probe(ip: str) -> dict | None:
        try:
            return _probe_arping(ip)
        except PermissionError:
            _denied[0] = True
            return None

    workers = min(len(ips), 100)
    overall_timeout = max(len(ips) / workers * 3 + 5, 10)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(probe, ip): ip for ip in ips}
        try:
            for fut in as_completed(futures, timeout=overall_timeout):
                result = fut.result()
                if result:
                    hosts.append(result)
        except FutureTimeoutError:
            for fut in futures:
                if not fut.done():
                    fut.cancel()

    if _denied[0]:
        return None
    return hosts


def _scan_with_ping_sweep(ips: list[str]) -> list[dict]:
    """Trigger ARP for all IPs via ping or UDP sendto, then read the cache."""
    def trigger(ip: str) -> None:
        _, _, stderr = run_cmd(["ping", "-c", "1", "-W", "1", ip], timeout=2)
        # run_cmd never raises; a missing ping binary surfaces as an error
        # string. If ping actually ran (host up or down), the ARP request was
        # already sent and we're done.
        low = stderr.lower()
        if "no such file" not in low and "not found" not in low:
            return
        # ping not available: a non-blocking UDP sendto forces the kernel to
        # send an ARP request before queuing the packet, populating the cache.
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.setblocking(False)
                s.sendto(b'\x00', (ip, 9))
        except OSError:
            pass

    workers = min(len(ips), 100)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = list(ex.submit(trigger, ip) for ip in ips)
        try:
            for fut in as_completed(futures, timeout=max(len(ips) / workers * 2 + 5, 8)):
                try:
                    fut.result()
                except Exception:
                    pass
        except FutureTimeoutError:
            pass

    return _scan_passive_arp()


def _scan_passive_arp() -> list[dict]:
    """Read the kernel ARP cache via 'ip neigh show'."""
    try:
        rc, stdout, _ = run_cmd(["ip", "neigh", "show"], timeout=5)
        if rc != 0:
            return []
        ip_mac_re = re.compile(r'^(\d+\.\d+\.\d+\.\d+)\s.*lladdr\s+([0-9a-fA-F:]{17})', re.MULTILINE)
        return [
            {"ip": m.group(1), "mac": m.group(2).upper(), "hostname": ""}
            for m in ip_mac_re.finditer(stdout)
        ]
    except Exception:
        return []


def _add_hostnames(hosts: list[dict]) -> list[dict]:
    """Resolve reverse-DNS hostnames in parallel; fills 'hostname' in-place."""
    if not hosts:
        return hosts
    with ThreadPoolExecutor(max_workers=min(len(hosts), 10)) as ex:
        futures = {ex.submit(_resolve_hostname, h['ip']): h for h in hosts}
        try:
            for fut in as_completed(futures, timeout=2.0):
                host = futures[fut]
                try:
                    host['hostname'] = fut.result()
                except Exception:
                    pass
        except FutureTimeoutError:
            for fut in futures:
                if not fut.done():
                    fut.cancel()
    return hosts


def scan_network_hosts() -> list:
    """Discover LAN hosts with MACs: tries arping, falls back to ping sweep, then passive ARP."""
    subnet = _get_local_subnet()
    if subnet:
        ips = _generate_ips(subnet)
        if ips:
            hosts = _scan_with_arping(ips)
            if hosts:
                return _add_hostnames(hosts)
            hosts = _scan_with_ping_sweep(ips)
            return _add_hostnames(hosts)

    return _add_hostnames(_scan_passive_arp())


def cleanup_for_ups(upsname: str) -> None:
    data = _load_json(WOL_EVENTS_JSON)
    mappings = data.get("mappings", [])
    new_mappings = [m for m in mappings if m["ups"] != upsname]
    if len(new_mappings) != len(mappings):
        data["mappings"] = new_mappings
        _save_json(WOL_EVENTS_JSON, data)
        logger.info("Cleaned up %d WOL mapping(s) for UPS '%s'", len(mappings) - len(new_mappings), upsname)