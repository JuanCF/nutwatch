import os
import re


NUT_DIR = "/etc/nut"
ALLOWED_CONFIGS = {"ups.conf", "upsd.conf", "upsmon.conf", "upsd.users"}
IDENTIFIER_REGEX = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{0,127}$")

NUT_ADMIN_API_KEY = os.environ.get("NUT_ADMIN_API_KEY", "")
NUT_ADMIN_HOST = os.environ.get("NUT_ADMIN_HOST", "0.0.0.0")

try:
    NUT_ADMIN_PORT = int(os.environ.get("NUT_ADMIN_PORT", "8081"))
except ValueError:
    NUT_ADMIN_PORT = 8081