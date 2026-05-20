# Proxmox NUT VM Setup Script

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A bash script to automatically create an Ubuntu 24.04 VM on Proxmox VE, configure USB passthrough for your UPS, and set up NUT (Network UPS Tools) in netserver mode.

> **Why a VM instead of LXC?** NUT cannot run reliably in LXC containers due to kernel driver detachment restrictions. This script creates a lightweight VM specifically for NUT.

## Features

- 🖥️ **Automated VM Creation** - Creates Ubuntu 24.04 VM with optimized settings
- 🔌 **USB UPS Detection** - Auto-detects and configures USB passthrough for supported UPS devices
- ⚡ **NUT Server Setup** - Installs and configures NUT in netserver mode
- 🔒 **Secure by Default** - Uses offline disk modification, sets proper NUT permissions
- 🎯 **Interactive Configuration** - Guided prompts for all settings with sensible defaults
- 📊 **Status Summary** - Provides test commands and client configuration snippets
- 🛡️ **Error Handling** - Validates inputs, handles edge cases (duplicate UPS models, slow DHCP, etc.)
- 🔑 **Auto-Generated Passwords** - Optionally generate secure passwords automatically
- 🌐 **Web Admin UI** - Installs `nut-admin` (Flask app on port 8081) for managing NUT configs via browser

## Supported UPS Vendors

| Vendor | USB ID | Driver |
|--------|--------|--------|
| APC | `051d` | usbhid-ups |
| CyberPower | `0764` | usbhid-ups |
| Eaton | `0463` | usbhid-ups |
| Tripp Lite | `09ae` | usbhid-ups |
| Liebert | `10af` | usbhid-ups |

Other USB UPS devices can be configured manually.

## Prerequisites

- Proxmox VE 7.x or 8.x
- Root access on Proxmox host
- Internet connectivity (downloads Ubuntu cloud image)
- `wget`, `curl`, `lsusb` installed (usually present by default)
- A USB UPS connected to the Proxmox host (optional; can be configured manually or skipped)

## Installation

### Quick Install (One-Liner)

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/JuanCF/proxmox-nut-server/main/vm/nut-vm.sh)"
```

### Manual Download

```bash
# Download the script
curl -fsSL https://raw.githubusercontent.com/JuanCF/proxmox-nut-server/main/vm/nut-vm.sh -o nut-vm.sh

# Or clone the repository
git clone https://github.com/JuanCF/proxmox-nut-server.git
cd proxmox-nut-server

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

### CLI Options

| Flag | Short | Description |
|------|-------|-------------|
| `--help` | `-h` | Show help message and exit |
| `--version` | | Print version (`nut-vm.sh v1.0.0`) and exit |
| `--debug` | `-d` | Enable `set -x` tracing and show all command output (equivalent to `VERBOSE=yes`) |

### Environment Variables

#### vm/nut-vm.sh

| Variable | Default | Description |
|----------|---------|-------------|
| `VERBOSE` | _(unset)_ | Set to `yes` to show full command output. Same as `--debug` but without `set -x` trace. |
| `NUT_ADMIN_URL_PREFIX` | _(unset)_ | When set, overrides the default GitHub Releases URL for the nut-admin tarball. Useful for pointing at a local build or mirror. |

By default, most commands (`qm`, `ssh`, etc.) are silenced. Set `VERBOSE=yes` or pass `--debug` to reveal output.

```bash
bash vm/nut-vm.sh --help            # Show help
bash vm/nut-vm.sh --version         # Print version
bash vm/nut-vm.sh --debug           # Trace + verbose output
VERBOSE=yes bash vm/nut-vm.sh       # Verbose output only (no trace)
NUT_ADMIN_URL_PREFIX=https://example.com/my-fork bash vm/nut-vm.sh
```

#### src/nut-admin/app.py

| Variable | Default | Description |
|----------|---------|-------------|
| `NUT_ADMIN_API_KEY` | _(empty)_ | Bearer token for API auth. If empty, auth is disabled (all requests allowed). |
| `NUT_ADMIN_HOST` | `0.0.0.0` | Listen address for the web server. |
| `NUT_ADMIN_PORT` | `8081` | Listen port for the web server. |

#### src/nut-admin/install.sh

| Variable | Default | Description |
|----------|---------|-------------|
| `NUT_ADMIN_REF` | `v1.0.0` | Git tag used to construct the release download URL. |
| `NUT_ADMIN_URL_PREFIX` | _(unset)_ | Base URL for downloading the nut-admin tarball. When set, overrides the GitHub releases URL. Useful for testing local builds. |

## Deployment & Releases

The nut-admin web UI is deployed inside the VM as a pre-built tarball.

### How it works

1. `vm/nut-vm.sh` downloads the Ubuntu cloud image and modifies it offline with `virt-customize`.
2. During offline modification, NUT configs are written directly to the disk image and the nut-admin tarball is downloaded, unpacked to `/opt/nut-admin/`, and its systemd service is enabled.
3. The customized disk is imported into a new Proxmox VM. On first boot, a `nut-detect` oneshot service scans the USB UPS and auto-configures the correct driver.

### Creating a release

Push a version tag to trigger the automated release workflow:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The GitHub Actions workflow (`.github/workflows/release.yml`) will:
1. Run lint checks (`shellcheck`, `shfmt`, Python syntax, pytest)
2. Build `nut-admin.tar.gz` via `make build-tarball`
3. Create a GitHub Release with the tarball as an asset

To change which version `install.sh` downloads, update `NUT_ADMIN_REF` in `src/nut-admin/install.sh`.

### Testing a local build

Run `make build-tarball` to generate `nut-admin.tar.gz` from local source files. Serve it over HTTP and point the install script at it:

```bash
# Build the tarball
make build-tarball

# Serve it (e.g., with Python)
python3 -m http.server 8080 --directory .

# Run the VM setup pointing at your local server
NUT_ADMIN_URL_PREFIX="http://<your-ip>:8080" bash vm/nut-vm.sh
```

The tarball is git-ignored (`.gitignore` contains `nut-admin.tar.gz`).

### Interactive Prompts

The script will guide you through:

1. **VM Configuration**
   - VM ID (auto-detects next available)
   - Hostname (default: `nut-server`)
   - Storage pool selection
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

- The cloud-init vendor snippet automatically installs and enables QEMU Guest Agent on first boot; verify it is running: `systemctl status qemu-guest-agent`
- Check DHCP server is functioning
- Manually enter IP when prompted

### Permission Denied on NUT Files

The script automatically sets `chmod 640` and `chown root:nut` on all NUT config files. If you manually edit configs, ensure these permissions are maintained.

## Security Notes

- NUT passwords should be strong and unique
- The netserver listens on all interfaces by default (`0.0.0.0`)
- Consider firewall rules to restrict NUT port (3493) access
- Cloud-init vendor snippet is written to `/var/lib/vz/snippets/` (mode 600) — remove after first boot if desired

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
│   ├── Detects UPS      │   │   ├── upsmon
│   └── Configures       │   └── nut-admin (port 8081)
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

- Open an [issue](https://github.com/JuanCF/proxmox-nut-server/issues)
- Proxmox Forums: https://forum.proxmox.com/
- NUT Users Mailing List: https://alioth-lists.debian.net/lists/lists.alioth.debian.net

---

**Disclaimer**: This script modifies your Proxmox configuration. Always review scripts before running them as root. Test in a non-production environment first.
