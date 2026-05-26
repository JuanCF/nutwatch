# VM scripts

VM scripts live in `vm/` and create QEMU/KVM virtual machines on the Proxmox
host using the `qm` command. They are self-contained single files — there is no
corresponding `install/` counterpart.

## Architecture differences vs CT scripts

| Aspect | CT script (`ct/`) | VM script (`vm/`) |
| --- | --- | --- |
| Command set | `pct` | `qm` |
| Sourced helpers | `build.func` | `api.func` + `vm-core.func` + `cloud-init.func` |
| Second script | `install/AppName-install.sh` | none |
| Version tracking | `/opt/${APP}_version.txt` | not used |
| Update handling | `update_script()` mandatory | omit unless genuinely needed |
| First-boot config | runs install script inside LXC | cloud-init or pre-baked image |
| Unprivileged flag | `var_unprivileged` matters | irrelevant |
| API integration | optional | `post_to_api_vm` + `post_update_to_api` |
| Entry point | `main()` function | standard inline entry point |

## Naming conventions

| Pattern | Use case | Examples |
| --- | --- | --- |
| `vm/AppName-vm.sh` | Specific application | `haos-vm.sh`, `opnsense-vm.sh` |
| `vm/distro-vm.sh` | Generic base OS | `debian-vm.sh`, `ubuntu2404-vm.sh` |
| `vm/pimox-*.sh` | ARM64 (PiMox) variant | `pimox-haos-vm.sh` |

## Standard sourced helpers

All VM scripts source three helpers from `community-scripts/ProxmoxVED`:

```bash
COMMUNITY_SCRIPTS_URL="${COMMUNITY_SCRIPTS_URL:-https://git.community-scripts.org/community-scripts/ProxmoxVED/raw/branch/main}"
source /dev/stdin <<<"$(curl -fsSL "$COMMUNITY_SCRIPTS_URL/misc/api.func")"
source /dev/stdin <<<"$(curl -fsSL "$COMMUNITY_SCRIPTS_URL/misc/vm-core.func")"
source /dev/stdin <<<"$(curl -fsSL "$COMMUNITY_SCRIPTS_URL/misc/cloud-init.func")"

load_api_functions
color
formatting
icons
default_vars
set_std_mode
shell_check
```

Then call the standard entry-point helpers in order:

```bash
check_root          # from vm-core.func
pve_check           # from vm-core.func
ssh_check           # from vm-core.func
start_script        # local: default_settings or advanced_settings
post_to_api_vm      # from api.func
```

### Standard entry-point functions (local)

```bash
function default_settings() {
  VMID=$(get_valid_nextid)
  HN="app-server"
  BRG="vmbr0"
  RAM_SIZE="1024"
  CORE_COUNT="1"
  DISK_SIZE="8"
  # ... app-specific defaults ...
  START_VM="yes"
  METHOD="default"
}

function advanced_settings() {
  METHOD="advanced"
  # ... interactive prompts ...
}

function start_script() {
  whiptail ... --yesno "Use Default Settings?" ...
  local rc=$?
  if [ $rc -eq 0 ]; then
    default_settings
  elif [ $rc -eq 1 ]; then
    advanced_settings
  else
    msg_error "Cancelled by user"; exit
  fi
}
```

## Two categories of VM scripts

### A) Pre-built image (HAOS, OPNsense, …)

A ready-made disk image (`.qcow2`, `.img`) is downloaded and imported as-is.
No cloud-init, no post-install configuration. The VM boots into the fully configured OS.

- Call `setup_cloud_init ... "no"` or skip cloud-init entirely.
- Use q35 + OVMF when the vendor requires UEFI (HAOS, Windows).
- Always allocate an EFI disk when using OVMF.

### B) Cloud image (Debian, Ubuntu, Docker VM, …)

A generic cloud image is downloaded and configured on first boot via cloud-init.
The VM receives a user account, SSH keys, network settings, and optionally a static IP.

- Source `cloud-init.func` and call `setup_cloud_init` to attach and configure the drive.
- Works with both DHCP and static IP.
- Offer an interactive wizard via `configure_cloud_init_interactive`.

### C) ISO installers (installation media)

An `.iso` file is installation media, not a pre-built disk image. The VM boots from the
ISO into a live installer; the OS install process runs inside the VM and writes the final
system to an attached blank disk. Cloud-init is not available during installation —
post-install configuration must be applied by other means (e.g., a cloud-init drive
added after first boot, Ansible, or manual setup).

- Attach the ISO via `-cdrom` or `-ide2` and create a separate blank disk as the OS
  installation target.
- Use q35 + OVMF and allocate an EFI disk when the vendor requires UEFI (e.g.,
  Windows, Linux distributions with Secure Boot).
- Always allocate an EFI disk when using OVMF.
- Remove or detach the ISO after installation completes so the VM boots from the
  installed disk on subsequent starts.

## API integration

All VM scripts report status to the community-scripts API:

```bash
post_to_api_vm        # after start_script, before creation begins
post_update_to_api "done" "none"    # on successful completion
post_update_to_api "failed" "..."   # on error (in ERR trap or explicit)
```

Traps must be set early, before any creation work:

```bash
set -e
trap 'error_handler $LINENO "$BASH_COMMAND"' ERR
trap cleanup EXIT
trap 'post_update_to_api "failed" "INTERRUPTED"; exit 130' SIGINT
trap 'post_update_to_api "failed" "TERMINATED"; exit 143' SIGTERM
```

## Functions in `misc/cloud-init.func`

### `setup_cloud_init`

Attaches a cloud-init drive to an existing VM and applies user/network settings.

```bash
# Signature
setup_cloud_init VMID STORAGE HOSTNAME ENABLE [USER [NETWORK_TYPE [IP GATEWAY DNS]]]
```

**Mode A — DHCP, default user (simplest)**

```bash
setup_cloud_init "$VMID" "$STORAGE" "$HOSTNAME" "yes"
```

**Mode B — Interactive wizard, then apply**

```bash
configure_cloud_init_interactive "root"   # prompts the user; exports CLOUDINIT_* vars
setup_cloud_init "$VMID" "$STORAGE" "$HOSTNAME" \
                 "$CLOUDINIT_ENABLE" "$CLOUDINIT_USER"
```

**Mode C — Static IP, fully specified**

```bash
setup_cloud_init "$VMID" "$STORAGE" "myvm" "yes" "root" \
                 "static" "192.168.1.100/24" "192.168.1.1" \
                 "1.1.1.1 8.8.8.8"
```

**Mode D — Disabled (pre-built images)**

```bash
setup_cloud_init "$VMID" "$STORAGE" "$HOSTNAME" "no"
```

What `setup_cloud_init` does internally:

1. Creates the cloud-init drive (`ide2`, fallback to `scsi1`)
2. Configures the user account
3. Generates a random password
4. Sets network type (DHCP or static)
5. Establishes DNS servers and search domain
6. Injects SSH keys from `~/.ssh/authorized_keys`

### `configure_cloud_init_interactive`

Runs a whiptail wizard and exports configuration into variables.

```bash
configure_cloud_init_interactive "root"   # argument is the suggested default username
```

Variables exported after the call:

| Variable | Values | Meaning |
| --- | --- | --- |
| `CLOUDINIT_ENABLE` | `yes` / `no` | Whether to attach cloud-init |
| `CLOUDINIT_USER` | string | Login username |
| `CLOUDINIT_NETWORK_TYPE` | `dhcp` / `static` | IP assignment method |
| `CLOUDINIT_IP` | e.g. `192.168.1.100/24` | Only when `static` |
| `CLOUDINIT_GATEWAY` | e.g. `192.168.1.1` | Only when `static` |
| `CLOUDINIT_DNS` | e.g. `1.1.1.1 8.8.8.8` | DNS servers |

## Key `qm` commands

```bash
# Create the VM shell
qm create $VMID \
  -agent 1 \
  -bios ovmf \
  -machine q35 \
  -cores $CORE_COUNT \
  -memory $RAM_SIZE \
  -name $HN \
  -tags community-script \
  -net0 "virtio,bridge=$BRG,macaddr=$MAC$VLAN$MTU" \
  -onboot 1 \
  -ostype l26 \
  -scsihw virtio-scsi-pci

# Allocate EFI firmware partition (only with OVMF — must precede efidisk0 set)
pvesm alloc $STORAGE $VMID $DISK0 4M

# Import the downloaded image as a VM disk
qm importdisk $VMID image.qcow2 $STORAGE -format raw

# Attach disks, set boot order, enable serial console
qm set $VMID \
  -efidisk0 ${DISK0_REF},efitype=4m \
  -scsi0 "${DISK1_REF},${DISK_CACHE}${THIN}size=${DISK_SIZE}" \
  -boot order=scsi0 \
  -serial0 socket

# Enable QEMU guest agent (required for IP detection in Proxmox UI)
qm set $VMID -agent enabled=1

# Resize root disk after import (grows to the configured DISK_SIZE)
qm resize $VMID scsi0 ${DISK_SIZE}

# Start the VM
qm start $VMID
```

## BIOS and machine type

| Combination | When to use | Notes |
| --- | --- | --- |
| SeaBIOS + i440fx | Default for most Linux VMs | Legacy but widely compatible |
| OVMF (UEFI) + q35 | HAOS, Windows, Secure Boot | **Must** allocate an EFI disk |

```bash
# SeaBIOS (legacy) — no EFI disk needed
qm create $VMID ... -bios seabios ...

# OVMF (UEFI) — efidisk0 is mandatory; VM will not boot without it
qm create $VMID ... -bios ovmf -machine q35 ...
pvesm alloc $STORAGE $VMID $DISK0 4M
qm set $VMID -efidisk0 ${DISK0_REF},efitype=4m ...
```

## Image handling

### Architecture detection

```bash
# Returns "amd64" on standard x86_64 Proxmox, "arm64" on PiMox
ARCH=$(dpkg --print-architecture)

# Abort cleanly when running on an unsupported architecture
if [ "$(dpkg --print-architecture)" != "amd64" ]; then
  echo -e "\n ${INFO}${YW}This script will not work with PiMox!"
  echo -e " ${YW}Visit https://github.com/asylumexp/Proxmox for ARM64 support."
  sleep 2; exit
fi
```

For scripts that support both architectures, branch on `$ARCH` to select the
correct download URL (e.g. `amd64` vs `arm64` release asset).

### Download and checksum

```bash
# Download with progress bar
curl -fSL -o "$(basename "$URL")" "$URL"

# Verify SHA-256 checksum
echo "${EXPECTED_SHA256}  $(basename "$URL")" | sha256sum -c

# For .xz images: validate integrity, then decompress with progress
xz -t "$CACHE_FILE"
xz -dc "$CACHE_FILE" | pv -N "Extracting" > "${CACHE_FILE%.xz}"
```

### Decompression cheatsheet

| Extension | Command |
| --- | --- |
| `.qcow2.xz` | `xz -dc file.qcow2.xz > file.qcow2` |
| `.img.gz` / `.qcow2.gz` | `gunzip file.img.gz` |
| `.zip` | `unzip file.zip` |
| `.img` / `.qcow2` | no decompression needed |

Always delete the downloaded image file after `qm importdisk` completes.

### Dynamic version from GitHub API

```bash
RELEASE=$(curl -fsSL https://api.github.com/repos/USER/REPO/releases/latest \
          | grep "tag_name" \
          | awk '{print substr($2, 3, length($2)-4)}')
URL="https://github.com/USER/REPO/releases/download/${RELEASE}/image-${RELEASE}.img"
```

### Storage selection (standard radiolist)

```bash
msg_info "Validating Storage"
while read -r line; do
  TAG=$(echo "$line" | awk '{print $1}')
  TYPE=$(echo "$line" | awk '{printf "%-10s", $2}')
  FREE=$(echo "$line" | numfmt --field 4-6 --from-unit=K --to=iec --format %.2f | awk '{printf( "%9sB", $6)}')
  ITEM="  Type: $TYPE Free: $FREE "
  OFFSET=2
  if [[ $(( ${#ITEM} + OFFSET )) -gt ${MSG_MAX_LENGTH:-} ]]; then
    MSG_MAX_LENGTH=$(( ${#ITEM} + OFFSET ))
  fi
  STORAGE_MENU+=("$TAG" "$ITEM" "OFF")
done < <(pvesm status -content images | awk 'NR>1')
VALID=$(pvesm status -content images | awk 'NR>1')
if [ -z "$VALID" ]; then
  msg_error "Unable to detect a valid storage location."; exit
elif [ $(( ${#STORAGE_MENU[@]} / 3 )) -eq 1 ]; then
  STORAGE=${STORAGE_MENU[0]}
else
  while [ -z "${STORAGE:+x}" ]; do
    STORAGE=$(whiptail ... --radiolist ... "${STORAGE_MENU[@]}" 3>&1 1>&2 2>&3) \
      || { msg_error "Cancelled by user"; exit; }
  done
fi
```

### Storage-type disk naming

The disk name and import format depend on the storage backend.

```bash
STORAGE_TYPE=$(pvesm status -storage "$STORAGE" | awk 'NR>1 {print $2}')
case $STORAGE_TYPE in
  nfs | dir | cifs)
    DISK_EXT=".qcow2"; DISK_REF_PREFIX="${VMID}/"; DISK_IMPORT=(--format qcow2);;
  btrfs)
    DISK_EXT=".raw";   DISK_REF_PREFIX="${VMID}/"; DISK_IMPORT=(--format raw);;
  *)
    DISK_EXT="";       DISK_REF_PREFIX="";        DISK_IMPORT=(--format raw);;
esac
for i in {0,1}; do
  disk="DISK$i"
  eval "DISK${i}=vm-${VMID}-disk-${i}${DISK_EXT:-}"
  eval "DISK${i}_REF=${STORAGE}:${DISK_REF_PREFIX:-}${!disk}"
done
```

`DISK0` is the EFI partition (4 MiB, allocated with `pvesm alloc`).
`DISK1` is the root disk (imported from the cloud image).
