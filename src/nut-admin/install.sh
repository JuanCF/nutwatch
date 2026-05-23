#!/usr/bin/env bash
set -euo pipefail

: "${NUT_ADMIN_REF:=v1.0.0}"
NUT_ADMIN_RELEASES_URL="https://github.com/JuanCF/proxmox-nut-server/releases/download/${NUT_ADMIN_REF}"
NUT_ADMIN_TARBALL_URL="${NUT_ADMIN_URL_PREFIX:-${NUT_ADMIN_RELEASES_URL}}/nut-admin.tar.gz"

echo "[NUT-ADMIN] Installing dependencies..."
apt-get update -qq
apt-get install -y python3-venv python3-pip curl

echo "[NUT-ADMIN] Creating application directory..."
mkdir -p /opt/nut-admin

echo "[NUT-ADMIN] Downloading tarball from ${NUT_ADMIN_TARBALL_URL}..."
curl -fsSL "${NUT_ADMIN_TARBALL_URL}" -o /tmp/nut-admin.tar.gz
tar -xzf /tmp/nut-admin.tar.gz -C /opt/nut-admin/
rm -f /tmp/nut-admin.tar.gz

echo "[NUT-ADMIN] Installing notifycmd sample script..."
if [[ -f /opt/nut-admin/scripts/notifycmd.sh ]]; then
  cp /opt/nut-admin/scripts/notifycmd.sh /etc/nut/notifycmd.sh
  chmod 750 /etc/nut/notifycmd.sh
  chown root:nut /etc/nut/notifycmd.sh
fi
mkdir -p /etc/nut/notify.d /var/log/nut
chown root:nut /etc/nut/notify.d && chmod 750 /etc/nut/notify.d
chown nut:nut /var/log/nut

echo "[NUT-ADMIN] Setting up Python virtual environment..."
python3 -m venv /opt/nut-admin/venv
/opt/nut-admin/venv/bin/pip install --quiet -r /opt/nut-admin/requirements.txt

echo "[NUT-ADMIN] Enabling systemd service..."
systemctl daemon-reload
systemctl enable nut-admin

echo "[NUT-ADMIN] Starting service..."
systemctl restart nut-admin

if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "[NUT-ADMIN] Configuring firewall..."
  ufw allow 8081/tcp comment "NUT Admin"
fi

VM_IP="$(hostname -I | awk '{print $1}')"
echo ""
echo "NUT Admin web interface installed and running."
echo "URL: http://${VM_IP}:8081"
