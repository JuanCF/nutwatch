import sqlite3
import logging
import os
import time
import threading

logger = logging.getLogger(__name__)

HISTORY_DB = os.environ.get("NUTWATCH_HISTORY_DB", "/var/lib/nutwatch/history.db")
DEFAULT_INTERVAL = 60
try:
    DEFAULT_RETENTION_DAYS = int(os.environ.get("NUTWATCH_HISTORY_RETENTION_DAYS", "90"))
except ValueError:
    logger.warning("Invalid NUTWATCH_HISTORY_RETENTION_DAYS; falling back to 90 days")
    DEFAULT_RETENTION_DAYS = 90

_cycle_count = 0

# Schema is created once per database path. Tracking the path (rather than a
# bool) keeps this correct when HISTORY_DB is repointed, e.g. in tests.
_schema_lock = threading.Lock()
_schema_ready_for = None


def _ensure_schema(conn):
    global _schema_ready_for
    if _schema_ready_for == HISTORY_DB:
        return
    with _schema_lock:
        if _schema_ready_for == HISTORY_DB:
            return
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
        _schema_ready_for = HISTORY_DB


def get_db():
    db_dir = os.path.dirname(HISTORY_DB)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(HISTORY_DB)
    conn.row_factory = sqlite3.Row
    # Per-connection: wait up to 5s for a competing writer instead of failing
    # immediately with "database is locked".
    conn.execute("PRAGMA busy_timeout=5000")
    _ensure_schema(conn)
    return conn


def record_snapshot(ups_name: str, variables: dict) -> None:
    ts = time.time()
    rows = []
    for var, val in variables.items():
        if not isinstance(val, (int, float)):
            continue
        rows.append((ups_name, ts, var, float(val)))
    if not rows:
        return
    conn = get_db()
    try:
        conn.executemany(
            "INSERT INTO snapshots (ups_name, timestamp, variable, value) VALUES (?, ?, ?, ?)",
            rows,
        )
        conn.commit()
    finally:
        conn.close()


def get_history(ups_name: str, variables: list[str] | None = None, since: float = 0) -> dict:
    conn = get_db()
    try:
        if variables:
            placeholders = ",".join("?" for _ in variables)
            rows = conn.execute(
                f"SELECT variable, timestamp, value FROM snapshots "
                f"WHERE ups_name = ? AND variable IN ({placeholders}) AND timestamp >= ? "
                f"ORDER BY variable, timestamp",
                [ups_name] + variables + [since],
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT variable, timestamp, value FROM snapshots "
                "WHERE ups_name = ? AND timestamp >= ? "
                "ORDER BY variable, timestamp",
                [ups_name, since],
            ).fetchall()
    finally:
        conn.close()

    series: dict[str, list[list]] = {}
    for row in rows:
        var = row["variable"]
        if var not in series:
            series[var] = []
        series[var].append([row["timestamp"], row["value"]])
    return {"ups": ups_name, "variables": series}


def get_available_variables(ups_name: str) -> list[str]:
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT DISTINCT variable FROM snapshots WHERE ups_name = ? ORDER BY variable",
            [ups_name],
        ).fetchall()
        return [r["variable"] for r in rows]
    finally:
        conn.close()


def get_latest_timestamp(ups_name: str) -> float | None:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT MAX(timestamp) FROM snapshots WHERE ups_name = ?",
            [ups_name],
        ).fetchone()
        return row[0] if row and row[0] is not None else None
    finally:
        conn.close()


def prune(retention_days: int = 90) -> int:
    cutoff = time.time() - retention_days * 86400
    conn = get_db()
    try:
        cursor = conn.execute("DELETE FROM snapshots WHERE timestamp < ?", [cutoff])
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def start_collector(app, interval: int = 60):
    global _cycle_count
    try:
        with app.app_context():
            prune(DEFAULT_RETENTION_DAYS)
    except Exception:
        # e.g. the history dir isn't writable. Log and keep going so the loop
        # can retry/report rather than the thread dying with a bare traceback.
        logger.exception("History collector startup prune failed")
    while True:
        time.sleep(interval)
        try:
            with app.app_context():
                from services.ups import list_ups
                from utils import ups_variables

                ups_list = list_ups()
                for entry in ups_list:
                    name = entry["name"]
                    try:
                        vars_dict = ups_variables(name)
                        if vars_dict:
                            record_snapshot(name, vars_dict)
                    except Exception:
                        logger.exception("Failed to record snapshot for UPS '%s'", name)

                _cycle_count += 1
                if _cycle_count % 100 == 0:
                    deleted = prune(DEFAULT_RETENTION_DAYS)
                    if deleted:
                        logger.info("Pruned %d old history snapshots", deleted)
        except Exception:
            logger.exception("History collector cycle failed")