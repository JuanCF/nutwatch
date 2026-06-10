export const SECTIONS = {
  DASHBOARD: 'dashboard',
  UPS: 'ups',
  UPS_DETAIL: 'ups-detail',
  USERS: 'users',
  NOTIFICATIONS: 'notifications',
  LOGS: 'logs',
  CONFIG: 'config',
  HOOKS: 'hooks',
  WOL: 'wol',
};

export const SECTION_TITLES = {
  [SECTIONS.DASHBOARD]: 'Dashboard',
  [SECTIONS.UPS]: 'UPS Devices',
  [SECTIONS.UPS_DETAIL]: 'UPS Detail',
  [SECTIONS.USERS]: 'Users',
  [SECTIONS.NOTIFICATIONS]: 'Notifications',
  [SECTIONS.LOGS]: 'Logs',
  [SECTIONS.CONFIG]: 'Config Files',
  [SECTIONS.HOOKS]: 'Hooks',
  [SECTIONS.WOL]: 'Wake on LAN',
};

export const API = {
  UPS: '/ups',
  UPS_SCAN: '/ups/scan',
  USERS: '/users',
  UPSMON_CONFIG: '/upsmon/config',
  SERVICE_STATUS: '/service/status-detailed',
  SERVICE_RESTART_MONITOR: '/service/restart-monitor',
  SERVICE_RESTART_ALL: '/service/restart-all',
  LOGS_STREAM: '/api/logs/stream',
  LOGS_RECENT: '/logs/recent?lines=100',
  hooks: (upsname, event) =>
    event ? `/hooks/${encodeURIComponent(upsname)}/${encodeURIComponent(event)}` : `/hooks/${encodeURIComponent(upsname)}`,
  ups: (name) => `/ups/${encodeURIComponent(name)}`,
  upsDetail: (name) => `/ups/${encodeURIComponent(name)}/detail`,
  user: (name) => `/users/${encodeURIComponent(name)}`,
  configFile: (filename) => `/config/${encodeURIComponent(filename)}`,
  driver: (name, action) => `/driver/${encodeURIComponent(name)}/${action}`,
  wolTarget: (name) => `/wol/targets/${encodeURIComponent(name)}`,
  wolWake: (name) => `/wol/targets/${encodeURIComponent(name)}/wake`,
  wolMapping: (id) => `/wol/mappings/${encodeURIComponent(id)}`,
  WOL_TARGETS: '/wol/targets',
  WOL_MAPPINGS: '/wol/mappings',
  WOL_WAKE_ALL: '/wol/wake-all',
};

export const DEFAULTS = {
  DRIVER: 'usbhid-ups',
  PORT: 'auto',
  POLL_INTERVAL: '5',
};

export const ROLES = {
  MASTER: 'master',
  SLAVE: 'slave',
};

export const FLAGS = ['SYSLOG', 'WALL', 'EXEC', 'IGNORE'];

export const NOTIFICATION_EVENTS = [
  'ONLINE', 'ONBATT', 'LOWBATT', 'COMMOK', 'COMMBAD',
  'SHUTDOWN', 'REPLBATT', 'NOCOMM', 'NOPARENT',
];

export const TIMING_KEYS = [
  'POLLFREQ', 'POLLFREQALERT', 'HOSTSYNC', 'DEADTIME',
  'RBWARNTIME', 'NOCOMMWARNTIME', 'FINALDELAY',
];

export const BADGE_CLASSES = {
  ONLINE: 'online',
  ONBATT: 'onbatt',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
};

export const BADGE_KNOWN_CLASSES = [BADGE_CLASSES.ONLINE, BADGE_CLASSES.ONBATT, BADGE_CLASSES.OFFLINE];

export const CONFIG_FILENAMES = ['ups.conf', 'upsd.conf', 'upsmon.conf', 'upsd.users'];

export const READONLY_CONFIG = 'upsd.users';

export const APP_VERSION = 'v1.0.1';

export const MAX_LOG_LINES = 1000;

export const POLL_INTERVAL_MIN = 5;
