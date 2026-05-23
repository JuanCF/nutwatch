#!/bin/bash
# Test hook: write a marker file when the event fires.
# Usage: save as /etc/nut/notify.d/<UPSNAME>_ONBATT.sh
# Then pull the UPS power cable and check /tmp/ups-test.log

echo "ONBATT triggered for $UPSNAME at $(date)" >>/tmp/ups-test.log
