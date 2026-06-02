# Frontend Migration Plan: Vanilla JS SPA → React + Vite

## Goal

Extract the static frontend from `src/nutwatch/static/`, create a React + Vite project in `src/frontend/`, rename `src/nutwatch/` to `src/backend/`, and have Vite's build output land in `src/backend/static/` so Flask serves it exactly as before.

The tarball (`nutwatch.tar.gz`) internal structure must stay **identical** — `install.sh` and `vm/nut-vm.sh` must not change.

---

## Current State

```
src/
├── nutwatch/
│   ├── __init__.py              # empty package marker
│   ├── app.py                   # Flask app factory + entrypoint (50 lines)
│   ├── auth.py                  # Bearer token auth decorator (25 lines)
│   ├── config.py                # Env vars, regex, allowed configs (15 lines)
│   ├── install.sh               # Deploy script — downloads tarball, extracts to /opt/nutwatch (50 lines)
│   ├── nutwatch.service        # systemd unit — runs from /opt/nutwatch (17 lines)
│   ├── requirements.txt         # flask==3.1.3, pytest==9.0.3
│   ├── utils.py                 # read_file, write_file (atomic), run_cmd, stop_driver, ups_status (105 lines)
│   ├── parsers/
│   │   ├── __init__.py
│   │   ├── monitor.py
│   │   ├── nut_scanner.py
│   │   ├── ups_conf.py
│   │   ├── upsd_users.py
│   │   └── upsmon_conf.py
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── hooks.py
│   │   ├── logs.py
│   │   ├── system.py
│   │   ├── ups.py
│   │   ├── upsmon.py
│   │   └── users.py
│   ├── scripts/
│   │   └── notifycmd.sh
│   ├── services/
│   │   ├── __init__.py
│   │   ├── hooks.py
│   │   ├── system.py
│   │   ├── ups.py
│   │   ├── upsmon.py
│   │   └── users.py
│   ├── static/
│   │   ├── index.html           # SPA shell (196 lines)
│   │   ├── app.js               # All frontend logic (973 lines)
│   │   └── style.css            # Dark theme CSS (984 lines)
│   └── tests/
│       └── test_parsers.py      # 24 tests (279 lines)
vm/
└── nut-vm.sh                    # Proxmox VM creation script
```

### Tarball structure (what `make build-tarball` produces)

The `-C src/nutwatch` flag strips the source prefix — the tarball is flat:

```
nutwatch.tar.gz
├── __init__.py
├── app.py
├── auth.py
├── config.py
├── utils.py
├── parsers/
├── services/
├── routes/
├── static/                  # ← Will be replaced by Vite build output
│   ├── index.html
│   ├── app.js
│   └── style.css
├── scripts/
│   └── notifycmd.sh
├── nutwatch.service
└── requirements.txt
```

---

## Target State

```
src/
├── backend/                    # renamed from src/nutwatch/
│   ├── __init__.py
│   ├── app.py                  # unchanged (no catch-all needed)
│   ├── auth.py
│   ├── config.py
│   ├── install.sh
│   ├── nutwatch.service
│   ├── requirements.txt
│   ├── utils.py
│   ├── parsers/
│   ├── routes/
│   ├── scripts/
│   ├── services/
│   ├── static/                 # Vite build output (gitignored, generated)
│   └── tests/
└── frontend/                   # new: React + Vite source
    ├── .gitignore
    ├── package.json
    ├── vite.config.js
    ├── index.html              # Vite HTML entry point
    └── src/
        ├── main.jsx            # React entry point
        ├── App.jsx             # Root component
        ├── App.css
        ├── api.js              # Fetch wrapper
        ├── index.css           # Ported from style.css
        └── components/
            ├── Sidebar.jsx
            ├── Dashboard.jsx
            ├── UpsDevices.jsx
            ├── UpsCard.jsx
            ├── UpsModal.jsx
            ├── Users.jsx
            ├── UserModal.jsx
            ├── Notifications.jsx
            ├── Logs.jsx
            ├── ConfigFiles.jsx
            ├── HooksSection.jsx
            ├── HookEditor.jsx
            ├── Modal.jsx
            ├── ConfirmDialog.jsx
            ├── Badge.jsx
            └── ServiceStatus.jsx
vm/
└── nut-vm.sh                   # unchanged
```

### New tarball structure (identical at root level)

```
nutwatch.tar.gz
├── __init__.py
├── app.py
├── auth.py
├── config.py
├── utils.py
├── parsers/
├── services/
├── routes/
├── static/                  # Vite build output (index.html + assets/*.js + assets/*.css)
├── scripts/
│   └── notifycmd.sh
├── nutwatch.service
└── requirements.txt
```

`install.sh`, `vm/nut-vm.sh`, and `nutwatch.service` see **no difference** — they extract the tarball to `/opt/nutwatch/` and everything is in the same place.

---

## Phase 1: Rename `src/nutwatch/` → `src/backend/`

### Step 1.1: Git rename

```bash
git mv src/nutwatch src/backend
```

### Step 1.2: Update `Makefile`

**Current state:**
```makefile
SHELL_FILES := $(shell find vm/ src/ -name "*.sh")
TARBALL_DIR := src/nutwatch

lint-python:
	@for f in $$(find src/nutwatch -name '*.py'); do ...

test-python:
	cd src/nutwatch && python3 -m pytest tests/ -v

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
		nutwatch.service requirements.txt
```

**After:**
```makefile
SHELL_FILES := $(shell find vm/ src/backend/ -name "*.sh")
TARBALL_DIR := src/backend

lint-python:
	@for f in $$(find src/backend -name '*.py'); do ...

test-python:
	cd src/backend && python3 -m pytest tests/ -v

build-frontend:
	cd src/frontend && npm ci && npm run build

build-tarball: build-frontend
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
		nutwatch.service requirements.txt

install-tools:
	sudo apt-get install -y shellcheck shfmt python3-pytest nodejs npm
```

Notes:
- `SHELL_FILES` uses `src/backend/` prefix. Shell scripts are `vm/nut-vm.sh`, `src/backend/install.sh`, `src/backend/scripts/notifycmd.sh`.
- The old pattern `find vm/ src/ -name "*.sh"` would still work but would also catch any `.sh` in `src/frontend/` (none exist). Using the narrower `src/backend/` is cleaner.
- `build-tarball` depends on `build-frontend` — Vite populates `src/backend/static/` before the tarball is created.
- The `-C src/backend` flag means the tarball's internal paths are flat (e.g. `app.py` at root, not `src/backend/app.py`).

### Step 1.3: Update `.github/workflows/lint.yml`

**Current:**
```yaml
- name: Install dependencies
  run: pip install -r src/nutwatch/requirements.txt

- name: Syntax check
  run: find src/nutwatch -name '*.py' -print0 | xargs -0 python3 -m py_compile

- name: Tests
  working-directory: src/nutwatch
  run: python3 -m pytest tests/ -v
```

**After:**
```yaml
- name: Install dependencies
  run: pip install -r src/backend/requirements.txt

- name: Syntax check
  run: find src/backend -name '*.py' -print0 | xargs -0 python3 -m py_compile

- name: Tests
  working-directory: src/backend
  run: python3 -m pytest tests/ -v
```

### Step 1.4: Update `.github/workflows/release.yml`

Same path changes as lint.yml in the `lint-python` job. The `release` job needs Node.js setup **before** the tarball build:

```yaml
release:
  needs: [lint-shell, lint-python]
  runs-on: ubuntu-latest
  permissions:
    contents: write
  steps:
    - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
      with:
        persist-credentials: false

    - name: Set up Node.js
      uses: actions/setup-node@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
      with:
        node-version: '20'

    - name: Build frontend
      run: cd src/frontend && npm ci && npm run build

    - name: Build tarball
      run: make build-tarball

    - name: Create GitHub Release
      uses: softprops/action-gh-release@3bb12739c298aeb8a4eeaf626c5b8d85266b0e65 # v2
      with:
        files: nutwatch.tar.gz
        generate_release_notes: true
```

### Step 1.5: Update `.coderabbit.yaml`

Replace all `src/nutwatch/` patterns:

| Line(s) | Old | New |
|---------|-----|-----|
| 28 | `src/nutwatch/` | `src/backend/` |
| 114 | `src/nutwatch/**/*.py` | `src/backend/**/*.py` |
| 133-141 | `src/nutwatch/static/**` | `src/frontend/src/**` (updated instructions below) |
| 144 | `src/nutwatch/install.sh` | `src/backend/install.sh` |
| 154-158 | `src/nutwatch/tests/**` | `src/backend/tests/**` |

Updated static section instructions (lines 133-141):

```
Old: "This is a vanilla SPA with no build step. Do not suggest
      minification, bundling, or framework migrations."

New: "React SPA built with Vite. The source lives in src/frontend/src/
      and the build output goes to src/backend/static/. Do not suggest
      adding frameworks or changing the build tool. XSS: JSX auto-escapes
      by default — flag any dangerouslySetInnerHTML usage. API calls use
      fetch('/api/...') — relative URLs are correct for same-origin
      deployment."
```

Updated tests section instructions (lines 154-158):

```
Old: "Tests import from the package directly (e.g., from parsers import
      ..., from utils import ...) because they run from src/nutwatch/."

New: "Tests import from the package directly (e.g., from parsers import
      ..., from utils import ...) because they run from src/backend/."
```

### Step 1.6: Update `AGENTS.md`

| Line | Old | New |
|------|-----|-----|
| 8 | `src/nutwatch/` | `src/backend/` |
| 20 | `src/nutwatch/tests/` | `src/backend/tests/` |
| 43 | `## nutwatch (src/nutwatch/)` | `## nutwatch (src/backend/)` |
| 52 | `tests run from src/nutwatch/` | `tests run from src/backend/` |

### Step 1.7: Update `README.md`

| Line | Old | New |
|------|-----|-----|
| 91 | `src/nutwatch/app.py` | `src/backend/app.py` |
| 99 | `src/nutwatch/install.sh` | `src/backend/install.sh` |
| 130 | `NUTWATCH_REF in src/nutwatch/install.sh` | `NUTWATCH_REF in src/backend/install.sh` |

### Step 1.8: Update `docs/modularization-plan.md`

All references to `src/nutwatch/` → `src/backend/`. The directory layout diagram on line 39 needs updating.

### Step 1.9: Update `docs/notifications-plan.md`

All references to `src/nutwatch/` → `src/backend/`.

### Step 1.10: Update `.gitignore`

Add to the repo's root `.gitignore`:

```
# Frontend dependencies
src/frontend/node_modules/
src/frontend/dist/

# Generated static files (Vite build output)
src/backend/static/
```

`src/backend/static/` is now entirely generated by Vite — it must NOT be committed. The tarball build depends on `build-frontend`, which generates it at build time.

### Step 1.11: Remove old static files from git tracking

```bash
git rm src/backend/static/index.html
git rm src/backend/static/app.js
git rm src/backend/static/style.css
```

These are the old vanilla SPA files. After the rename, they're at `src/backend/static/`. They're removed from tracking because `src/backend/static/` is now gitignored and populated by Vite at build time.

---

## Phase 2: Create `src/frontend/` (React + Vite)

### Step 2.1: `src/frontend/package.json`

```json
{
  "name": "nutwatch-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.0"
  }
}
```

### Step 2.2: `src/frontend/vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/static/',
  build: {
    outDir: '../backend/static',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
});
```

Key decisions:
- **`base: '/static/'`** — All asset URLs in the built HTML are prefixed with `/static/`. Flask already serves `/static/<path>` as static files, and `/` serves `index.html`.
- **`build.outDir: '../backend/static'`** — From `src/frontend/`, the relative path `../backend/static` resolves to `src/backend/static/`. Vite writes directly into the Flask backend's static dir.
- **`emptyOutDir: true`** — Clears old build artifacts on each build.
- **Dev proxy** — During `npm run dev`, API calls to `/api/*` are proxied to Flask on `localhost:8081`.

### Step 2.3: `src/frontend/index.html`

Vite requires `index.html` at project root (not in `public/`). It becomes the entry point — Vite injects the `<script>` tag automatically:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NutWatch</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>
```

The `<div id="root">` replaces the old `<div class="app" id="app">`. All HTML structure moves into React components. Vite's `index.html` does NOT need a `<script src="/src/main.jsx">` — Vite injects it during dev and build.

### Step 2.4: `src/frontend/src/main.jsx`

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### Step 2.5: `src/frontend/src/App.jsx`

Root component. Contains sidebar, section routing state (`useState`), main content area, and modal/confirm dialog overlays.

```jsx
import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import UpsDevices from './components/UpsDevices';
import Users from './components/Users';
import Notifications from './components/Notifications';
import Logs from './components/Logs';
import ConfigFiles from './components/ConfigFiles';
import HooksSection from './components/HooksSection';
import Modal from './components/Modal';
import ConfirmDialog from './components/ConfirmDialog';
import './App.css';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  ups: 'UPS Devices',
  users: 'Users',
  notifications: 'Notifications',
  logs: 'Logs',
  config: 'Config Files',
  hooks: 'Hooks',
};

export default function App() {
  const [section, setSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentHooksUps, setCurrentHooksUps] = useState('');

  const showSection = useCallback((id) => {
    setSection(id);
    setSidebarOpen(false);
  }, []);

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      <Sidebar active={section} onNavigate={showSection} />
      <main className="main">
        <div className="main-header">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}>
            &#9776;
          </button>
          <h2 id="page-title">{PAGE_TITLES[section] || 'Dashboard'}</h2>
        </div>
        <div className="content">
          {section === 'dashboard' && <Dashboard />}
          {section === 'ups' && <UpsDevices onViewHooks={(name) => { setCurrentHooksUps(name); setSection('hooks'); }} />}
          {section === 'users' && <Users />}
          {section === 'notifications' && <Notifications />}
          {section === 'logs' && <Logs />}
          {section === 'config' && <ConfigFiles />}
          {section === 'hooks' && <HooksSection upsname={currentHooksUps} onBack={() => showSection('ups')} />}
        </div>
      </main>
      <Modal />
      <ConfirmDialog />
    </div>
  );
}
```

### Step 2.6: `src/frontend/src/api.js`

Equivalent of the vanilla `api()` function from `app.js:155-163`.

```js
export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt);
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json();
  }
  return res.text();
}
```

### Step 2.7: Component breakdown

Each component corresponds to a section or UI element from the original monolithic `app.js`. All must preserve the exact behavior of the original.

#### `Sidebar.jsx`

- Brand (dot + title + version "v1.0.0")
- Navigation buttons with inline SVG icons
- Highlights `active` section
- 6 items: Dashboard, UPS Devices, Users, Notifications, Logs, Config Files

Inline SVGs are kept for simplicity (same as original).

#### `Dashboard.jsx`

Ports `loadDashboard()` from `app.js:82-139`.

- 4 stat cards: UPS count, User count, Active Services, System Health
- 2 detail cards: UPS Overview list, Services list
- Loads on mount: `Promise.all([api('/ups'), api('/users'), api('/service/status-detailed')])`
- Health logic: exclude `nut-driver*` from core services; Failed > Healthy > Degraded > Unknown
- Error handling: shows "?" counts and "Failed to load" messages for each section independently

State:
```js
const [upsList, setUpsList] = useState([]);
const [userCount, setUserCount] = useState(null);
const [services, setServices] = useState(null);
const [loading, setLoading] = useState(true);
```

#### `UpsDevices.jsx`

Ports `loadUps()`, `loadServiceStatus()`, `openUpsModal()`, `saveUps()`, `deleteUps()`, `scanUps()`, `addScannedUps()`, `saveUpsScanned()`, `driverAction()`, `restartAllThenDriver()`, `showRestartDriverModal()`, and the delegated click handlers from `app.js`.

- Service status bar at top (fetches `/api/service/status-detailed`)
- Toolbar: Add UPS, Scan USB, Refresh buttons
- Card grid rendered via `UpsCard`
- UPS modal (`UpsModal`) for add/edit/scanned-add flows
- Driver restart modal after save
- Scan results modal

Important behaviors preserved:
- Delete: confirm → API delete → restart services → reload
- Edit: pre-fills form, name readonly
- Scan: POST `/api/ups/scan` → show results → "Add to NUT" pre-fills add form
- Save: POST (add) or PUT (edit) → close modal → show restart driver prompt
- Driver actions: POST `/api/driver/<name>/<action>`
- Guard flags: `_upsSavePending`, `_deletePending`, `_driverPending`, `_restartPending` (`useRef` replicas)

#### `UpsCard.jsx`

Renders a single UPS card. Props: `ups`, `onEdit`, `onHooks`, `onDriverAction`, `onDelete`.

```jsx
<div className="card">
  <h3>{ups.name} <Badge status={ups.status} /></h3>
  <div className="meta">driver: {ups.driver || '-'}</div>
  <div className="meta">port: {ups.port || '-'}</div>
  <div className="meta">desc: {ups.desc || '-'}</div>
  {(ups.directives || []).length > 0 && (
    <div className="meta">
      {ups.directives.map((d, i) => <span key={i}>{d[0]}={d[1]}</span>).reduce((a,b) => <>{a}, {b}</>)}
    </div>
  )}
  <div className="actions">
    <button className="secondary" onClick={() => onEdit(ups)}>Edit</button>
    <button className="secondary" onClick={() => onHooks(ups.name)}>Hooks</button>
    <button className="secondary" onClick={() => onDriverAction(ups.name, 'start')}>Start driver</button>
    <button className="secondary" onClick={() => onDriverAction(ups.name, 'stop')}>Stop driver</button>
    <button className="secondary danger" onClick={() => onDelete(ups.name)}>Delete</button>
  </div>
</div>
```

#### `UpsModal.jsx`

Props: `mode` ('add' | 'edit'), `ups` (existing data), `scanData` (scanned device), `onClose`, `onSaved`.

Manages its own form state. Pre-fills from `ups` (edit) or `scanData` (scanned add). Name field readonly in edit. Pollinterval warning if < 5. "Apply Recommended Config" button normalizes directives. On save, shows restart driver prompt inside the same modal.

Uses the modal context to show the form and the restart prompt. Guard: `_upsSavePending` via `useRef`.

#### `Users.jsx`

Ports `loadUsers()`, `openUserModal()`, `saveUser()`, `deleteUser()` from `app.js`.

- Toolbar: Add User, Refresh
- Table: Username, Role (upsmon), Password (masked as `******`), Actions, Instcmds, Edit/Delete buttons
- Uses `UserModal` component for add/edit
- Delete uses confirm dialog
- Guard: `_userSavePending`, `_deletePending` via `useRef`

#### `UserModal.jsx`

Similar to UpsModal. Fields: Username (readonly in edit), Password (placeholder `******` in edit, leave blank to keep current), upsmon, Actions, Instcmds. Validates password is required for new users.

#### `Notifications.jsx`

Ports `loadNotifications()` (lines 637-705) and `saveNotifications()` (lines 777-835) from `app.js`.

Renders:
- **Monitor lines table** — editable rows with UPS name dropdown, host, power, username, password, role. Add/Remove row buttons.
- **Global commands** — MINSUPPLIES (number), SHUTDOWNCMD, NOTIFYCMD, POWERDOWNFLAG inputs.
- **Timing parameters** — 7 timing fields in a grid (POLLFREQ, POLLFREQALERT, HOSTSYNC, DEADTIME, RBWARNTIME, NOCOMMWARNTIME, FINALDELAY).
- **Notification messages & flags table** — 9 rows (ONLINE, ONBATT, LOWBATT, COMMOK, COMMBAD, SHUTDOWN, REPLBATT, NOCOMM, NOPARENT), each with message input and 4 checkboxes (SYSLOG, WALL, EXEC, IGNORE).
- **Info box** — documents notifycmd.sh and hook directory structure.
- **Save button** — PUT `/api/upsmon/config` → show restart monitor prompt.

The `flaggedOnly` logic (lines 752-775) must be preserved exactly:
- Checking IGNORE disables and unchecks SYSLOG/WALL/EXEC for that event.
- Unchecking IGNORE re-enables them.
- Checking any non-IGNORE flag unchecks IGNORE and re-enables all others.

State:
```js
const [config, setConfig] = useState(null);
const [upsNames, setUpsNames] = useState([]);
const [saving, setSaving] = useState(false);
```

On mount, fetches both `/api/upsmon/config` and `/api/ups` (for monitor UPS name dropdowns).

#### `Logs.jsx`

Ports `startLogStream()`, `toggleLogPause()`, `loadRecentLogs()` from `app.js`.

- SSE connection to `/api/logs/stream` via `EventSource`
- Pause/Resume toggle button
- "Load Recent" button (GET `/api/logs/recent?lines=100`)
- Auto-scroll checkbox
- Log lines with classNames: `error` (matches /error|fail|err/i), `warn` (/warn|warning/i), `info` (/info|started|running/i)
- MAX_LOG_LINES = 1000 enforcement

Uses `useEffect` for EventSource lifecycle. Cleanup on unmount closes the stream. Uses a ref for `logPaused` to avoid stale closure issues in SSE callback.

#### `ConfigFiles.jsx`

Ports `loadConfig()`, `saveConfig()` from `app.js`.

- 4 config buttons: ups.conf, upsd.conf, upsmon.conf, upsd.users
- Textarea editor (readonly for upsd.users)
- Save button
- Current filename display

`loadConfig(filename)` → GET `/api/config/<filename>` → populate textarea.
`saveConfig()` → PUT `/api/config/<filename>` with raw body → show alert.
upsd.users is read-only (enforced in both frontend and backend).

#### `HooksSection.jsx`

Ports `openHooksSection()`, `closeHooksSection()`, `loadHooksTable()` from `app.js:866-906`.

Props: `upsname`, `onBack`.

- Back button → calls `onBack` (navigates to UPS section)
- Title: "Hooks for: <upsname>"
- Table: 9 rows (NOTIFICATION_EVENTS) with Event, Has Hook (badge `online`/`unknown`), Actions (Edit/Delete if hook exists, Add if not)
- On mount: GET `/api/hooks/<upsname>` → array of event names that have hooks
- Edit/Delete buttons open `HookEditor` in modal

#### `HookEditor.jsx`

Ports `openHookEditor()`, `saveHook()`, `deleteHook()` from `app.js:908-966`.

Opened via modal context. Props: `upsname`, `event`, `onClose`.

- On open: GET `/api/hooks/<upsname>/<event>` for existing content
- Script textarea with Tab key trapping (`e.preventDefault()` + insert `\t`)
- Save button: PUT `/api/hooks/<upsname>/<event>` with content
- Delete button: confirm → DELETE `/api/hooks/<upsname>/<event>`
- Guard: `_hooksSavePending` via `useRef`

#### `Modal.jsx`

Generic modal overlay. Used for add/edit forms, scan results, restart prompts, and alerts.

Uses React Context for shared state management. A `ModalProvider` wraps the app and provides:

```jsx
const { openModal, closeModal, modalContent } = useModal();
```

`openModal(jsxElement)` sets the content. `closeModal()` clears it. The modal overlay renders whatever JSX was passed.

#### `ConfirmDialog.jsx`

Promise-based confirm dialog. Used for delete confirmations, pollinterval warnings, restart prompts.

Uses React Context. A `ConfirmProvider` wraps the app and provides:

```js
const { confirm, dangerConfirm, alert } = useConfirm();

// confirm(msg) → Promise<boolean>
const ok = await confirm('Are you sure?');

// dangerConfirm(msg) → Promise<boolean>
const ok = await dangerConfirm('Delete UPS "myups"?');

// alert(msg, title?) → Promise<void>
await alert('Saved successfully', 'Config Saved');
```

Implementation: renders the confirm overlay. Uses `useRef` to store promise resolve/reject callbacks. On confirm/cancel, resolves the pending promise and clears the overlay.

#### `Badge.jsx`

```jsx
export default function Badge({ status }) {
  const s = (status || 'unknown').toLowerCase();
  const cls = ['online', 'onbatt', 'offline'].includes(s) ? s : 'unknown';
  return <span className={`badge ${cls}`}>{s}</span>;
}
```

#### `ServiceStatus.jsx`

Renders the service status bar. Fetches `/api/service/status-detailed` on mount via `useEffect`. Shows each service with a colored badge (online/offline/unknown). Used in the UPS devices section and referenced by dashboard.

### Step 2.8: `src/frontend/src/index.css`

Port `style.css` (984 lines) as-is. All CSS class names remain identical — the component JSX renders the same class names (`stat-grid`, `card`, `badge`, `modal-overlay`, etc.). No CSS changes needed.

Import via `main.jsx`:
```jsx
import './index.css';
```

If per-component CSS is desired later, it can be extracted component-by-component. For the migration, keeping the monolithic CSS avoids regressions.

### Step 2.9: `src/frontend/.gitignore`

```
node_modules/
dist/
```

The parent repo `.gitignore` handles `node_modules/`, `dist/`, and `src/backend/static/`.

---

## Phase 3: `src/backend/app.py` — no changes needed

### Current state (lines 37-41)

```python
@app.route("/")
def index():
    return send_from_directory(
        os.path.join(os.path.dirname(__file__), "static"), "index.html"
    )
```

### Why no change

The SPA uses React internal state (`section` state variable) for navigation — there are NO client-side URL routes. The user never navigates to `/ups` or `/config`; everything happens at `/`.

1. Flask serves `/` → `static/index.html` (Vite-built, loads React app)
2. Flask serves `/static/assets/*` via built-in static file handling (default Flask behavior for folders named `static/` next to `app.py`)
3. No client-side URL routing exists — all section switching is React state
4. API calls go to `/api/*` which are handled by blueprints

**App.py stays exactly as-is.** No catch-all route, no SPA fallback needed.

---

## Phase 4: Verification

### Step 4.1: Local development

```bash
# Terminal 1: Flask backend
cd src/backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python app.py    # Starts on port 8081

# Terminal 2: Vite dev server
cd src/frontend
npm install
npm run dev                  # Starts on port 5173, proxies /api → :8081
```

Open `http://localhost:5173` — Vite serves React with HMR, API calls proxy to Flask.

### Step 4.2: Production build

```bash
make build-frontend    # cd src/frontend && npm ci && npm run build
                       # → populates src/backend/static/

make build-tarball     # Depends on build-frontend
                       # → nutwatch.tar.gz
```

### Step 4.3: Verify tarball contents

```bash
tar -tzf nutwatch.tar.gz
```

Expected output (flat structure, same as before):
```
__init__.py
app.py
auth.py
config.py
utils.py
parsers/
parsers/__init__.py
parsers/monitor.py
parsers/nut_scanner.py
parsers/ups_conf.py
parsers/upsd_users.py
parsers/upsmon_conf.py
services/
services/__init__.py
services/hooks.py
services/system.py
services/ups.py
services/upsmon.py
services/users.py
routes/
routes/__init__.py
routes/hooks.py
routes/logs.py
routes/system.py
routes/ups.py
routes/upsmon.py
routes/users.py
static/
static/index.html
static/assets/index-xxxxxxxx.css
static/assets/index-xxxxxxxx.js
scripts/
scripts/notifycmd.sh
nutwatch.service
requirements.txt
```

### Step 4.4: Run full CI suite

```bash
make check
```

Runs:
1. `shellcheck vm/nut-vm.sh src/backend/install.sh src/backend/scripts/notifycmd.sh`
2. `shfmt -d -i 2` on same files
3. `py_compile` on all `src/backend/*.py`
4. `pytest src/backend/tests/ -v` (24 tests, should all pass)

### Step 4.5: Test VM deployment

```bash
make build-tarball
cd /tmp && python3 -m http.server 8080

# In another terminal
NUTWATCH_URL_PREFIX="http://YOUR_IP:8080" ./vm/nut-vm.sh
```

The Proxmox script downloads the tarball from the local server, extracts to `/opt/nutwatch/`, enables the service. Flask serves the Vite-built React app on port 8081.

### Step 4.6: Smoke test the web UI

1. Open `http://<VM_IP>:8081`
2. Verify all 6 sidebar sections navigate correctly
3. Dashboard loads stats and service/ups lists
4. UPS: add, edit, delete, scan USB, start/stop driver, view hooks
5. Users: add, edit, delete
6. Notifications: edit monitors, global commands, timing, messages/flags; save and restart
7. Hooks: view, add, edit, delete per-UPS per-event hook scripts
8. Logs: stream live, pause/resume, load recent, auto-scroll
9. Config Files: load ups.conf, upsd.conf, upsmon.conf; edit and save (upsd.users read-only)
10. Responsive: mobile sidebar toggle works

---

## Summary of all files changed

| Action | File |
|--------|------|
| **Rename** | `src/nutwatch/` → `src/backend/` |
| **Create** | `src/frontend/package.json` |
| **Create** | `src/frontend/vite.config.js` |
| **Create** | `src/frontend/index.html` |
| **Create** | `src/frontend/.gitignore` |
| **Create** | `src/frontend/src/main.jsx` |
| **Create** | `src/frontend/src/App.jsx` |
| **Create** | `src/frontend/src/App.css` |
| **Create** | `src/frontend/src/api.js` |
| **Create** | `src/frontend/src/index.css` (ported from style.css) |
| **Create** | `src/frontend/src/components/Sidebar.jsx` |
| **Create** | `src/frontend/src/components/Dashboard.jsx` |
| **Create** | `src/frontend/src/components/UpsDevices.jsx` |
| **Create** | `src/frontend/src/components/UpsCard.jsx` |
| **Create** | `src/frontend/src/components/UpsModal.jsx` |
| **Create** | `src/frontend/src/components/Users.jsx` |
| **Create** | `src/frontend/src/components/UserModal.jsx` |
| **Create** | `src/frontend/src/components/Notifications.jsx` |
| **Create** | `src/frontend/src/components/Logs.jsx` |
| **Create** | `src/frontend/src/components/ConfigFiles.jsx` |
| **Create** | `src/frontend/src/components/HooksSection.jsx` |
| **Create** | `src/frontend/src/components/HookEditor.jsx` |
| **Create** | `src/frontend/src/components/Modal.jsx` |
| **Create** | `src/frontend/src/components/ConfirmDialog.jsx` |
| **Create** | `src/frontend/src/components/Badge.jsx` |
| **Create** | `src/frontend/src/components/ServiceStatus.jsx` |
| **Delete (git)** | `src/backend/static/index.html` |
| **Delete (git)** | `src/backend/static/app.js` |
| **Delete (git)** | `src/backend/static/style.css` |
| **Modify** | `Makefile` — `TARBALL_DIR`, `SHELL_FILES`, `lint-python`, `test-python`, add `build-frontend`, update `install-tools` |
| **Modify** | `.github/workflows/lint.yml` — `src/nutwatch` → `src/backend` |
| **Modify** | `.github/workflows/release.yml` — same paths + Node.js setup + frontend build step |
| **Modify** | `.coderabbit.yaml` — all path patterns to `src/backend/`, static section to `src/frontend/src/`, updated instructions |
| **Modify** | `AGENTS.md` — path updates |
| **Modify** | `README.md` — path updates |
| **Modify** | `docs/modularization-plan.md` — path updates |
| **Modify** | `docs/notifications-plan.md` — path updates |
| **Modify** | `.gitignore` — add `src/frontend/node_modules/`, `src/frontend/dist/`, `src/backend/static/` |
| **No change** | `vm/nut-vm.sh` |
| **No change** | `src/backend/install.sh` |
| **No change** | `src/backend/nutwatch.service` |
| **No change** | `src/backend/scripts/notifycmd.sh` |
| **No change** | `src/backend/tests/test_parsers.py` |
| **No change** | All `src/backend/parsers/` files |
| **No change** | All `src/backend/routes/` files |
| **No change** | All `src/backend/services/` files |
| **No change** | `src/backend/config.py`, `auth.py`, `utils.py`, `requirements.txt`, `app.py` |

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Vite build fails in CI | Node.js setup step added to release workflow before `make build-tarball` |
| API behavior changes due to React refactor | Preserve exact same fetch patterns to `/api/...`; smoke test all CRUD flows |
| CSS specificity issues after porting | Keep identical class names and CSS structure; Vite bundles, doesn't transform |
| SSE stream broken in React | `useEffect` cleanup closes `EventSource` on unmount; `useRef` for `logPaused` to avoid stale closures |
| Modal/confirm dialog promise pattern breaks | Implement as React Context with `useRef` for promise resolution, same API surface (`confirm`, `dangerConfirm`, `alert`) |
| Tarball missing static files | `build-tarball` depends on `build-frontend`; CI verifies tarball contents |
| Shell script linting breaks | `SHELL_FILES` pattern covers `vm/nut-vm.sh`, `src/backend/install.sh`, `src/backend/scripts/notifycmd.sh` |
| Python tests break | Tests import from `parsers` and `utils` — import paths don't change within the package |
| `src/frontend/` picked up by Python tools | `find src/backend -name '*.py'` is scoped to backend only |
