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
