# virt-customize Analysis for nut-vm.sh

## Current approach (SSH-based)

`vm/nut-vm.sh` is unique among community-scripts VM scripts — it's the only one that
generates an SSH key, SCPs install scripts into the VM, and executes them remotely.
The community-scripts standard is either `virt-customize` (offline disk image
modification) or cloud-init (first-boot configuration), never SSH.

## What gets eliminated (~360 lines, ~28%)

| Lines | What | Why |
|-------|------|-----|
| 73–79 | `SSH_OPTS` array | No SSH needed |
| 257 | `ssh`, `scp` from deps check | No longer required |
| 448–465 | `inject_ssh_key()` | No key gen / cleanup trap |
| 467–512 | `generate_cloudinit_snippet()` | virt-customize sets password + installs qemu-guest-agent |
| 708–734 | `wait_port()` + `wait_ssh()` | No SSH wait loop |
| 795–978 | `build_nut_install_script()` | 184-line heredoc replaced by `--run-command` |
| 980–1086 | `build_nutwatch_script()` | 107-line heredoc replaced by `--run-command` |
| 1088–1120 | `_deploy_and_run()` | SCP + SSH deploy eliminated |
| 1122–1149 | `run_nut_install()` + `run_nutwatch_install()` | No remote exec needed |
| 1151–1169 | `verify_nut_post_reboot()` | No SSH post-boot check needed |
| 1292–1306 | main: wait_ssh + install + reboot + verify | Flow collapses |

## What gets added (~110 lines)

- `virt-customize` availability check + `apt install libguestfs-tools` fallback (~15 lines)
- Package install (`--install qemu-guest-agent,nut-server,nut-client,python3-pip,curl,...`) (~5 lines)
- NUT config writes via `--run-command` (nut.conf, ups.conf/fallback, upsd.conf, upsd.users, upsmon.conf) (~30 lines)
- nut-scanner oneshot systemd service for first-boot driver detection (~20 lines)
- nutwatch install (curl tarball, venv, pip, systemd service) (~20 lines)
- System bootstrap: hostname, user password via `chpasswd`, machine-id cleanup, SSH enable (~20 lines)

## Cloud-init becomes redundant

virt-customize handles everything cloud-init currently does:

| Current cloud-init task | virt-customize replacement |
|---|---|
| Install `qemu-guest-agent` | `--install qemu-guest-agent` |
| Set user password (vendor snippet) | `--run-command "echo 'user:pass' \| chpasswd"` |
| Inject SSH key | Not needed (no SSH) |
| `--ciupgrade 1` (apt upgrade) | `--update` or `--run-command "apt-get upgrade -y"` |
| `runcmd` (enable guest agent) | `--run-command "systemctl enable qemu-guest-agent"` |

Ubuntu cloud images have cloud-init baked in, but since the disk already has the
hostname, user, packages, and configs applied by virt-customize, cloud-init becomes
a no-op on first boot — nothing left for it to do.

The `setup_cloud_init` call, the vendor snippet (`generate_cloudinit_snippet`), and
the `SSH_OPTS`/`SSH_KEY` injection all go away. The only thing that stays runtime
is `get_vm_ip()` querying the guest agent — and virt-customize already installed it.

## nut-scanner: offline + first-boot hybrid

nut-scanner cannot run during virt-customize because it needs live USB devices.
The solution is a two-phase approach:

**Phase 1 — Offline (virt-customize):**
- Write a fallback `ups.conf` with `driver = usbhid-ups`
- Inject a oneshot systemd service that runs once on first boot:

```ini
[Unit]
Description=Auto-detect UPS driver on first boot
After=multi-user.target
ConditionPathExists=!/var/lib/nut/driver-detected

[Service]
Type=oneshot
ExecStart=/bin/bash -c '
  nut-scanner -U > /tmp/nut-scan.txt
  DRIVER=$(awk -F\"\\\"\" \"/driver/ {print \$2; exit}\" /tmp/nut-scan.txt)
  PORT=$(awk -F\"\\\"\" \"/port/ {print \$2; exit}\" /tmp/nut-scan.txt)
  VENDORID=$(awk -F\"\\\"\" \"/vendorid/ {print \$2; exit}\" /tmp/nut-scan.txt)
  PRODUCTID=$(awk -F\"\\\"\" \"/productid/ {print \$2; exit}\" /tmp/nut-scan.txt)
  {
    printf "[%s]\n" "$UPS_NAME"
    printf "  driver = %s\n" "${DRIVER:-usbhid-ups}"
    printf "  port = %s\n" "${PORT:-auto}"
    [[ -n "$VENDORID" ]] && printf "  vendorid = %s\n" "$VENDORID"
    [[ -n "$PRODUCTID" ]] && printf "  productid = %s\n" "$PRODUCTID"
    printf '  desc = "%s"\n' "$UPS_DESC"
    printf "  pollinterval = 2\n"
  } > /etc/nut/ups.conf
  chown root:nut /etc/nut/ups.conf
  chmod 640 /etc/nut/ups.conf
  systemctl restart nut-driver nut-server nut-monitor
  touch /var/lib/nut/driver-detected
'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

**Phase 2 — First boot:** The oneshot fires, nut-scanner finds the real UPS (USB
passthrough is now live), rewrites `ups.conf` with the correct driver/port/vendorid,
and restarts NUT. The `ConditionPathExists` guard ensures it runs only once.

## nutwatch: installed during virt-customize

nutwatch is entirely offline-safe — it downloads a tarball, extracts to
`/opt/nutwatch`, creates a venv, and enables a systemd service:

```bash
virt-customize -a "$WORK_FILE" \
  --run-command 'curl -fsSL "$TARBALL_URL" -o /tmp/nutwatch.tar.gz' \
  --run-command 'mkdir -p /opt/nutwatch && tar -xzf /tmp/nutwatch.tar.gz -C /opt/nutwatch/' \
  --run-command 'python3 -m venv /opt/nutwatch/venv' \
  --run-command '/opt/nutwatch/venv/bin/pip install -r /opt/nutwatch/requirements.txt' \
  --run-command 'cp /opt/nutwatch/nutwatch.service /etc/systemd/system/' \
  --run-command 'systemctl enable nutwatch'
```

## virt-customize execution order

1. Install packages (`--install qemu-guest-agent,nut-server,nut-client,python3-venv,python3-pip,curl`)
2. `--update` + `--run-command "apt-get upgrade -y"`
3. Write NUT configs: `nut.conf`, `upsd.conf`, `upsd.users`, `upsmon.conf`, fallback `ups.conf`
4. Create symbolic links for nut-scanner libraries
5. Write nut-detect oneshot systemd service
6. Install nutwatch (download + venv + enable service)
7. System bootstrap: `--hostname`, set user password, machine-id cleanup, enable SSH

## First-boot sequence

1. qemu-guest-agent starts (already installed + enabled)
2. nut-detect oneshot fires → scans USB → rewrites `ups.conf` → restarts NUT
3. nutwatch starts (already enabled, independent of nut-detect)

## What stays runtime (can't move offline)

- USB passthrough (`qm set --usb0`) — needs the VM to exist
- Guest-agent IP detection (`get_vm_ip`) — needs the VM to be running
- All whiptail prompts — user interaction before VM creation

## Net result

Script shrinks from 1313 to ~945 lines. All SSH/SCP code, cloud-init snippet
generation, key management, wait loops, and heredoc install scripts are eliminated.
The runtime phase is reduced to: create VM → USB passthrough → start → wait for
guest agent IP → print summary.

## Known Issues

### virt-customize loses network access on Proxmox VE 9 (Trixie)

On Proxmox VE 9 (Debian 13/Trixie), `virt-customize` fails when running commands
that require internet access inside the disk image (e.g. `--install`, `--run-command
"apt-get ..."`, `curl`). The root cause is that `dhcpcd` is no longer bundled with
`libguestfs-tools` in Debian 13.

**Why this happens:** When `virt-customize` processes a qcow2 image, it spins up
an internal temporary mini-VM using QEMU/KVM to execute commands inside the image.
That mini-VM needs to configure its network via DHCP to reach the internet. Without
a DHCP client available, network requests from within the image silently fail.

**Fix:** Install `dhcpcd-base` on the Proxmox host before running `virt-customize`:

```bash
apt install dhcpcd-base -y
```

Notes:
- `dhcpcd-base` provides only the base library — it does **not** install or enable
  a systemd service, so it will not affect the Proxmox host's network configuration.
- This is different from the full `dhcpcd` package, which runs as a service and can
  interfere with host networking by requesting DHCP leases on all interfaces.
- The community-scripts VM scripts (e.g. Docker VM) already handle this
  automatically in their prerequisites block.
- Upstream issue: https://github.com/libguestfs/libguestfs/issues/211
