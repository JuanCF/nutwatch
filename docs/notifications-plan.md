# NUT Notifications & Actions — Implementation Plan

## Goal

Add structured management of `upsmon.conf` global directives (`SHUTDOWNCMD`, `NOTIFYCMD`,
`NOTIFYFLAG`, `NOTIFYMSG`, timing params) through a dedicated web UI tab and REST API in
nut-admin.  Also ship a sample `NOTIFYCMD` script so users can easily configure per-UPS hook
scripts (e.g. SSH into another machine and shut it down on `ONBATT`).

> In NUT these settings are **global** in `upsmon.conf`, not per-UPS.  The `NOTIFYCMD` script
> receives `$UPSNAME` and `$NOTIFYTYPE` environment variables, so a single script can route
> events per-UPS.

## New files

| File | Purpose |
|------|---------|
| `src/nut-admin/parsers/upsmon_conf.py` | Parse / serialize all `upsmon.conf` directives into a structured dict |
| `src/nut-admin/services/upsmon.py` | `get_upsmon_config()` / `put_upsmon_config(data)` with validation |
| `src/nut-admin/routes/upsmon.py` | `GET /api/upsmon/config` and `PUT /api/upsmon/config` |
| `src/nut-admin/scripts/notifycmd.sh` | Sample notify script (installed to `/etc/nut/notifycmd.sh`) |

## Files to modify

| File | Change |
|------|--------|
| `src/nut-admin/parsers/__init__.py` | Export `parse_upsmon_conf`, `serialize_upsmon_conf` |
| `src/nut-admin/services/__init__.py` | Export `get_upsmon_config`, `put_upsmon_config` |
| `src/nut-admin/routes/__init__.py` | Export `upsmon_bp` |
| `src/nut-admin/app.py` | Register `upsmon_bp` |
| `src/nut-admin/static/index.html` | Add **Notifications** nav button + section |
| `src/nut-admin/static/app.js` | Load/save handlers, editable monitor table, event forms |
| `src/nut-admin/tests/test_parsers.py` | Roundtrip tests for all `upsmon.conf` directives |
| `Makefile` | Include `scripts/` in `build-tarball` target |
| `vm/nut-vm.sh` | Template: add `NOTIFYCMD`, upload sample script, create hook dirs |
| `src/nut-admin/install.sh` | Copy sample script to `/etc/nut/`, create hook dirs on existing installs |

---

## 1. Parser — `parsers/upsmon_conf.py`

### Functions

```python
def parse_upsmon_conf(content: str) -> dict
def serialize_upsmon_conf(data: dict) -> str
```

### Parsed dict structure

```python
{
    "monitors": [
        {
            "upsname": str,    # e.g. "myups"
            "hostspec": str,   # e.g. "@localhost"  or  "@localhost:3493"
            "power": int,      # 0 or positive
            "username": str,
            "password": str,
            "role": str,       # "master" or "slave"
        },
        ...
    ],
    "minsupplies": int,
    "shutdowncmd": str | None,
    "notifycmd": str | None,
    "powerdownflag": str | None,
    "notify_msg": {
        "ONLINE": "UPS %s on line power",
        "ONBATT": "UPS %s on battery",
        ...
    },
    "notify_flag": {
        "ONLINE": ["SYSLOG", "WALL"],
        "ONBATT": ["SYSLOG", "WALL", "EXEC"],
        ...
    },
    "timing": {
        "POLLFREQ": 5,
        "POLLFREQALERT": 5,
        "HOSTSYNC": 15,
        "DEADTIME": 15,
        "RBWARNTIME": 43200,
        "NOCOMMWARNTIME": 300,
        "FINALDELAY": 5,
    },
}
```

### Events

`ONLINE`, `ONBATT`, `LOWBATT`, `COMMOK`, `COMMBAD`, `SHUTDOWN`, `REPLBATT`, `NOCOMM`, `NOPARENT`.

### Parsing rules

- `MONITOR` lines → reuse existing `MONITOR_RE` from `parsers/monitor.py`.
- `MINSUPPLIES`, `SHUTDOWNCMD`, `NOTIFYCMD`, `POWERDOWNFLAG` → capture rest of line as value,
  strip surrounding double quotes.
- `NOTIFYMSG <event> "<msg>"` → capture event + quoted message.
- `NOTIFYFLAG <event> <flags>` → split flags on `+` or whitespace into list.
- Timing directives (`POLLFREQ`, …) → parse as int.
- Ignore comments, blank lines, and unknown directives (matching existing pattern of
  `parsers/ups_conf.py` and `parsers/upsd_users.py`).

### Serializer behavior

Rebuilds the file in deterministic order:

1. `MONITOR` lines
2. `MINSUPPLIES`
3. `SHUTDOWNCMD`
4. `NOTIFYCMD`
5. `POWERDOWNFLAG`
6. `NOTIFYMSG` lines (sorted by event name)
7. `NOTIFYFLAG` lines (sorted by event name)
8. Timing directives
9. Comments / unknown directives are dropped (raw text editor is the escape hatch).

---

## 2. Service — `services/upsmon.py`

### `get_upsmon_config()`

Reads `/etc/nut/upsmon.conf`, calls `parse_upsmon_conf`, returns dict.

### `put_upsmon_config(data)`

Validation:
- No newlines in any string field.
- `notify_flag` values must be subsets of `{SYSLOG, WALL, EXEC, IGNORE}`.
- Timing values must be positive integers.
- Every `monitors[].upsname` must exist in `ups.conf` (read and parse `ups.conf`).
- `monitors[].role` must be `master` or `slave`.
- `monitors[].power` must be `>= 0`.

On success → serialize via `serialize_upsmon_conf` → atomic write via `utils.write_file`.

### Coexistence with `services/ups.py`

`services/ups.py` uses `parsers/monitor.py` raw-string helpers (`add_monitor_line`,
`remove_monitor_line`) for auto-managing `MONITOR` lines when UPSes are added/deleted.
These raw-string operations continue to work on the clean output of `serialize_upsmon_conf`
(no comments to trip them up).  The `put_upsmon_config` validation that monitor upsnames
match `ups.conf` also guarantees that `delete_ups` → `remove_monitor_line(name)` will find
the right line.

---

## 3. Route — `routes/upsmon.py`

```python
upsmon_bp = Blueprint("upsmon", __name__)

@upsmon_bp.route("/api/upsmon/config", methods=["GET"])
@require_admin
def get_upsmon_config_handler():
    return jsonify(get_upsmon_config())

@upsmon_bp.route("/api/upsmon/config", methods=["PUT"])
@require_admin
def put_upsmon_config_handler():
    data = request.get_json(force=True) or {}
    # basic shape validation here
    put_upsmon_config(data)
    return jsonify({"ok": True})
```

---

## 4. Sample Script — `scripts/notifycmd.sh`

```bash
#!/bin/bash
# NUT notifycmd — sample script.
# Environment: UPSNAME, NOTIFYTYPE (set by upsmon).
# Place per-event hooks in /etc/nut/notify.d/<EVENT>.sh
# Place per-UPS hooks  in /etc/nut/notify.d/<UPSNAME>_<EVENT>.sh

LOGFILE="/var/log/nut/notifycmd.log"
HOOKDIR="/etc/nut/notify.d"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] UPS=$UPSNAME EVENT=$NOTIFYTYPE" >>"$LOGFILE"

# Per-event hook
[[ -x "$HOOKDIR/$NOTIFYTYPE.sh" ]] && "$HOOKDIR/$NOTIFYTYPE.sh" >>"$LOGFILE" 2>&1

# Per-UPS per-event hook
[[ -x "$HOOKDIR/${UPSNAME}_${NOTIFYTYPE}.sh" ]] && "$HOOKDIR/${UPSNAME}_${NOTIFYTYPE}.sh" >>"$LOGFILE" 2>&1
```

### Installation

- **nut-admin tarball**: script lives under `/opt/nut-admin/scripts/`.
- **`vm/nut-vm.sh`**: writes the script inline to `$tmp_dir`, uploads to
  `/etc/nut/notifycmd.sh` via `virt-customize --upload`, creates
  `/etc/nut/notify.d/` and `/var/log/nut/`, and sets ownership (`root:nut`).
- **`install.sh`**: copies from `/opt/nut-admin/scripts/notifycmd.sh` to
  `/etc/nut/notifycmd.sh`, creates hook dirs if not present.

### Ownership & permissions

```bash
chown root:nut /etc/nut/notifycmd.sh
chmod 750  /etc/nut/notifycmd.sh
chown root:nut /etc/nut/notify.d
chmod 750  /etc/nut/notify.d
chown nut:nut  /var/log/nut
```

---

## 5. Frontend — "Notifications" Tab

### Tab name

`Notifications` (placed between `Users` and `Logs` in the nav bar so the nav order becomes:
UPS Devices → Users → Notifications → Logs → Config Files).

### Section layout

#### 5a. Monitor Lines (editable table)

| Column | Input |
|--------|-------|
| UPS Name | `<select>` dropdown populated from `GET /api/ups` (existing UPS names) |
| Host | `<input>` text, default `@localhost` |
| Power | `<input>` number, min 0 |
| Username | `<input>` text |
| Password | `<input>` text (show stars for existing) |
| Role | `<select>` master / slave |
| | Remove button per row |

Plus an **Add Monitor** button that appends a new row.

#### 5b. Global Commands

| Field | Input |
|-------|-------|
| `SHUTDOWNCMD` | text input |
| `NOTIFYCMD` | text input |
| `POWERDOWNFLAG` | text input |

#### 5c. Timing Parameters

Number inputs for: `POLLFREQ`, `POLLFREQALERT`, `HOSTSYNC`, `DEADTIME`,
`RBWARNTIME`, `NOCOMMWARNTIME`, `FINALDELAY`.

#### 5d. Notification Messages & Flags

Table with one row per event:

| Event | Message | SYSLOG | WALL | EXEC | IGNORE |
|-------|---------|--------|------|------|--------|
| ONLINE | text input | ☑ | ☑ | ☐ | ☐ |
| ONBATT | text input | ☑ | ☑ | ☐ | ☐ |
| … | … | … | … | … | … |

Checkboxes for flags.  Selecting `IGNORE` should disable the other three (mutually exclusive
in NUT).

#### 5e. Hook Info Box

A small info paragraph:

> A sample notify script is installed at `/etc/nut/notifycmd.sh`.  It logs all UPS events
> and runs optional hook scripts placed in `/etc/nut/notify.d/`:
> - `/etc/nut/notify.d/<EVENT>.sh` — runs for a specific event from any UPS.
> - `/etc/nut/notify.d/<UPSNAME>_<EVENT>.sh` — runs for a specific UPS + event.
>
> To shut down another machine when UPS goes on battery, create a hook like:
> `/etc/nut/notify.d/myups_ONBATT.sh` containing `ssh root@other-machine shutdown -h now`.

#### Save button

Sends full payload to `PUT /api/upsmon/config`.  On success, shows confirmation dialog
offering to **Restart nut-monitor** (same pattern as the UPS save flow).

### JS functions to add

- `loadNotifications()` — fetches `GET /api/upsmon/config`, renders the form.
- `saveNotifications()` — collects form data, calls `PUT /api/upsmon/config`.
- `addMonitorRow()` / `removeMonitorRow()` — manage the editable monitor table.
- `flaggedOnly()` — toggles between `IGNORE` and the other flags (mutual exclusion).

---

## 6. Tests — `tests/test_parsers.py`

New test functions:

| Test | Covers |
|------|--------|
| `test_parse_upsmon_conf_basic` | Basic parse with one MONITOR + MINSUPPLIES |
| `test_upsmon_conf_roundtrip` | Full roundtrip with all directives (commands, messages, flags, timing) |
| `test_upsmon_conf_notifyflag_plus` | `NOTIFYFLAG ONLINE SYSLOG+WALL` parses to `["SYSLOG", "WALL"]` |
| `test_upsmon_conf_notifyflag_space` | `NOTIFYFLAG ONLINE SYSLOG WALL` parses to `["SYSLOG", "WALL"]` |
| `test_upsmon_conf_notifymsg_quotes` | `NOTIFYMSG ONLINE "UPS %s ok"` captures message with spaces |
| `test_upsmon_conf_multiple_monitors` | Multiple MONITOR lines |
| `test_upsmon_conf_ignore_unknown` | Unknown directive lines are silently dropped |
| `test_upsmon_conf_empty` | Empty file roundtrips |

---

## 7. `vm/nut-vm.sh` changes

### In the `upsmon.conf` template (around line 535)

Add after `MINSUPPLIES 1`:

```conf
NOTIFYCMD "/etc/nut/notifycmd.sh"
```

Also add `NOTIFYFLAG` entries for all 9 events (currently only ONLINE, ONBATT, LOWBATT are set).

### After writing `upsmon.conf` (around line 555)

Write and upload the sample script:

```bash
cat >"$tmp_dir/notifycmd.sh" <<'NOTIFY_EOF'
#!/bin/bash
LOGFILE="/var/log/nut/notifycmd.log"
HOOKDIR="/etc/nut/notify.d"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] UPS=$UPSNAME EVENT=$NOTIFYTYPE" >>"$LOGFILE"
[[ -x "$HOOKDIR/$NOTIFYTYPE.sh" ]] && "$HOOKDIR/$NOTIFYTYPE.sh" >>"$LOGFILE" 2>&1
[[ -x "$HOOKDIR/${UPSNAME}_${NOTIFYTYPE}.sh" ]] && "$HOOKDIR/${UPSNAME}_${NOTIFYTYPE}.sh" >>"$LOGFILE" 2>&1
NOTIFY_EOF
```

### In the `virt-customize` command (around lines 630–640)

Add:

```bash
vc_cmd+=(--upload "$tmp_dir/notifycmd.sh:/etc/nut/notifycmd.sh")
vc_cmd+=(--run-command "chmod 750 /etc/nut/notifycmd.sh && chown root:nut /etc/nut/notifycmd.sh")
vc_cmd+=(--run-command "mkdir -p /etc/nut/notify.d /var/log/nut")
vc_cmd+=(--run-command "chown root:nut /etc/nut/notify.d && chmod 750 /etc/nut/notify.d")
vc_cmd+=(--run-command "chown nut:nut /var/log/nut")
```

---

## 8. `Makefile` changes

In the `build-tarball` target, add `scripts/` to the file list:

```makefile
TARBALL := nut-admin.tar.gz
TARBALL_DIR := src/nut-admin

build-tarball:
	tar -czvf $(TARBALL) \
		-C $(TARBALL_DIR) \
		--exclude '__pycache__' \
		--exclude '.pytest_cache' \
		--exclude 'venv' \
		--exclude 'tests' \
		--exclude 'install.sh' \
		__init__.py app.py auth.py config.py utils.py \
		parsers/ services/ routes/ \
		static/ scripts/ \
		nut-admin.service requirements.txt
```

---

## 9. `install.sh` changes

After the `tar -xzf` line (around line 17), add:

```bash
echo "[NUT-ADMIN] Installing notifycmd sample script..."
if [[ -f /opt/nut-admin/scripts/notifycmd.sh ]]; then
  cp /opt/nut-admin/scripts/notifycmd.sh /etc/nut/notifycmd.sh
  chmod 750 /etc/nut/notifycmd.sh
  chown root:nut /etc/nut/notifycmd.sh
fi
mkdir -p /etc/nut/notify.d /var/log/nut
chown root:nut /etc/nut/notify.d && chmod 750 /etc/nut/notify.d
chown nut:nut /var/log/nut
```

---

## Implementation Order (recommended)

1. **Parser** → `parsers/upsmon_conf.py` + tests (verify roundtrips).
2. **Service** → `services/upsmon.py` (read/write with validation).
3. **Route** → `routes/upsmon.py` + register in `app.py` and `__init__.py`.
4. **Frontend** → `index.html` + `app.js` (new tab, forms, event handlers).
5. **Sample script** → `scripts/notifycmd.sh` + `Makefile` + `install.sh`.
6. **VM script** → `vm/nut-vm.sh` (template update + sample script upload).
7. **Final check** → `make check` (lint, format, pytest).
