import logging
import threading
import time

try:
    import psutil

    _PSUTIL_AVAILABLE = True
except ImportError:
    psutil = None
    _PSUTIL_AVAILABLE = False

logger = logging.getLogger("nutwatch")

_CPU_PERCENT: float | None = None
_SAMPLER_INTERVAL = 5.0
_SAMPLER_LOCK = threading.Lock()
_SAMPLER_STARTED = False


def _cpu_sampler(interval: float = _SAMPLER_INTERVAL) -> None:
    global _CPU_PERCENT
    if psutil is None:
        return
    try:
        _CPU_PERCENT = psutil.cpu_percent(interval=None)
    except Exception:
        pass
    while True:
        time.sleep(interval)
        try:
            _CPU_PERCENT = psutil.cpu_percent(interval=None)
        except Exception:
            _CPU_PERCENT = None


def _start_cpu_sampler() -> None:
    global _SAMPLER_STARTED
    with _SAMPLER_LOCK:
        if _SAMPLER_STARTED:
            return
        _SAMPLER_STARTED = True
        thread = threading.Thread(target=_cpu_sampler, daemon=True)
        thread.start()


def get_system_resources():
    if not _PSUTIL_AVAILABLE:
        return {
            "cpu_percent": None,
            "memory_percent": None,
            "memory_used_gb": None,
            "memory_total_gb": None,
            "disk_percent": None,
            "disk_free_gb": None,
            "disk_total_gb": None,
        }

    _start_cpu_sampler()

    try:
        mem = psutil.virtual_memory()
        mem_pct = round(mem.percent, 1)
        mem_used = round(mem.used / (1024 ** 3), 1)
        mem_total = round(mem.total / (1024 ** 3), 1)
    except Exception:
        mem_pct = mem_used = mem_total = None

    try:
        disk = psutil.disk_usage("/")
        disk_pct = round(disk.percent, 1)
        disk_free = round(disk.free / (1024 ** 3), 1)
        disk_total = round(disk.total / (1024 ** 3), 1)
    except Exception:
        disk_pct = disk_free = disk_total = None

    cpu = _CPU_PERCENT
    if cpu is None:
        try:
            cpu = psutil.cpu_percent(interval=0.5)
        except Exception:
            cpu = None

    return {
        "cpu_percent": cpu,
        "memory_percent": mem_pct,
        "memory_used_gb": mem_used,
        "memory_total_gb": mem_total,
        "disk_percent": disk_pct,
        "disk_free_gb": disk_free,
        "disk_total_gb": disk_total,
    }
