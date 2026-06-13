# Historical Charts — Design Doc

## Overview

Add time-series historical data collection and chart visualization to NutWatch. Capture UPS variable snapshots in SQLite, then display them as line charts with selectable time ranges (1h, 24h, 7d, 30d).

## Decisions

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Storage | SQLite at `/var/lib/nutwatch/history.db` | JSON would be terrible for high-volume time-series data; SQLite is zero-dependency (stdlib), handles concurrent reads, and supports efficient range queries. Put it in `/var/lib/nutwatch/` (variable data), not `/etc/nut/` (config) — follow FHS. |
| Background collection | `threading.Thread` daemon in `app.py` | Simplest approach. No extra deps. Daemon thread auto-exits with the process. Acceptable for a single-worker Flask deployment (NutWatch runs as a standalone service). |
| Poll interval | 60 seconds | Good balance between granularity and load. ~1,440 data points per variable per day. Configurable via env var `NUTWATCH_HISTORY_INTERVAL`. |
| Retention | 90 days | Default. Configurable via env var `NUTWATCH_HISTORY_RETENTION_DAYS`. Pruned on startup and periodically. |
| Chart library | d3 v7.9 | Already a dependency (used by Gauge component). No new npm packages needed. |
| Frontend location | New "History" tab on UpsDetail page | Charts are per-UPS, so they belong on the UPS detail view alongside the existing real-time gauges. |

## Database Schema

File: `/var/lib/nutwatch/history.db` (auto-created on first run)

```sql
CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ups_name TEXT NOT NULL,
    timestamp REAL NOT NULL,
    variable TEXT NOT NULL,
    value REAL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_lookup
    ON snapshots(ups_name, timestamp);

CREATE INDEX IF NOT EXISTS idx_snapshots_var
    ON snapshots(ups_name, variable, timestamp);

CREATE INDEX IF NOT EXISTS idx_snapshots_time
    ON snapshots(timestamp);

PRAGMA journal_mode=WAL;
```

- `timestamp` is Unix epoch (seconds, from `time.time()`)
- `variable` is the raw NUT variable name (e.g. `battery.charge`, `ups.load`)
- `value` is always REAL — NUT values are numeric
- WAL mode enables concurrent reads during writes

## Backend Implementation

### New files

| File | Purpose |
|------|---------|
| `src/backend/services/history.py` | SQLite CRUD, snapshot recording, data querying, pruning |
| `src/backend/routes/history.py` | API endpoints for historical data |

### Modified files

| File | Changes |
|------|---------|
| `src/backend/app.py` | Start background collector thread in `create_app()`; register `history_bp` |
| `src/backend/routes/__init__.py` | Export `history_bp` |

### `services/history.py`

```python
import sqlite3
import logging
import os
import time
import threading

from config import NUT_DIR

logger = logging.getLogger(__name__)

HISTORY_DB = "/var/lib/nutwatch/history.db"
DEFAULT_INTERVAL = 60  # seconds
DEFAULT_RETENTION_DAYS = 90

def get_db():
    os.makedirs(os.path.dirname(HISTORY_DB), exist_ok=True)
    conn = sqlite3.connect(HISTORY_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ups_name TEXT NOT NULL,
        timestamp REAL NOT NULL,
        variable TEXT NOT NULL,
        value REAL
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_snap_lookup ON snapshots(ups_name, timestamp)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_snap_var ON snapshots(ups_name, variable, timestamp)")
    conn.commit()
    return conn
```

Functions to implement:

1. **`record_snapshot(ups_name: str, variables: dict) -> None`**
   - Given a dict of `variable → value` from `ups_variables()`, store each key-value pair with `time.time()` as timestamp.
   - Use `executemany` for batch insert inside a transaction.
   - Only store numeric values (skip strings like `ups.status`).

2. **`get_history(ups_name: str, variables: list[str] | None, since: float) -> dict`**
   - `since` is a Unix timestamp (computed from the requested range).
   - If `variables` is None, return all variables.
   - Return format:
     ```python
     {
         "ups": "myups",
         "variables": {"battery.charge": [[t1, v1], [t2, v2], ...], ...}
     }
     ```
   - Each series is a list of `[timestamp, value]` pairs sorted by time.

3. **`get_available_variables(ups_name: str) -> list[str]`**
   - `SELECT DISTINCT variable FROM snapshots WHERE ups_name = ? ORDER BY variable`

4. **`get_latest_timestamp(ups_name: str) -> float | None`**
   - `SELECT MAX(timestamp) FROM snapshots WHERE ups_name = ?`

5. **`prune(retention_days: int = 90) -> int`**
   - `DELETE FROM snapshots WHERE timestamp < ?`
   - Returns count of deleted rows. Call on startup and periodically.

6. **`start_collector(app, interval: int = 60)`**
   - Background thread function. Every `interval` seconds:
     1. Get list of UPS names from `services.ups.list_ups()`
     2. For each UPS, call `utils.ups_variables(name)` to get current values
     3. Call `record_snapshot(name, vars_dict)`
     4. Prune old data every 100th cycle
   - Use `app.app_context()` for Flask app access.
   - Catch all exceptions per-UPS so one failure doesn't break the whole cycle.

### `routes/history.py`

Blueprint `history_bp`:

- **`GET /api/history/<ups>`** — Query params:
  - `range` — string: `1h`, `24h`, `7d`, `30d` (default `24h`)
  - `variables` — comma-separated variable names (optional, returns all if omitted)
  - Computes `since` from `range`, calls `get_history()`, returns JSON.

- **`GET /api/history/<ups>/variables`** — Returns list of variables that have historical data.

### Integration in `app.py`

```python
def create_app():
    app = Flask(__name__)
    # ... register blueprints ...

    # Start background collector
    from services.history import start_collector
    interval = int(os.environ.get("NUTWATCH_HISTORY_INTERVAL", "60"))
    thread = threading.Thread(target=start_collector, args=(app, interval), daemon=True)
    thread.start()

    return app
```

## Frontend Implementation

### New files

| File | Purpose |
|------|---------|
| `src/frontend/src/components/HistoryChart.jsx` | d3 line chart with time range selector |

### Modified files

| File | Changes |
|------|---------|
| `src/frontend/src/components/UpsDetail.jsx` | Add a "History" section/tab below the real-time gauges |
| `src/frontend/src/constants/index.js` | Add `API.history(ups, range, vars)` helper |
| `src/frontend/src/utils/format.js` | Add date formatting helpers if not already present |

### `HistoryChart.jsx` component

```jsx
function HistoryChart({ upsName }) {
    const [range, setRange] = useState('24h');      // '1h', '24h', '7d', '30d'
    const [selectedVars, setSelectedVars] = useState({});
    const [availableVars, setAvailableVars] = useState([]);
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(true);
    const svgRef = useRef(null);

    useEffect(() => fetchHistory(), [range, upsName, selectedVars]);
    useEffect(() => { if (data && svgRef.current) drawChart(svgRef.current, data, selectedVars); }, [data]);

    // ...
}
```

**d3 chart drawing (`drawChart`):**
- SVG with margins, responsive width
- X axis: time (d3.scaleTime)
- Y axis: value (d3.scaleLinear, auto-range)
- One line per selected variable with distinct colors
- Legend mapping variable name → color
- Tooltip on hover showing timestamp + values
- Grid lines for readability

**Time range selector:**
- Row of buttons: `1h` | `24h` | `7d` | `30d`
- Active button highlighted
- Clicking changes `range` state → re-fetches data

**Variable selector:**
- Checkboxes for each available variable
- Fetched from `/api/history/<ups>/variables`
- Default: select first 3 variables or battery.charge + ups.load
- Toggling checkboxes re-renders chart without re-fetch (data already loaded for all vars)

**Skeleton loading state:**
- Two skeleton rectangles where the chart will render
- Match the pattern used in other NutWatch components

**Empty state:** "No historical data yet. Data is collected every 60 seconds."

### Integration into `UpsDetail.jsx`

Replace the single-page layout with two tabs at the top of the content area:

```
┌─────────────────────────────────────────────┐
│  [UPS name]  [Badge]  [Live/Paused]  [Back] │
├─────────────────────────────────────────────┤
│  [ Info ]  [ Charts ]                       │  ← tab bar
├─────────────────────────────────────────────┤
│                                             │
│  Active tab's content here                  │
│                                             │
└─────────────────────────────────────────────┘
```

**Tab 1: "Info"** — The existing content (gauges + grouped variable grid + raw toggle). No changes to this content.

**Tab 2: "Charts"** — The `<HistoryChart>` component. No gauges, no variable grid, no raw toggle — just the chart area with its time-range selector and variable checkboxes.

**State management in UpsDetail:**
```jsx
const [activeTab, setActiveTab] = useState('info');  // 'info' | 'charts'
```

**Tab bar implementation:**
```jsx
<div className="tab-bar">
  <button className={`tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}>Info</button>
  <button className={`tab ${activeTab === 'charts' ? 'active' : ''}`}
          onClick={() => setActiveTab('charts')}>Charts</button>
</div>

{activeTab === 'info' && (
  // existing content: gauge cards + detail grid + raw toggle
)}
{activeTab === 'charts' && (
  <HistoryChart upsName={upsname} />
)}
```

**CSS for tabs (add to `src/frontend/src/styles/components.css`):**
```css
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--border);
  margin-bottom: 1.25rem;
}
.tab {
  padding: 0.6rem 1.25rem;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.9rem;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.15s, border-color 0.15s;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
```

UpsDetail's existing live-polling interval runs regardless of which tab is active — when the user switches to Charts, the chart fetches its own data independently from the live polling loop.

## API Contract

### `GET /api/history/myups?range=24h`

Response:
```json
{
  "ups": "myups",
  "range": "24h",
  "since": 1700000000,
  "variables": {
    "battery.charge": [[1700000000, 100], [1700000060, 99], ...],
    "ups.load": [[1700000000, 35], [1700000060, 38], ...],
    "battery.runtime": [[1700000000, 1800], [1700000060, 1750], ...]
  }
}
```

### `GET /api/history/myups/variables`

Response:
```json
{
  "variables": ["battery.charge", "battery.runtime", "input.voltage", "ups.load"]
}
```

## Time Range Mapping

| Range | `since` calculation | Expected data points |
|-------|-------------------|---------------------|
| `1h` | `now - 3600` | ~60 |
| `24h` | `now - 86400` | ~1,440 |
| `7d` | `now - 604800` | ~10,080 |
| `30d` | `now - 2592000` | ~43,200 |

Consider downsampling for 7d and 30d ranges (e.g. aggregate to 5-min or 1-hour averages) to keep responses fast and charts readable. Implementation option: for ranges > 24h, bucket by hour and use `AVG(value)`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NUTWATCH_HISTORY_INTERVAL` | `60` | Polling interval in seconds |
| `NUTWATCH_HISTORY_RETENTION_DAYS` | `90` | Delete snapshots older than this |
| `NUTWATCH_HISTORY_DB` | `/var/lib/nutwatch/history.db` | SQLite database path |

## Testing

### Backend tests (`tests/test_services_history.py`)

- **`test_record_and_query`** — Record 3 snapshots with different timestamps, query with time range, verify data shape and values.
- **`test_empty_history`** — Query a UPS with no data, expect empty response.
- **`test_variable_filter`** — Record multiple variables, query a subset, verify only those are returned.
- **`test_prune`** — Record old data, call prune, verify it's gone.
- **`test_non_numeric_skipped`** — Record snapshots with string values (like `ups.status: OL`), verify they are not stored.
- **`test_concurrent_read_write`** — Verify WAL mode handles concurrent access without errors.

Use `tmp_path` fixture + monkeypatch `HISTORY_DB` for all tests.

### Route tests (append to `test_routes.py`)

- **`test_history_route`** — Monkeypatch `get_history`, verify JSON response shape.
- **`test_history_route_invalid_name`** — Bad UPS name returns 400.
- **`test_history_variables_route`** — Verify variable list endpoint.

### Frontend tests

- **`HistoryChart.test.jsx`** — Mock API responses, verify chart SVG renders with correct number of lines, verify range buttons change state.

## Implementation Order

1. `services/history.py` — DB setup, CRUD, pruning
2. `tests/test_services_history.py` — Backend tests
3. `routes/history.py` — API endpoints
4. Append route tests to `test_routes.py`
5. `app.py` — Register blueprint + start collector thread
6. `routes/__init__.py` — Export blueprint
7. `constants/index.js` — Add API path helpers
8. `components/HistoryChart.jsx` — d3 chart component
9. `components/UpsDetail.jsx` — Integrate chart section
10. `utils/format.js` — Add date formatting if needed
11. Run full test suite and verify

## Potential Pitfalls

- **Multiple Flask workers** — The background thread would run in each worker process, causing duplicate writes. Mitigation: NutWatch typically runs as a single-worker service (`nutwatch.service`). Document this assumption.
- **Large datasets** — 30d of data at 60s intervals = ~43K points per variable. The API should downsample for long ranges (average over 5-min buckets for 7d+, 1-hour buckets for 30d).
- **DB file permissions** — Must be writable by the user running NutWatch (`nut` user or root). `os.makedirs` + `sqlite3.connect` will create it with default permissions. Consider a startup `chmod`/`chown` step.
- **First-run empty state** — No data until the first poll cycle completes (up to 60s). Show a clear empty state message: "No historical data yet — snapshots are taken every 60 seconds." Don't hide the chart area; show the message inside the chart container so the layout remains stable.
- **Thread safety with SQLite** — SQLite with WAL mode supports concurrent reads + single writer. The background thread is the only writer. Flask request threads are readers. This is safe.

## Not Doing (out of scope)

- Real-time streaming updates to charts (re-fetch on interval instead)
- Export to CSV/JSON
- Alert thresholds on historical trends
- Anomaly detection
- Comparing multiple UPSes on the same chart