import os
import re


NUT_DIR = "/etc/nut"
ALLOWED_CONFIGS = {"ups.conf", "upsd.conf", "upsmon.conf", "upsd.users"}
IDENTIFIER_REGEX = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{0,127}$")

NUTWATCH_API_KEY = os.environ.get("NUTWATCH_API_KEY", "")
NUTWATCH_HOST = os.environ.get("NUTWATCH_HOST", "0.0.0.0")

try:
    NUTWATCH_PORT = int(os.environ.get("NUTWATCH_PORT", "8081"))
except ValueError:
    NUTWATCH_PORT = 8081
