#!/bin/bash
# Wall notification hook: broadcast a message to all logged-in users.
# Usage: save as /etc/nut/notify.d/<UPSNAME>_ONBATT.sh
# When the UPS goes on battery, every terminal session sees the message.

echo "[$UPSNAME] POWER OUTAGE: running on battery at $(date)" | wall
logger -p daemon.warning "UPS $UPSNAME on battery"
