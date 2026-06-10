#!/bin/bash
# NUT notifycmd -- sample script.
# Environment: UPSNAME, NOTIFYTYPE (set by upsmon).
# Place per-UPS hooks in /etc/nut/notify.d/<UPSNAME>_<EVENT>.sh
# WOL auto-dispatch runs after the user hook via nutwatch-wol-dispatch.

LOGFILE="/var/log/nut/notifycmd.log"
HOOKDIR="/etc/nut/notify.d"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# UPSNAME includes @host:port (e.g. ups@localhost:3493); strip it for the hook filename.
UPSNAME_BARE="${UPSNAME%%@*}"

echo "[$TIMESTAMP] UPS=$UPSNAME EVENT=$NOTIFYTYPE" >>"$LOGFILE"

# Per-UPS per-event hook
[[ -x "$HOOKDIR/${UPSNAME_BARE}_${NOTIFYTYPE}.sh" ]] && "$HOOKDIR/${UPSNAME_BARE}_${NOTIFYTYPE}.sh" >>"$LOGFILE" 2>&1

# NutWatch WOL auto-dispatch (non-destructive, after user hook)
[[ -x "/usr/local/bin/nutwatch-wol-dispatch" ]] && "/usr/local/bin/nutwatch-wol-dispatch" "$UPSNAME_BARE" "$NOTIFYTYPE" >>"$LOGFILE" 2>&1
