import subprocess
import shutil
import os
import time
from typing import List, Dict, Any, Optional


def is_sane_available() -> bool:
    return shutil.which("scanimage") is not None


def list_devices() -> List[Dict[str, Any]]:
    """
    Lists all scanners detected by SANE.
    Filters webcams (v4l) to bottom or flags them.
    """
    if not is_sane_available():
        return []

    try:
        cmd = ["scanimage", "-f", "%d|%v|%m|%t%n"]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
        if res.returncode != 0:
            return []

        devices = []
        for line in res.stdout.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            parts = line.split("|")
            dev_id = parts[0]
            vendor = parts[1] if len(parts) > 1 else ""
            model = parts[2] if len(parts) > 2 else ""
            dev_type = parts[3] if len(parts) > 3 else "scanner"

            is_webcam = dev_id.startswith("v4l:")
            devices.append({
                "id": dev_id,
                "vendor": vendor,
                "model": model,
                "type": dev_type,
                "is_camera": is_webcam,
                "display_name": f"{vendor} {model} ({dev_id})" if vendor or model else dev_id
            })

        # Sort real scanners first
        devices.sort(key=lambda d: 1 if d["is_camera"] else 0)
        return devices
    except Exception as e:
        print(f"Error querying scanimage: {e}")
        return []


def perform_scan(
    device_id: Optional[str] = None,
    resolution: int = 600,
    mode: str = "Color",
    output_dir: str = "scans"
) -> str:
    """
    Triggers a scan with scanimage and saves the resulting image as PNG.
    Returns the absolute path to the scanned PNG file.
    """
    if not is_sane_available():
        raise RuntimeError("scanimage (SANE) is not installed on this system.")

    os.makedirs(output_dir, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    out_filename = f"scan_{timestamp}_{resolution}dpi.png"
    out_path = os.path.abspath(os.path.join(output_dir, out_filename))

    cmd = ["scanimage", "--format=png", f"--resolution={resolution}", f"--mode={mode}"]
    if device_id:
        cmd.extend(["-d", device_id])
    cmd.extend(["-o", out_path])

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=300)
    if res.returncode != 0:
        err = res.stderr.strip() or res.stdout.strip()
        raise RuntimeError(f"Scan failed with error: {err}")

    if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        raise RuntimeError("Scan output file was not created or is empty.")

    return out_path
