from .ups import ups_bp
from .users import users_bp
from .upsmon import upsmon_bp
from .hooks import hooks_bp
from .system import system_bp
from .logs import logs_bp

__all__ = ["ups_bp", "users_bp", "upsmon_bp", "hooks_bp", "system_bp", "logs_bp"]