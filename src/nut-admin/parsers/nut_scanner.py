def parse_nut_scanner_output(stdout: str) -> list:
    devices = []
    current = None
    for line in stdout.splitlines():
        stripped = line.strip()
        if not stripped:
            if current:
                devices.append(current)
                current = None
            continue
        if stripped.startswith("[") and stripped.endswith("]"):
            if current:
                devices.append(current)
            section_name = stripped[1:-1].strip()
            current = {"scanner_name": section_name, "directives": {}}
            continue
        if current is None:
            continue
        if "=" in stripped:
            key, val = stripped.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"')
            if key.startswith("###NOTMATCHED-YET###"):
                continue  # scanner flag for unmapped HID attributes, not valid NUT directives
            current["directives"][key] = val
    if current:
        devices.append(current)
    for d in devices:
        directives = d.pop("directives")
        d["driver"] = directives.pop("driver", "")
        d["port"] = directives.pop("port", "")
        d["desc"] = directives.pop("desc", "")
        d["vendorid"] = directives.pop("vendorid", "")
        d["productid"] = directives.pop("productid", "")
        d["extra"] = directives
    return devices