# NutWatch — NUT Web Administration Panel

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A standalone web administration panel for NUT (Network UPS Tools), installable on a Raspberry Pi or any Linux system, with Wake on LAN support and detailed UPS monitoring.

This repository also includes `vm/nut-vm.sh`, a bash script to automatically create an Ubuntu 24.04 VM on Proxmox VE with NUT pre-configured in netserver mode and the NutWatch web UI installed.

> **Why a VM instead of LXC?** NUT cannot run reliably in LXC containers due to kernel driver detachment restrictions. The VM script creates a lightweight VM specifically for NUT.

## Features

- **Web Admin UI** - NutWatch (Flask + React SPA on port 8081) for managing NUT configs, notifications, per-UPS event hooks, and service status via browser
- **Automated VM Creation** - Creates Ubuntu 24.04 VM with optimized settings on Proxmox
- **USB UPS Detection** - Auto-detects and configures USB passthrough for supported UPS devices
- **NUT Server Setup** - Installs and configures NUT in netserver mode
- **Secure by Default** - Uses offline disk modification, sets proper NUT permissions
- **Interactive Configuration** - Guided prompts for all settings with sensible defaults
- **Status Summary** - Provides test commands and client configuration snippets
- **Error Handling** - Validates inputs, handles edge cases (duplicate UPS models, slow DHCP, etc.)
- **Auto-Generated Passwords** - Optionally generate secure passwords automatically

## Supported UPS Vendors

| Vendor | USB ID | Driver |
|--------|--------|--------|
| APC | `051d` | usbhid-ups |
| CyberPower | `0764` | usbhid-ups |
| Eaton | `0463` | usbhid-ups |
| Tripp Lite | `09ae` | usbhid-ups |
| Liebert | `10af` | usbhid-ups |

Other USB UPS devices can be configured manually.

## Deployment Options

### Standalone Install (Raspberry Pi / Any Linux)

Install NutWatch directly on a machine that already has NUT configured:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/JuanCF/nutwatch/main/src/backend/install.sh)"
```

Set the `NUTWATCH_REF` env var to pin a specific release version.

### Proxmox VM (One-Liner)

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/JuanCF/nutwatch/main/vm/nut-vm.sh)"
```

### Manual Download

```bash
# Download the script
curl -fsSL https://raw.githubusercontent.com/JuanCF/nutwatch/main/vm/nut-vm.sh -o nut-vm.sh

# Or clone the repository
git clone https://github.com/JuanCF/nutwatch.git
cd nutwatch

# Run from source
bash vm/nut-vm.sh
```

## Usage

```bash
# Run on Proxmox host as root (from cloned repo)
bash vm/nut-vm.sh

# Or if downloaded directly
bash nut-vm.sh
```

### Environment Variables

#### vm/nut-vm.sh

| Variable | Default | Description |
|----------|---------|-------------|
| `VERBOSE` | _(unset)_ | Set to `yes` to show full command output (sets `$STD` to empty, revealing all command output). |
| `NUTWATCH_URL_PREFIX` | _(unset)_ | When set, overrides the default GitHub Releases URL for the nutwatch tarball. Useful for pointing at a local build or mirror. |
| `COMMUNITY_SCRIPTS_URL` | `https://git.community-scripts.org/community-scripts/ProxmoxVED/raw/branch/main` | Base URL for sourcing `api.func`, `vm-core.func`, and `cloud-init.func`. |

By default, most commands (`qm`, `wget`, etc.) are silenced via `$STD`. Set `VERBOSE=yes` to reveal output.

```bash
VERBOSE=yes bash vm/nut-vm.sh                    # Verbose output
NUTWATCH_URL_PREFIX=https://example.com/my-fork bash vm/nut-vm.sh
COMMUNITY_SCRIPTS_URL=https://my-mirror.example.com bash vm/nut-vm.sh
```

#### NutWatch Web App (src/backend/app.py)

| Variable | Default | Description |
|----------|---------|-------------|
| `NUTWATCH_API_KEY` | _(empty)_ | Bearer token for API auth. If empty, auth is disabled (all requests allowed). |
| `NUTWATCH_HOST` | `0.0.0.0` | Listen address for the web server. |
| `NUTWATCH_PORT` | `8081` | Listen port for the web server. |

#### src/backend/install.sh

| Variable | Default | Description |
|----------|---------|-------------|
| `NUTWATCH_REF` | `v1.0.0` | Git tag used to construct the release download URL. |
| `NUTWATCH_URL_PREFIX` | _(unset)_ | Base URL for downloading the nutwatch tarball. When set, overrides the GitHub releases URL. Useful for testing local builds. |

## Deployment & Releases

The NutWatch web UI is deployed inside the VM as a pre-built tarball.

### How it works

1. `vm/nut-vm.sh` downloads the Ubuntu cloud image and modifies it offline with `virt-customize`.
2. During offline modification, NUT configs are written directly to the disk image and the nutwatch tarball is downloaded, unpacked to `/opt/nutwatch/`, and its systemd service is enabled.
3. The customized disk is imported into a new Proxmox VM. On first boot, a `nut-detect` oneshot service scans the USB UPS and auto-configures the correct driver.

### Creating a release

Push a version tag to trigger the automated release workflow:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The GitHub Actions workflow (`.github/workflows/release.yml`) will:
1. Run lint checks (`shellcheck`, `shfmt`, Python syntax, pytest)
2. Build `nutwatch.tar.gz` via `make build-tarball`
3. Create a GitHub Release with the tarball as an asset

To change which version `install.sh` downloads, update `NUTWATCH_REF` in `src/backend/install.sh`.

### Testing a local build

Run `make build-tarball` to generate `nutwatch.tar.gz` from local source files. Serve it over HTTP and point the install script at it:

```bash
# Build the tarball
make build-tarball

# Serve it (e.g., with Python)
python3 -m http.server 8080 --directory .

# Run the VM setup pointing at your local server
NUTWATCH_URL_PREFIX="http://<your-ip>:8080" bash vm/nut-vm.sh
```

The tarball is git-ignored (`.gitignore` contains `nutwatch.tar.gz`).

### Interactive Prompts

The script will guide you through:

1. **VM Configuration**
   - VM ID (auto-detects next available)
   - Hostname (default: `nut-server`)
   - Storage pool selection (auto-detected from available pools)
   - Network bridge (default: `vmbr0`)
   - RAM, CPU cores, disk size
   - VM username and password

2. **UPS Detection**
   - Automatically scans for connected UPS devices
   - Presents list if multiple detected
   - Handles duplicate models using bus-port notation
   - Can be skipped if no UPS is present or connected

3. **NUT Configuration**
   - UPS name and description
   - Default driver (`usbhid-ups`; `nut-scanner` auto-detects inside the VM)
   - Admin and monitor user credentials
   - Listen address and port

## Example Output

```text
NUT VM Setup Complete!

  VM ID:      100
  VM Name:    nut-server
  VM IP:      192.168.1.50

  NUT Server: 192.168.1.50:3493
  UPS Name:   ups

  Test command:
    upsc ups@192.168.1.50

  Client upsmon.conf:
    MONITOR ups@192.168.1.50:3493 1 monuser PASS slave
```

## Verification

After the script completes, verify the setup:

```bash
# Check VM status
qm list

# Verify USB passthrough
qm config <vmid> | grep usb

# Test NUT from Proxmox host
upsc ups@<VM_IP>

# Test from another machine
upsc ups@<VM_IP>:3493

# Check NUT services inside VM (via Proxmox console)
qm terminal <vmid>
systemctl status nut-server nut-monitor

# Access NutWatch web UI
http://<VM_IP>:8081
```

## Configuring NUT Clients

Once the NUT server is running, configure other Proxmox nodes or clients:

### Proxmox Node (as NUT Client)

```bash
# Install NUT client
apt update && apt install nut-client

# Configure /etc/nut/nut.conf
MODE=netclient

# Configure /etc/nut/upsmon.conf
MONITOR ups@192.168.1.50:3493 1 monuser <password> slave

# Restart
systemctl restart nut-client
```

## Troubleshooting

### UPS Not Detected

- Ensure UPS is connected via USB
- Run `lsusb` on Proxmox host to verify it's visible
- Try manual entry of vendor:product ID

### NUT Test Fails

- Check UPS driver compatibility: https://networkupstools.org/stable-hcl.html
- Check logs via Proxmox console: `qm terminal <vmid>` then `journalctl -u nut-server`
- Verify UPS is visible in VM: `lsusb`

### VM IP Not Detected

- `virt-customize` installs and enables QEMU Guest Agent inside the disk image before the VM is created; verify it is running: `systemctl status qemu-guest-agent`
- Check DHCP server is functioning
- Manually enter IP when prompted

### Permission Denied on NUT Files

The script automatically sets `chmod 640` and `chown root:nut` on all NUT config files. If you manually edit configs, ensure these permissions are maintained.

## Security Notes

- NUT passwords should be strong and unique
- The netserver listens on all interfaces by default (`0.0.0.0`)
- Consider firewall rules to restrict NUT port (3493) access
- The VM password is set via Proxmox's built-in cloud-init (`qm set --cipassword`)

## Architecture

```
Proxmox Host
├── USB UPS Device
│   └── USB Passthrough ──┐
 │                         ▼
 ├── vm/nut-vm.sh   VM (Ubuntu 24.04 minimal)
 │   ├── Downloads        │   ├── NUT Server
 │   ├── virt-customize ─►│   │   ├── nut-driver (usbhid-ups)
 │   ├── Creates VM       │   │   ├── upsd (port 3493)
 │   ├── Detects UPS      │   │   ├── upsmon (with notifycmd hooks)
 │   └── Configures       │   └── NutWatch (port 8081)
       (offline disk          └── cloud-init (network, resize)
        modification)
```

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- [Network UPS Tools](https://networkupstools.org/) project
- Proxmox VE community
- Ubuntu Cloud Images

## Support

For issues, questions, or feature requests:

- Open an [issue](https://github.com/JuanCF/nutwatch/issues)
- Proxmox Forums: https://forum.proxmox.com/
- NUT Users Mailing List: https://alioth-lists.debian.net/lists/lists.alioth.debian.net

---

**Disclaimer**: This script modifies your Proxmox configuration. Always review scripts before running them as root. Test in a non-production environment first.
