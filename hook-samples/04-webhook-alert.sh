#!/bin/bash
# Webhook / Discord / Slack alert hook.
# Replace WEBHOOK_URL with your actual incoming webhook URL.
# Usage: save as /etc/nut/notify.d/<UPSNAME>_ONBATT.sh

WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN"

curl -fsSL -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"🚨 UPS $UPSNAME is on battery! Event: $NOTIFYTYPE at $(date)\"}" \
  "$WEBHOOK_URL" \
  >>/var/log/nut/notifycmd.log 2>&1
