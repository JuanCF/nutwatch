# Wake-on-LAN (WOL) Integration Plan

## Overview

Add Wake-on-LAN support to NutWatch so that UPS events (e.g., `ONLINE`, `ONBATT`) can automatically wake remote machines. The integration is non-destructive: user-written hook scripts in `/etc/nut/notify.d/` are never overwritten. WOL event mappings are stored in a separate JSON registry and dispatched by a helper called from `notifycmd.sh`.

## Use Cases

| Use Case | Trigger | Description |
|----------|---------|-------------|
| **Auto-wake on power restore** | `ONLINE` | When UPS returns to line power, wake sleeping/shut-down servers automatically. |
| **Pre-shutdown wake** | `LOWBATT` | Wake a management/logging server before a predicted shutdown. |
| **Manual wake from UI** | UI button | Admin manually wakes a machine (NAS, backup server, etc.) without a separate WOL tool. |
| **Hook-assisted remote wake** | Custom event | A remote hook needs to wake another host via NutWatch's registry. |

## Architecture

### Non-Destructive Dispatch (Option 1)

Instead of generating per-event hook scripts that would collide with user-written scripts, `notifycmd.sh` is extended to call a WOL dispatcher **after** running any existing user hook:

```bash
# 1. Run existing user hook (unchanged behavior)
[[ -x "$HOOKDIR/${UPSNAME_BARE}_${NOTIFYTYPE}.sh" ]] && \
  "$HOOKDIR/${UPSNAME_BARE}_${NOTIFYTYPE}.sh" >>"$LOGFILE" 2>&1

# 2. NutWatch WOL auto-dispatch (new, non-destructive)
[[ -x "/usr/local/bin/nutwatch-wol-dispatch" ]] && \
  "/usr/local/bin/nutwatch-wol-dispatch" "$UPSNAME_BARE" "$NOTIFYTYPE" >>"$LOGFILE" 2>&1
```

The dispatcher reads `/etc/nut/wol-events.json` and sends magic packets for any matching targets.

### Why This Approach

| Principle | How It's Followed |
|-----------|-------------------|
| **Non-destructive** | User hooks in `notify.d/` are never touched, overwritten, or moved. |
| **Predictable** | User hook runs first; WOL fires after. |
| **Scalable** | One JSON file manages all mappings; no file sprawl in `notify.d/`. |
| **Consistent** | Uses `wakeonlan` PyPI package (already fits into existing venv `pip install`). |

## Data Model

### WOL Target Registry — `/etc/nut/wol.json`

```json
{
  "targets": {
    "nas01": {
      "mac": "AA:BB:CC:DD:EE:FF",
      "broadcast": "192.168.1.255",
      "description": "Home NAS"
    },
    "backup-server": {
      "mac": "11:22:33:44:55:66",
      "broadcast": "255.255.255.255",
      "description": "Backup VM host"
    }
  }
}
```

### Event Mapping Registry — `/etc/nut/wol-events.json`

```json
{
  "mappings": [
    {
      "ups": "apc01",
      "event": "ONLINE",
      "targets": ["nas01", "backup-server"]
    },
    {
      "ups": "apc01",
      "event": "LOWBATT",
      "targets": ["backup-server"]
    }
  ]
}
```

- `ups`: bare UPS name (before `@host:port` stripping).
- `event`: one of the standard NUT notify events (`ONLINE`, `ONBATT`, `LOWBATT`, etc.).
- `targets`: list of target names referencing `wol.json`.

## Backend Modules

### `src/backend/services/wol.py`

Responsibilities:
- Load/save `/etc/nut/wol.json` and `/etc/nut/wol-events.json` (atomic writes via `utils.write_file`).
- CRUD for WOL targets.
- CRUD for event mappings.
- `send_wol(mac, broadcast="255.255.255.255", port=9)` — wrapper around `wakeonlan.send_magic_packet()`.
- `dispatch(upsname, event)` — look up mappings and send magic packets to all linked targets.
- `cleanup_for_ups(upsname)` — remove all mappings for a given UPS (called on UPS deletion).
- Validate MAC address format (regex: `^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$`).

### `src/backend/routes/wol.py`

Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/wol/targets` | List all targets |
| `POST` | `/api/wol/targets` | Create a target |
| `PUT` | `/api/wol/targets/<name>` | Update a target |
| `DELETE` | `/api/wol/targets/<name>` | Delete a target |
| `POST` | `/api/wol/targets/<name>/wake` | Send magic packet now |
| `GET` | `/api/wol/mappings` | List all event mappings |
| `POST` | `/api/wol/mappings` | Create a mapping |
| `DELETE` | `/api/wol/mappings/<id>` | Delete a mapping |
| `POST` | `/api/wol/wake-all` | Wake all targets (bulk manual wake) |

All endpoints use `@require_admin`.

### `nutwatch-wol-dispatch` Helper Script

A small Python CLI script installed at `/usr/local/bin/nutwatch-wol-dispatch` (or shipped in `scripts/` and installed by `setup.sh` / `nut-vm.sh`):

```python
#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, "/opt/nutwatch")
from services.wol import dispatch

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(1)
    upsname, event = sys.argv[1], sys.argv[2]
    dispatch(upsname, event)
```

This is what `notifycmd.sh` calls. It runs outside the Flask app context but reuses the same `services/wol.py` logic.

## Frontend

### New Component: `src/frontend/src/components/WakeOnLan.jsx`

Two sections:

1. **Targets Table**
   - Columns: Name, MAC, Broadcast, Description, Actions (Edit, Delete, Wake Now)
   - "Add Target" button opens a modal form.
   - MAC validation feedback in real time.
   - "Wake All" button at the top.

2. **Event Mappings Table**
   - Columns: UPS (dropdown of existing UPS names), Event (dropdown), Targets (multi-select of configured targets), Actions (Delete)
   - "Add Mapping" button opens a modal form.

### Routing & Navigation

- `src/frontend/src/App.jsx`: Add `/wol` route → `<WakeOnLan />`
- `src/frontend/src/components/Sidebar.jsx`: Add "Wake on LAN" nav item with an icon.
- `src/frontend/src/constants/index.js`: Add WOL API paths and `SECTIONS.WOL`.

## Cleanup on UPS Deletion

When a UPS is deleted via `DELETE /api/ups/<name>`, `services/ups.py::delete_ups()` must call `services.wol.cleanup_for_ups(name)` to remove all WOL event mappings for that UPS. This prevents stale mappings from accumulating.

Hook scripts in `notify.d/` are **not** affected because WOL mappings are stored in JSON, not as shell scripts.

## Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `src/backend/services/wol.py` | WOL target/event registry CRUD + packet sender + cleanup |
| `src/backend/routes/wol.py` | Flask API endpoints for WOL |
| `src/frontend/src/components/WakeOnLan.jsx` | SPA UI for target/mapping management |
| `src/backend/scripts/nutwatch-wol-dispatch` | CLI helper called by `notifycmd.sh` |
| `docs/wake-on-lan-plan.md` | This document |

### Modified Files

| File | Change |
|------|--------|
| `src/backend/routes/__init__.py` | Import and export `wol_bp` |
| `src/backend/app.py` | Register `wol_bp` |
| `src/backend/services/ups.py` | Call `cleanup_for_ups()` in `delete_ups()` |
| `src/backend/requirements.txt` | Add `wakeonlan==3.1.0` |
| `src/frontend/src/App.jsx` | Add `/wol` route |
| `src/frontend/src/components/Sidebar.jsx` | Add WOL nav item |
| `src/frontend/src/constants/index.js` | Add WOL sections + API paths |
| `src/backend/scripts/notifycmd.sh` | Add WOL dispatch call after user hook |
| `scripts/setup.sh` | Install `nutwatch-wol-dispatch` to `/usr/local/bin/` |
| `vm/nut-vm.sh` | Update inline `notifycmd.sh` + install dispatch script |

## Dependency

- `wakeonlan` (PyPI) — added to `requirements.txt`.
- The existing venv-based `pip install` in both `setup.sh` and `nut-vm.sh` handles installation automatically.

## Future Considerations (Out of Scope for V1)

- Wake-on-WAN / port forwarding support.
- Retry logic for unresponsive targets.
- Target reachability check (ping before/after wake) with UI status indicators.
- WOL logging separate from `notifycmd.log`.

---

*Plan status: Draft — awaiting implementation.*
