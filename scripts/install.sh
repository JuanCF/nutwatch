#!/usr/bin/env bash
set -euo pipefail

: "${NUTWATCH_REF:=v1.0.1}"
NUTWATCH_RELEASES_URL="https://github.com/JuanCF/nutwatch/releases/download/${NUTWATCH_REF}"
NUTWATCH_TARBALL_URL="${NUTWATCH_URL_PREFIX:-${NUTWATCH_RELEASES_URL}}/nutwatch.tar.gz"

echo "[NUTWATCH] Installing dependencies..."
apt-get update -qq
apt-get install -y python3-venv python3-pip curl

echo "[NUTWATCH] Creating application directory..."
mkdir -p /opt/nutwatch

echo "[NUTWATCH] Downloading tarball from ${NUTWATCH_TARBALL_URL}..."
curl -fsSL "${NUTWATCH_TARBALL_URL}" -o /tmp/nutwatch.tar.gz
tar -xzf /tmp/nutwatch.tar.gz -C /opt/nutwatch/
rm -f /tmp/nutwatch.tar.gz

echo "[NUTWATCH] Installing notifycmd sample script..."
mkdir -p /etc/nut
if [[ -f /opt/nutwatch/scripts/notifycmd.sh ]]; then
  cp /opt/nutwatch/scripts/notifycmd.sh /etc/nut/notifycmd.sh
  chmod 750 /etc/nut/notifycmd.sh
  chown root:nut /etc/nut/notifycmd.sh
fi
mkdir -p /etc/nut/notify.d /var/log/nut
chown root:nut /etc/nut/notify.d && chmod 750 /etc/nut/notify.d
chown nut:nut /var/log/nut

echo "[NUTWATCH] Setting up Python virtual environment..."
python3 -m venv /opt/nutwatch/venv
/opt/nutwatch/venv/bin/pip install --quiet -r /opt/nutwatch/requirements.txt

echo "[NUTWATCH] Enabling systemd service..."
systemctl daemon-reload
systemctl enable nutwatch

echo "[NUTWATCH] Starting service..."
systemctl restart nutwatch

if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "[NUTWATCH] Configuring firewall..."
  ufw allow 8081/tcp comment "NutWatch"
fi

VM_IP="$(hostname -I | awk '{print $1}')"
echo ""
echo "NutWatch web interface installed and running."
echo "URL: http://${VM_IP}:8081"
