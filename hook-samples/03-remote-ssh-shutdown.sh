#!/bin/bash
# Remote SSH shutdown hook: turn off another machine when the UPS goes on battery.
# Pre-requisites:
#   - The nut user (or whoever runs upsmon) must have a passwordless SSH key
#     authorized on the remote host.
#   - Adjust the IP address and shutdown delay to taste.
# Usage: save as /etc/nut/notify.d/<UPSNAME>_ONBATT.sh

REMOTE="root@192.168.1.50"
DELAY="1" # minutes

# WARNING: Disabling host-key verification exposes the connection to
# man-in-the-middle attacks. For a secure setup, accept the remote host
# key once manually (ssh root@192.168.1.50) or manage known_hosts.
SAFE_UPSNAME=$(printf '%q' "$UPSNAME")
SAFE_DELAY=$(printf '%q' "$DELAY")
ssh -o ConnectTimeout=10 "$REMOTE" \
  "shutdown -h +${SAFE_DELAY} 'UPS ${SAFE_UPSNAME} on battery — shutting down in ${SAFE_DELAY} min'" \
  >>/var/log/nut/notifycmd.log 2>&1
