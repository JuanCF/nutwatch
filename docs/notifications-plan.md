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
| `src/backend/parsers/upsmon_conf.py` | Parse / serialize all `upsmon.conf` directives into a structured dict |
| `src/backend/services/upsmon.py` | `get_upsmon_config()` / `put_upsmon_config(data)` with validation |
| `src/backend/routes/upsmon.py` | `GET /api/upsmon/config` and `PUT /api/upsmon/config` |
| `src/backend/services/hooks.py` | `list_hooks()`, `get_hook()`, `put_hook()`, `delete_hook()` for per-UPS event scripts |
| `src/backend/routes/hooks.py` | `GET/PUT/DELETE /api/hooks/<upsname>/<event>` |
| `src/backend/scripts/notifycmd.sh` | Sample notify script (installed to `/etc/nut/notifycmd.sh`) |

## Files to modify

| File | Change |
|------|--------|
| `src/backend/parsers/__init__.py` | Export `parse_upsmon_conf`, `serialize_upsmon_conf` |
| `src/backend/services/__init__.py` | Export `get_upsmon_config`, `put_upsmon_config`, hook service functions |
| `src/backend/routes/__init__.py` | Export `upsmon_bp`, `hooks_bp` |
| `src/backend/app.py` | Register `upsmon_bp` and `hooks_bp` |
| `src/backend/static/index.html` | Add **Notifications** nav button + section; add hooks editor modal |
| `src/backend/static/app.js` | Load/save handlers, editable monitor table, event forms, per-UPS hook editor |
| `src/backend/static/style.css` | Styles for hooks table and script editor textarea |
| `src/backend/tests/test_parsers.py` | Roundtrip tests for all `upsmon.conf` directives |
| `Makefile` | Include `scripts/` in `build-tarball` target |
| `vm/nut-vm.sh` | Template: add `NOTIFYCMD`, upload sample script, create hook dirs |
| `src/backend/install.sh` | Copy sample script to `/etc/nut/`, create hook dirs on existing installs |

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

### Hook cleanup on UPS deletion

`services/ups.py::delete_ups()` iterates over `list_hooks(name)` and calls `delete_hook(name,
event)` for every event before returning.  This ensures no orphaned hook scripts are left
behind in `/etc/nut/notify.d/` when a UPS is removed.

---

## 3. Service — `services/hooks.py`

Manages per-UPS hook scripts stored in `/etc/nut/notify.d/<UPSNAME>_<EVENT>.sh`.

### `list_hooks(upsname: str) -> list`

Returns a list of event names for which a hook file exists for the given UPS.

### `get_hook(upsname: str, event: str) -> str | None`

Reads the content of the hook script. Returns `None` if the file does not exist.

### `put_hook(upsname: str, event: str, content: str)`

Writes the hook script to disk using atomic `utils.write_file`.  Validates that the
content does not contain newlines (it is a multi-line script, so this check is **not**
applied — the script content is written as-is).  Sets ownership to `root:nut` and
permissions to `750`.  Creates `/etc/nut/notify.d/` if it does not exist.

> **Note:** A hook script must be executable for `notifycmd.sh` to run it.  `write_file`
> copies permissions from the existing file; on first write we explicitly `chmod 750`.

### `delete_hook(upsname: str, event: str)`

Removes the hook file if it exists.

### `get_hook_path(upsname: str, event: str) -> str`

Returns `/etc/nut/notify.d/{upsname}_{event}.sh`.

---

## 4. Route — `routes/upsmon.py`

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

## 5. Route — `routes/hooks.py`

```python
hooks_bp = Blueprint("hooks", __name__)

@hooks_bp.route("/api/hooks/<upsname>/<event>", methods=["GET"])
@require_admin
def get_hook_handler(upsname, event):
    content = get_hook(upsname, event)
    if content is None:
        return jsonify({"error": "not found"}), 404
    return jsonify({"content": content})

@hooks_bp.route("/api/hooks/<upsname>/<event>", methods=["PUT"])
@require_admin
def put_hook_handler(upsname, event):
    data = request.get_json(force=True) or {}
    content = data.get("content", "")
    put_hook(upsname, event, content)
    return jsonify({"ok": True})

@hooks_bp.route("/api/hooks/<upsname>/<event>", methods=["DELETE"])
@require_admin
def delete_hook_handler(upsname, event):
    delete_hook(upsname, event)
    return jsonify({"ok": True})
```

---

## 6. Sample Script — `scripts/notifycmd.sh`

```bash
#!/bin/bash
# NUT notifycmd -- sample script.
# Environment: UPSNAME, NOTIFYTYPE (set by upsmon).
# Place per-UPS hooks in /etc/nut/notify.d/<UPSNAME>_<EVENT>.sh

LOGFILE="/var/log/nut/notifycmd.log"
HOOKDIR="/etc/nut/notify.d"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# UPSNAME includes @host:port (e.g. ups@localhost:3493); strip it for the hook filename.
UPSNAME_BARE="${UPSNAME%%@*}"

echo "[$TIMESTAMP] UPS=$UPSNAME EVENT=$NOTIFYTYPE" >>"$LOGFILE"

# Per-UPS per-event hook
[[ -x "$HOOKDIR/${UPSNAME_BARE}_${NOTIFYTYPE}.sh" ]] && "$HOOKDIR/${UPSNAME_BARE}_${NOTIFYTYPE}.sh" >>"$LOGFILE" 2>&1
```

> **Important:** `upsmon` sets `$UPSNAME` to the full monitor string (`ups@localhost:3493`), not
> just the bare UPS name.  The script must strip the `@host:port` suffix before building the
> hook filename (`ups_ONBATT.sh` not `ups@localhost:3493_ONBATT.sh`).

> **Rationale:** Only per-UPS per-event hooks are supported.  Global per-event hooks
> (`/etc/nut/notify.d/<EVENT>.sh`) are intentionally removed from the sample script
> because the web UI manages hooks per-UPS, making the relationship between a UPS
> and its actions explicit and unambiguous.

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

> **Hook files created via the web UI** must also be `root:nut 750` so that `upsmon` (running as
the `nut` user) can execute them.  `services/hooks.py::put_hook()` explicitly `chown`s to
`root:nut` after writing.

---

## 7. Frontend — "Notifications" Tab

### Tab name

`Notifications` (placed between `Users` and `Logs` in the nav bar so the nav order becomes:
UPS Devices → Users → Notifications → Logs → Config Files).

### Section layout

#### 7a. Monitor Lines (editable table)

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

#### 7b. Global Commands

| Field | Input |
|-------|-------|
| `SHUTDOWNCMD` | text input |
| `NOTIFYCMD` | text input |
| `POWERDOWNFLAG` | text input |

#### 7c. Timing Parameters

Number inputs for: `POLLFREQ`, `POLLFREQALERT`, `HOSTSYNC`, `DEADTIME`,
`RBWARNTIME`, `NOCOMMWARNTIME`, `FINALDELAY`.

#### 7d. Notification Messages & Flags

Table with one row per event:

| Event | Message | SYSLOG | WALL | EXEC | IGNORE |
|-------|---------|--------|------|------|--------|
| ONLINE | text input | ☑ | ☑ | ☐ | ☐ |
| ONBATT | text input | ☑ | ☑ | ☐ | ☐ |
| … | … | … | … | … | … |

Checkboxes for flags.  Selecting `IGNORE` should disable the other three (mutually exclusive
in NUT).

#### Save button

Sends full payload to `PUT /api/upsmon/config`.  On success, shows confirmation dialog
offering to **Restart nut-monitor** (same pattern as the UPS save flow).

### JS functions to add

- `loadNotifications()` — fetches `GET /api/upsmon/config`, renders the form.
- `saveNotifications()` — collects form data, calls `PUT /api/upsmon/config`.
- `addMonitorRow()` / `removeMonitorRow()` — manage the editable monitor table.
- `flaggedOnly()` — toggles between `IGNORE` and the other flags (mutual exclusion).

---

## 8. Frontend — Per-UPS Hook Editor

### Access

Each UPS card in the **UPS Devices** grid gets a new **Hooks** button alongside
Edit / Start / Stop / Delete.  Clicking it opens a **dedicated Hooks section**
(scoped to that UPS) where the user can create, edit, and delete per-event hook
scripts.

> **Why per-UPS?**  NUT's `upsmon.conf` notifications are global, but the `notifycmd.sh`
> script routes events per-UPS by looking for `/etc/nut/notify.d/<UPSNAME>_<EVENT>.sh`.
> Putting the hook editor inside each UPS card makes the relationship explicit:
> *"When THIS UPS triggers THIS EVENT, run THIS script."*

### Hooks section layout

```
+-----------------------------------------------------------+
|  <- Back to UPS Devices          Hooks for: myups         |
+-----------------------------------------------------------+
|                                                           |
|  Event        Has Hook?    Actions                       |
|  ------------------------------------------------------  |
|  ONLINE       --           [Add Hook]                    |
|  ONBATT       ✅           [Edit] [Delete]               |
|  LOWBATT      --           [Add Hook]                    |
|  COMMOK       --           [Add Hook]                    |
|  COMMBAD      --           [Add Hook]                    |
|  SHUTDOWN     ✅           [Edit] [Delete]               |
|  REPLBATT     --           [Add Hook]                    |
|  NOCOMM       --           [Add Hook]                    |
|  NOPARENT     --           [Add Hook]                    |
|                                                           |
|  [?] Tip: Scripts receive $UPSNAME and $NOTIFYTYPE.     |
|                                                           |
+-----------------------------------------------------------+
```

### Hook editor modal

Opened when clicking **Add Hook** or **Edit**.

| Field | Input |
|-------|-------|
| UPS Name | read-only label (pre-filled from card) |
| Event | read-only label when editing; dropdown when adding |
| Script | `<textarea>` styled as a dark code editor (monospace, tab support) |

The textarea accepts full multi-line bash scripts.  On save, the content is sent as a
string to `PUT /api/hooks/<upsname>/<event>`.  On delete, `DELETE /api/hooks/<upsname>/<event>`.

### JS functions to add

- `openHooksSection(upsname)` — hides UPS Devices section, shows Hooks section, populates table.
- `closeHooksSection()` — returns to UPS Devices.
- `loadHooksTable(upsname)` — calls `GET /api/hooks/<upsname>/<event>` for each event to detect existence.
- `openHookEditor(upsname, event, existingContent)` — opens modal with textarea.
- `saveHook(upsname, event)` — sends `PUT /api/hooks/<upsname>/<event>` with textarea content.
- `deleteHook(upsname, event)` — sends `DELETE` after confirmation.

### Script editor UX notes

- Use a plain `<textarea>` with dark background, monospace font, and fixed tab-size.
- Trap the `Tab` key to insert spaces (or a literal `\t`) so users can indent without
  leaving the field.
- Placeholder text: `#!/bin/bash\n# This script runs when <EVENT> fires for <UPSNAME>.\n# Environment: $UPSNAME, $NOTIFYTYPE\n`

---

## 9. Tests — `tests/test_parsers.py`

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

## 10. `vm/nut-vm.sh` changes

### In the `upsmon.conf` template (around line 535)

Add after `MINSUPPLIES 1`:

```conf
NOTIFYCMD "/etc/nut/notifycmd.sh"
```

Also add `NOTIFYFLAG` entries for all 9 events **including `EXEC`** so that `upsmon` actually
calls `NOTIFYCMD` when events fire:

```conf
NOTIFYFLAG ONLINE   SYSLOG+WALL+EXEC
NOTIFYFLAG ONBATT   SYSLOG+WALL+EXEC
NOTIFYFLAG LOWBATT  SYSLOG+WALL+EXEC
NOTIFYFLAG COMMOK   SYSLOG+WALL+EXEC
NOTIFYFLAG COMMBAD  SYSLOG+WALL+EXEC
NOTIFYFLAG SHUTDOWN SYSLOG+WALL+EXEC
NOTIFYFLAG REPLBATT SYSLOG+WALL+EXEC
NOTIFYFLAG NOCOMM   SYSLOG+WALL+EXEC
NOTIFYFLAG NOPARENT SYSLOG+WALL+EXEC
```

### After writing `upsmon.conf` (around line 555)

Write and upload the sample script:

```bash
cat >"$tmp_dir/notifycmd.sh" <<'NOTIFY_EOF'
#!/bin/bash
LOGFILE="/var/log/nut/notifycmd.log"
HOOKDIR="/etc/nut/notify.d"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] UPS=$UPSNAME EVENT=$NOTIFYTYPE" >>"$LOGFILE"
[[ -x "$HOOKDIR/${UPSNAME%%@*}_${NOTIFYTYPE}.sh" ]] && "$HOOKDIR/${UPSNAME%%@*}_${NOTIFYTYPE}.sh" >>"$LOGFILE" 2>&1
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

## 11. `Makefile` changes

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

## 12. `install.sh` changes

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
2. **Hook service** → `services/hooks.py` (read/write/delete hook scripts).
3. **Hook route** → `routes/hooks.py` + register in `app.py` and `__init__.py`.
4. **Notifications service** → `services/upsmon.py` (read/write with validation).
5. **Notifications route** → `routes/upsmon.py` + register in `app.py` and `__init__.py`.
6. **Frontend** → `index.html` + `app.js` (Notifications tab + per-UPS hook editor).
7. **Sample script** → `scripts/notifycmd.sh` + `Makefile` + `install.sh`.
8. **VM script** → `vm/nut-vm.sh` (template update + sample script upload).
9. **Final check** → `make check` (lint, format, pytest).
