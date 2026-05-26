---
name: proxmox-helper-scripts
description: Use this skill when creating, modifying, or reviewing scripts for the community-scripts/ProxmoxVE project. Triggers on: Proxmox LXC container creation scripts; VM creation scripts using qm/QEMU; install scripts using build.func/core.func/install.func; cloud-init VM configuration using cloud-init.func/setup_cloud_init; whiptail dialogs in Proxmox style; msg_info/msg_ok/msg_error patterns; _version.txt update tracking; qcow2/cloud image download and import; or anything related to the ct/, install/, or vm/ folder conventions of the community-scripts ecosystem.
license: MIT
---

# Proxmox VE Helper-Scripts (Community Edition) Skill

This skill encodes the conventions, helper functions, and contribution
guidelines of the [community-scripts/ProxmoxVE](https://github.com/community-scripts/ProxmoxVE)
project so an AI agent can produce scripts that match the project's
style on the first try.

## When to use this skill

Activate this skill whenever the user asks to:

- Create a new helper script for installing an app in a Proxmox LXC
- Modify or fix an existing `ct/AppName.sh` or `install/AppName-install.sh`
- Review a script for compliance with project conventions before a PR
- Reproduce the visual style (spinner, ✔️/✖️, colors) in a custom script
- Implement update detection using the `/opt/${APP}_version.txt` pattern
- Build whiptail dialogs in the same style as the project

## Critical rules (MUST follow)

1. **New scripts go to the `ProxmoxVED` repo, not `ProxmoxVE`.** The main
   repo only accepts bug fixes and improvements to existing scripts.
2. **Always source `build.func`** at the top of `ct/` scripts and
   `install.func` (via `FUNCTIONS_FILE_PATH`) in `install/` scripts.
   Never reimplement helpers — reuse them.
3. **Never hardcode version numbers** in install URLs. Fetch the latest
   release from the upstream GitHub API.
4. **Use `msg_info` / `msg_ok` / `msg_error`** for every visible step.
   Plain `echo` is only acceptable for the final post-install message.
5. **Use `$STD`** to silence verbose commands (e.g. `$STD apt install -y …`).
   This respects the user's `VERBOSE` setting.
6. **Shebang must be `#!/usr/bin/env bash`** (not `/bin/bash`).
7. **Use `[[ ]]`** for conditionals, never `[ ]`. Always quote variables.
8. **One PR per fix or feature.** Update the matching JSON metadata file
   when behavior changes.
9. **tools.func functions must NOT be wrapped in msg_info/msg_ok blocks.**
   Functions like `fetch_and_deploy_gh_release`, `setup_nodejs`, etc.
   already have their own built-in messages.
10. **Do NOT use Docker** for installation scripts. All applications are
    installed bare-metal directly on the system.

### VM-specific rules

11. **VM scripts live in `vm/`, not `ct/`.** A single file — there is no
    `install/` counterpart.
12. **Source `cloud-init.func` alongside `build.func`** for all VM scripts
    that need cloud-init configuration. Never source `install.func` in a
    VM script.
13. **Use `qm`, not `pct`.** All VM lifecycle commands (`qm create`,
    `qm importdisk`, `qm set`, `qm start`) must use the QEMU manager.
14. **Do not implement `update_script()`** unless the VM genuinely exposes
    an in-place upgrade path. VMs manage their own OS updates internally.
    Never write `/opt/${APP}_version.txt` from a VM script.

## Helper function reference

Never reimplement what `tools.func` already provides. Search for an
existing helper before writing custom logic.

### Release management

| Function | Description | Example |
|----------|-------------|---------|
| `fetch_and_deploy_gh_release` | Fetches and installs a GitHub release | `fetch_and_deploy_gh_release "app" "owner/repo" "tarball"` |
| `check_for_gh_release` | Checks if a newer version exists | `if check_for_gh_release "app" "owner/repo"; then` |
| `get_latest_github_release` | Returns latest release version string | `VERSION=$(get_latest_github_release "owner/repo")` |

**Modes for `fetch_and_deploy_gh_release`:**

```
# Tarball/Source (standard) — always specify "tarball" explicitly
fetch_and_deploy_gh_release "appname" "owner/repo" "tarball"

# Binary (.deb)
fetch_and_deploy_gh_release "appname" "owner/repo" "binary"

# Prebuilt archive
fetch_and_deploy_gh_release "appname" "owner/repo" "prebuild" "latest" "/opt/appname" "filename.tar.gz"

# Single binary
fetch_and_deploy_gh_release "appname" "owner/repo" "singlefile" "latest" "/opt/appname" "binary-linux-amd64"
```

**Clean install flag:**
```
CLEAN_INSTALL=1 fetch_and_deploy_gh_release "appname" "owner/repo" "tarball"
```

After `fetch_and_deploy_gh_release`, the deployed version is stored in
`~/.appname`. Read it with `cat ~/.appname` when you need the version
later (e.g. for build-time environment variables).

### Runtime/language setup

| Function | Variable(s) | Example |
|----------|-------------|---------|
| `setup_nodejs` | `NODE_VERSION`, `NODE_MODULE` | `NODE_VERSION="22" setup_nodejs` |
| `setup_uv` | `UV_PYTHON` | `UV_PYTHON="3.12" setup_uv` |
| `setup_go` | `GO_VERSION` | `GO_VERSION="1.22" setup_go` |
| `setup_rust` | `RUST_VERSION`, `RUST_CRATES` | `RUST_CRATES="monolith" setup_rust` |
| `setup_ruby` | `RUBY_VERSION` | `RUBY_VERSION="3.3" setup_ruby` |
| `setup_java` | `JAVA_VERSION` | `JAVA_VERSION="21" setup_java` |
| `setup_php` | `PHP_VERSION`, `PHP_MODULES` | `PHP_VERSION="8.3" PHP_MODULES="redis,gd" setup_php` |

### Database setup

| Function | Variable(s) | Example |
|----------|-------------|---------|
| `setup_postgresql` | `PG_VERSION`, `PG_MODULES` | `PG_VERSION="16" setup_postgresql` |
| `setup_postgresql_db` | `PG_DB_NAME`, `PG_DB_USER` | `PG_DB_NAME="mydb" PG_DB_USER="myuser" setup_postgresql_db` |
| `setup_mariadb_db` | `MARIADB_DB_NAME`, `MARIADB_DB_USER` | `MARIADB_DB_NAME="mydb" setup_mariadb_db` |
| `setup_mysql` | `MYSQL_VERSION` | `setup_mysql` |
| `setup_mongodb` | `MONGO_VERSION` | `setup_mongodb` |
| `setup_clickhouse` | — | `setup_clickhouse` |

### Tools & utilities

| Function | Description |
|----------|-------------|
| `setup_adminer` | Installs Adminer for DB management |
| `setup_composer` | Install PHP Composer |
| `setup_ffmpeg` | Install FFmpeg |
| `setup_imagemagick` | Install ImageMagick |
| `setup_gs` | Install Ghostscript |
| `setup_hwaccel` | Configure hardware acceleration |

### Helper utilities

| Function / Variable | Description | Example |
|---------------------|-------------|---------|
| `$LOCAL_IP` | Always available — container's IP address | `echo "Access: http://${LOCAL_IP}:3000"` |
| `ensure_dependencies` | Checks/installs dependencies | `ensure_dependencies curl jq` |
| `install_packages_with_retry` | APT install with retry | `install_packages_with_retry nginx redis` |

## Workflow when creating a new script

### Container script (LXC)

1. **Start from the CT template** (see "CT Script template" below).
2. **Fill in the metadata block** (`APP`, `var_tags`, `var_cpu`, `var_ram`,
   `var_disk`, `var_os`, `var_version`, `var_unprivileged`).
3. **Implement `update_script()`** (see "Update script pattern" below).
4. **Replace the import URL.** Templates point to the user's fork during
   development. Before opening a PR, change the URL back to
   `community-scripts/ProxmoxVE`.
5. **Validate:**
   - `bash -n script.sh` (syntax check)
   - `shellcheck script.sh` (lint — install via `apt install shellcheck`)
   - Run on a real Proxmox host (no full simulation possible).

### VM script (QEMU/KVM)

1. **Decide which category applies:**
   - Pre-built image (HAOS, OPNsense): download a `.qcow2`/`.img` and
     import as-is. Disable cloud-init (`setup_cloud_init ... "no"`).
   - Cloud image (Debian, Ubuntu, generic): download a cloud image and
     use cloud-init for first-boot configuration.
2. **Start from the VM template** (see "VM Script template" below).
   Fill in `APP`, `var_*`, `NSAPP`, the image URL, and cloud-init mode.
3. **Choose BIOS/machine type:** OVMF + q35 for anything requiring UEFI
   (HAOS, Windows); SeaBIOS + i440fx for generic Linux. If using OVMF,
   remember to allocate the EFI disk.
4. **Do not add `update_script()`** unless the VM exposes a real upgrade
   path. VMs update themselves through their OS package manager.
5. **Validate:** `bash -n vm/AppName-vm.sh` + `shellcheck`, then test on
   a real Proxmox host.

## Script templates

### CT Script template (`ct/AppName.sh`)

```bash
#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVED/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: AuthorName (GitHubUsername)
# License: MIT | https://github.com/community-scripts/ProxmoxVED/raw/main/LICENSE
# Source: https://application-url.com

APP="AppName"
var_tags="${var_tags:-tag1;tag2;tag3}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-2048}"
var_disk="${var_disk:-8}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/appname ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  if check_for_gh_release "appname" "owner/repo"; then
    msg_info "Stopping Service"
    systemctl stop appname
    msg_ok "Stopped Service"

    msg_info "Backing up Data"
    cp -r /opt/appname/data /opt/appname_data_backup
    msg_ok "Backed up Data"

    CLEAN_INSTALL=1 fetch_and_deploy_gh_release "appname" "owner/repo" "tarball"

    # Build steps...

    msg_info "Restoring Data"
    cp -r /opt/appname_data_backup/. /opt/appname/data
    rm -rf /opt/appname_data_backup
    msg_ok "Restored Data"

    msg_info "Starting Service"
    systemctl start appname
    msg_ok "Started Service"
    msg_ok "Updated successfully!"
  fi
  exit
}

start
build_container
description

msg_ok "Completed Successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:PORT${CL}"
```

### Install Script template (`install/AppName-install.sh`)

```bash
#!/usr/bin/env bash

# Copyright (c) 2021-2026 community-scripts ORG
# Author: AuthorName (GitHubUsername)
# License: MIT | https://github.com/community-scripts/ProxmoxVED/raw/main/LICENSE
# Source: https://application-url.com

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt install -y \
  dependency1 \
  dependency2
msg_ok "Installed Dependencies"

# Runtime Setup (ALWAYS use our functions!)
NODE_VERSION="22" setup_nodejs
# or PG_VERSION="16" setup_postgresql, setup_uv, etc.

fetch_and_deploy_gh_release "appname" "owner/repo" "tarball"

msg_info "Setting up Application"
cd /opt/appname
# Build/setup steps...
msg_ok "Set up Application"

msg_info "Creating Service"
cat <<EOF >/etc/systemd/system/appname.service
[Unit]
Description=AppName Service
After=network.target
[Service]
Type=simple
User=root
WorkingDirectory=/opt/appname
ExecStart=/path/to/executable
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
systemctl enable -q --now appname
msg_ok "Created Service"

motd_ssh
customize
cleanup_lxc
```

### Update script pattern

```bash
function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/appname ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  if check_for_gh_release "appname" "owner/repo"; then
    msg_info "Stopping Service"
    systemctl stop appname
    msg_ok "Stopped Service"

    # Backup data (if applicable)
    msg_info "Backing up Data"
    cp -r /opt/appname/data /opt/appname_data_backup
    msg_ok "Backed up Data"

    CLEAN_INSTALL=1 fetch_and_deploy_gh_release "appname" "owner/repo" "tarball"

    # Rebuild if needed
    cd /opt/appname
    $STD npm install
    $STD npm run build

    # Restore data
    msg_info "Restoring Data"
    cp -r /opt/appname_data_backup/. /opt/appname/data
    rm -rf /opt/appname_data_backup
    msg_ok "Restored Data"

    msg_info "Starting Service"
    systemctl start appname
    msg_ok "Started Service"
    msg_ok "Updated successfully!"
  fi
  exit  # IMPORTANT: Always end with exit!
}
```

### Systemd service pattern

```bash
msg_info "Creating Service"
cat <<EOF >/etc/systemd/system/appname.service
[Unit]
Description=AppName Service
After=network.target
[Service]
Type=simple
User=root
WorkingDirectory=/opt/appname
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/appname/server.js
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
systemctl enable -q --now appname
msg_ok "Created Service"
```

## JSON metadata files

Every application requires a JSON metadata file. For the ProxmoxVE
project, these live in `frontend/public/json/<appname>.json`. For
ProxmoxVED, they live in `json/<appname>.json`.

### Schema

```json
{
  "name": "AppName",
  "slug": "appname",
  "categories": [1],
  "date_created": "2026-01-16",
  "type": "ct",
  "updateable": true,
  "privileged": false,
  "interface_port": 3000,
  "documentation": "https://docs.appname.com/",
  "website": "https://appname.com/",
  "logo": "https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/appname.webp",
  "description": "Short description of the application and its purpose.",
  "install_methods": [
    {
      "type": "default",
      "script": "ct/appname.sh",
      "config_path": "/opt/appname/.env",
      "resources": {
        "cpu": 2,
        "ram": 2048,
        "hdd": 8,
        "os": "Debian",
        "version": "13"
      }
    }
  ],
  "default_credentials": {
    "username": null,
    "password": null
  },
  "notes": []
}
```

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name of the application |
| `slug` | string | Lowercase, no spaces, used for filenames |
| `categories` | array | Category ID(s) — see list below |
| `date_created` | string | Creation date (YYYY-MM-DD) |
| `type` | string | `ct` for container, `vm` for virtual machine |
| `updateable` | boolean | Whether `update_script()` is implemented |
| `privileged` | boolean | Whether container needs privileged mode |
| `interface_port` | number | Primary web interface port (or `null`) |
| `documentation` | string | Link to official docs |
| `website` | string | Link to official website |
| `logo` | string | URL to application logo (preferably selfhst icons) |
| `description` | string | Brief description of the application |
| `install_methods` | array | Installation configurations |
| `default_credentials` | object | Default username/password (or `null`) |
| `notes` | array | Additional notes/warnings |

### Categories

| ID | Category |
|----|----------|
| 0 | Miscellaneous |
| 1 | Proxmox & Virtualization |
| 2 | Operating Systems |
| 3 | Containers & Docker |
| 4 | Network & Firewall |
| 5 | Adblock & DNS |
| 6 | Authentication & Security |
| 7 | Backup & Recovery |
| 8 | Databases |
| 9 | Monitoring & Analytics |
| 10 | Dashboards & Frontends |
| 11 | Files & Downloads |
| 12 | Documents & Notes |
| 13 | Media & Streaming |
| 14 | \*Arr Suite |
| 15 | NVR & Cameras |
| 16 | IoT & Smart Home |
| 17 | ZigBee, Z-Wave & Matter |
| 18 | MQTT & Messaging |
| 19 | Automation & Scheduling |
| 20 | AI / Coding & Dev-Tools |
| 21 | Webservers & Proxies |
| 22 | Bots & ChatOps |
| 23 | Finance & Budgeting |
| 24 | Gaming & Leisure |
| 25 | Business & ERP |

### Notes format

```json
"notes": [
    {
        "text": "Change the default password after first login!",
        "type": "warning"
    },
    {
        "text": "Requires at least 4GB RAM for optimal performance.",
        "type": "info"
    }
]
```

Valid note types: `info`, `warning`, `error`.

## Anti-patterns to flag

When reviewing existing code, flag these as requiring a fix:

### General

- ❌ Hardcoded versions (`wget https://.../app-1.2.3.tar.gz`)
- ❌ Custom download logic instead of `fetch_and_deploy_gh_release`
- ❌ Custom version-check logic instead of `check_for_gh_release`
- ❌ Docker-based installation (must be bare-metal)
- ❌ Custom runtime installation instead of `setup_nodejs`/`setup_postgresql`/etc.
- ❌ Wrapping `tools.func` functions in `msg_info`/`msg_ok` blocks
- ❌ Pointless variables (only create variables used multiple times or for config)
- ❌ Plain `echo` for status (should be `msg_info` / `msg_ok`)
- ❌ Custom ANSI color codes instead of `${YW}`, `${GN}`, etc.
- ❌ `apt-get` instead of `apt` (consistent with `tools.func`)
- ❌ Missing `$STD` before `apt`/`npm`/build commands
- ❌ `[ "$x" = "y" ]` instead of `[[ "$x" == "y" ]]`
- ❌ Unquoted `$VARIABLES`
- ❌ `set -e` without `catch_errors`
- ❌ Custom spinner reimplementation
- ❌ Not calling `header_info`, `variables`, `color`, `catch_errors` at start
- ❌ Calling `start` / `build_container` / `description` out of order
- ❌ Using `export` in `.env` files (simple `KEY=VALUE` format only)
- ❌ Creating unnecessary system users (LXC containers run as root)
- ❌ Using `sudo` in LXC containers (already root)
- ❌ Writing files with `echo`/`printf` instead of heredocs
- ❌ Unnecessary `systemctl daemon-reload` for new service files
- ❌ Creating custom credentials files instead of using `.env` or final message
- ❌ Using external shell scripts — run commands directly
- ❌ Backing up to `/tmp` in update scripts (use `/opt` instead)
- ❌ Using `(Patience)` in `msg_info` by default (only if build truly takes 10+ min)
- ❌ Listing core/pre-installed packages as dependencies: `curl`, `sudo`, `wget`, `jq`, `mc`, `gnupg`, `ca-certificates`, `apt-transport-https`
- ❌ Manual database creation — use `setup_postgresql_db` / `setup_mariadb_db`
- ❌ Wrong footer — use `cleanup_lxc` function, not manual `apt autoremove`

### VM-specific anti-patterns

- ❌ Using `pct` in a VM script (must be `qm`)
- ❌ Sourcing `install.func` in a VM script (use `cloud-init.func` instead)
- ❌ Implementing `update_script()` in a VM script when the VM manages its own updates
- ❌ Writing `/opt/${APP}_version.txt` from a VM script
- ❌ Using OVMF (`-bios ovmf`) without allocating an EFI disk (`pvesm alloc … 4M` + `-efidisk0`)
- ❌ Hardcoding image URLs without verifying a checksum
- ❌ Leaving the downloaded image file on disk after `qm importdisk` completes
- ❌ Omitting `-agent 1` from `qm create` (breaks IP detection in the Proxmox UI)
- ❌ Not detecting architecture when the image ships separate amd64/arm64 assets

## Pre-PR checklist

Before submitting a PR, verify:

- [ ] No Docker installation used
- [ ] `fetch_and_deploy_gh_release` used for GitHub releases (with explicit mode like `"tarball"`)
- [ ] `check_for_gh_release` used for update checks
- [ ] `setup_*` functions used for runtimes (nodejs, postgresql, etc.)
- [ ] `tools.func` functions NOT wrapped in `msg_info`/`msg_ok` blocks
- [ ] No redundant variables
- [ ] No hardcoded versions for external tools
- [ ] `$STD` before all `apt`/`npm`/build commands
- [ ] `apt` used (NOT `apt-get`)
- [ ] No core packages listed as dependencies (`curl`, `sudo`, `wget`, `jq`, `mc`)
- [ ] `msg_info`/`msg_ok`/`msg_error` for logging (only for custom code)
- [ ] Correct script structure followed
- [ ] Update function present and functional
- [ ] Data backup implemented in update function (backups go to `/opt`, NOT `/tmp`)
- [ ] `motd_ssh`, `customize`, `cleanup_lxc` at end of install script
- [ ] No custom download/version-check logic
- [ ] No default `(Patience)` text in `msg_info` labels
- [ ] JSON metadata file created

## Style preferences

- Function names use `verb_noun` snake_case: `setup_database`, `install_dependencies`
- Multi-line commands use trailing `\` for readability
- Tags in `var_tags` are semicolon-separated, max 3-4, no spaces
- Keep `var_cpu`, `var_ram`, `var_disk` realistic minimums for the app
- Always use heredocs for writing files (never `echo`/`printf`/`tee`)
- `.env` files use `KEY=VALUE` format — never `export KEY=VALUE`

## Sources

- Main repo: <https://github.com/community-scripts/ProxmoxVE>
- Dev repo (new scripts): <https://github.com/community-scripts/ProxmoxVED>
- AGENTS.md reference: <https://github.com/community-scripts/ProxmoxVED/blob/main/AGENTS.md>
- Wiki: <https://github.com/community-scripts/ProxmoxVE/wiki>
- Detailed CT guide: <https://community-scripts.org/docs/ct/detailed_guide>
