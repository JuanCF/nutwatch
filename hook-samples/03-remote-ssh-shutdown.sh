#!/bin/bash
# Remote SSH shutdown hook: turn off another machine when the UPS goes on battery.
# Pre-requisites:
#   - The nut user (or whoever runs upsmon) must have a passwordless SSH key
#     authorized on the remote host.
#   - Adjust the IP address and shutdown delay to taste.
# Usage: save as /etc/nut/notify.d/<UPSNAME>_ONBATT.sh

REMOTE="root@192.168.1.50"
DELAY="1" # minutes

ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
  "$REMOTE" "shutdown -h +$DELAY 'UPS $UPSNAME on battery — shutting down in $DELAY min'" \
  >>/var/log/nut/notifycmd.log 2>&1
