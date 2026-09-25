import os
import sys
import json
import base64
import time
import subprocess
import shutil
import argparse
import webbrowser
import threading
from typing import List, Dict, Any, Optional
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Body, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import io
import socket

from scanner_photos.scanner import list_devices, perform_scan, is_sane_available
from scanner_photos.vision import detect_photos, crop_and_deskew, save_photo

# Path setup supporting both standard Python execution and PyInstaller frozen binary
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    STATIC_DIR = os.path.join(sys._MEIPASS, "static")
    CONFIG_DIR = os.path.expanduser("~/.config/scanner-photos")
    CACHE_DIR = os.path.expanduser("~/.cache/scanner-photos")
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    STATIC_DIR = os.path.join(BASE_DIR, "static")
    CONFIG_DIR = BASE_DIR
    CACHE_DIR = BASE_DIR

SCANS_DIR = os.path.join(CACHE_DIR, "scans")
OUTPUT_DIR = os.path.expanduser("~/Pictures/Scans")
SETTINGS_FILE = os.path.join(CONFIG_DIR, "settings.json")
SESSION_FILE = os.path.join(SCANS_DIR, "session.json")

os.makedirs(SCANS_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(CONFIG_DIR, exist_ok=True)

# Default settings
DEFAULT_SETTINGS = {
    "default_dpi": 600,
    "output_dir": os.path.expanduser("~/Pictures/Scans") if os.path.exists(os.path.expanduser("~/Pictures")) else OUTPUT_DIR,
    "naming_template": "Photo_{date}_{index:03d}",
    "export_format": "JPEG",
    "export_quality": 95,
    "language": "en",
    "has_borders": False,
    "sensitivity": 0.5,
    "open_browser_on_startup": True
}


class SessionManager:
    """
    Manages persistent project session cached on disk and synchronizes
    multi-client state (PC, Tablet, Mobile) in real-time via WebSockets.
    """
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.session_data: Dict[str, Any] = self.load_session()

    def load_session(self) -> Dict[str, Any]:
        if os.path.exists(SESSION_FILE):
            try:
                with open(SESSION_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    pages = data.get("pages", [])
                    # Verify each page's scan file actually exists on disk
                    valid_pages = []
                    for p in pages:
                        scan_id = p.get("scan_id")
                        if scan_id and os.path.exists(os.path.join(SCANS_DIR, scan_id)):
                            valid_pages.append(p)
                    data["pages"] = valid_pages
                    if not valid_pages:
                        data["active_page_index"] = -1
                    elif data.get("active_page_index", -1) >= len(valid_pages):
                        data["active_page_index"] = len(valid_pages) - 1
                    return data
            except Exception as e:
                print(f"Warning: Failed to load cached session from {SESSION_FILE}: {e}")
        return {"active_page_index": -1, "pages": []}

    def save_session(self, data: Dict[str, Any]):
        self.session_data = data
        try:
            temp_file = f"{SESSION_FILE}.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(temp_file, SESSION_FILE)
        except Exception as e:
            print(f"Warning: Failed to write session to {SESSION_FILE}: {e}")

    def clear_session(self, cleanup_files: bool = False):
        if cleanup_files:
            for p in self.session_data.get("pages", []):
                sid = p.get("scan_id")
                if sid:
                    p_path = os.path.join(SCANS_DIR, sid)
                    if os.path.exists(p_path):
                        try:
                            os.remove(p_path)
                        except Exception:
                            pass
        self.session_data = {"active_page_index": -1, "pages": []}
        if os.path.exists(SESSION_FILE):
            try:
                os.remove(SESSION_FILE)
            except Exception:
                pass

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict, sender: Optional[WebSocket] = None):
        for conn in list(self.active_connections):
            if conn != sender:
                try:
                    await conn.send_json(message)
                except Exception:
                    self.disconnect(conn)


session_manager = SessionManager()


def load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                res = DEFAULT_SETTINGS.copy()
                res.update(saved)
                return res
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()

def save_settings_to_disk(settings: dict):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)

def get_local_ips() -> List[str]:
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.254.254.254', 1))
        primary = s.getsockname()[0]
        s.close()
        if primary and primary != "127.0.0.1":
            ips.append(primary)
    except Exception:
        pass

    try:
        res = subprocess.run(["ip", "-4", "-o", "addr", "show"], stdout=subprocess.PIPE, text=True, timeout=2)
        for line in res.stdout.strip().splitlines():
            parts = line.split()
            if len(parts) >= 4:
                dev = parts[1]
                ip_cidr = parts[3]
                ip = ip_cidr.split("/")[0]
                if not dev.startswith("lo") and not dev.startswith("docker") and not dev.startswith("br-") and not dev.startswith("veth"):
                    if ip not in ips:
                        ips.append(ip)
    except Exception:
        pass

    return ips if ips else ["127.0.0.1"]

def get_local_ip() -> str:
    ips = get_local_ips()
    return ips[0] if ips else "127.0.0.1"

app = FastAPI(title="Photo Scanner Deskew", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DetectRequest(BaseModel):
    scan_id: str
    sensitivity: float = 0.5
    min_area_ratio: float = 0.015
    has_borders: bool = False


class PhotoCropItem(BaseModel):
    id: str
    corners: List[List[float]]
    rotation_90_steps: int = 0
    fine_angle_deg: float = 0.0
    margin_px: int = 0
    filename: Optional[str] = None


class PreviewCropRequest(BaseModel):
    scan_id: str
    crop: PhotoCropItem


class ExportRequest(BaseModel):
    scan_id: str
    photos: List[PhotoCropItem]
    output_dir: Optional[str] = None
    format: str = "JPEG"
    quality: int = 95
    dpi: int = 600
    naming_template: Optional[str] = None


class BatchPageItem(BaseModel):
    scan_id: str
    page_number: int = 1
    photos: List[PhotoCropItem]


class BatchExportRequest(BaseModel):
    pages: List[BatchPageItem]
    output_dir: Optional[str] = None
    format: str = "JPEG"
    quality: int = 95
    dpi: int = 600
    naming_template: Optional[str] = None


class OpenFolderRequest(BaseModel):
    path: str


class DemoScanRequest(BaseModel):
    page_index: int = 1


class ChooseDirectoryRequest(BaseModel):
    initial_dir: Optional[str] = None


class BrowseDirRequest(BaseModel):
    path: Optional[str] = None
    show_hidden: bool = False


class CreateDirRequest(BaseModel):
    parent_path: str
    folder_name: str


@app.get("/api/scanners")
def api_list_scanners():
    devices = list_devices()
    sane_ok = is_sane_available()
    return {
        "status": "ok",
        "sane_available": sane_ok,
        "scanners": devices,
        "default_device": devices[0]["id"] if devices else None
    }


@app.post("/api/scan")
def api_scan(
    device_id: Optional[str] = Body(None),
    resolution: int = Body(600),
    mode: str = Body("Color")
):
    try:
        clean_dev = device_id.strip() if device_id and isinstance(device_id, str) and device_id.strip() else None
        out_path = perform_scan(
            device_id=clean_dev,
            resolution=resolution,
            mode=mode,
            output_dir=SCANS_DIR
        )
        scan_id = os.path.basename(out_path)
        return {
            "status": "ok",
            "scan_id": scan_id,
            "image_url": f"/api/scans/{scan_id}",
            "resolution": resolution
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload")
async def api_upload(file: UploadFile = File(...)):
    filename = f"upload_{int(time.time())}_{file.filename}"
    target_path = os.path.join(SCANS_DIR, filename)
    with open(target_path, "wb") as f:
        content = await file.read()
        f.write(content)

    return {
        "status": "ok",
        "scan_id": filename,
        "image_url": f"/api/scans/{filename}"
    }


@app.post("/api/demo-scan")
def api_create_demo_scan(req: Optional[DemoScanRequest] = Body(None)):
    """
    Creates a simulated flatbed scan with sample tilted photos for testing.
    Supports page_index to generate distinct layouts for multi-page scanning.
    """
    page_idx = req.page_index if req else 1
    h, w = 2400, 1800
    bed = np.full((h, w, 3), 246, dtype=np.uint8)

    def draw_sample_photo(canvas, center, size, angle_deg, bg_color, label):
        pw, ph = size
        rect = (center, (pw, ph), angle_deg)
        box = cv2.boxPoints(rect)
        box = np.int32(box)
        cv2.fillPoly(canvas, [box], bg_color)
        # Inner border
        cv2.polylines(canvas, [box], True, (255, 255, 255), 6)
        # Decorative visual
        cx, cy = int(center[0]), int(center[1])
        cv2.circle(canvas, (cx, cy), min(pw, ph) // 3, (255 - bg_color[0], 200, 150), -1)
        cv2.putText(canvas, label, (cx - 70, cy + 10), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3)

    if page_idx == 2:
        draw_sample_photo(bed, (550, 600), (440, 580), -6.0, (50, 120, 180), "Photo 2A")
        draw_sample_photo(bed, (1250, 700), (460, 620), 8.5, (120, 50, 140), "Photo 2B")
        draw_sample_photo(bed, (900, 1600), (500, 650), -4.0, (70, 160, 100), "Photo 2C")
    elif page_idx == 3:
        draw_sample_photo(bed, (500, 800), (450, 620), 10.0, (140, 100, 40), "Photo 3A")
        draw_sample_photo(bed, (1300, 1400), (480, 640), -8.0, (60, 120, 200), "Photo 3B")
    else:
        draw_sample_photo(bed, (460, 550), (420, 600), 7.5, (180, 100, 50), "Photo 1")
        draw_sample_photo(bed, (1320, 580), (450, 620), -9.2, (60, 150, 90), "Photo 2")
        draw_sample_photo(bed, (500, 1650), (480, 640), -12.0, (80, 80, 200), "Photo 3")
        draw_sample_photo(bed, (1300, 1700), (430, 590), 5.4, (160, 70, 180), "Photo 4")

    filename = f"demo_flatbed_p{page_idx}_{int(time.time() * 1000)}.png"
    out_path = os.path.join(SCANS_DIR, filename)
    cv2.imwrite(out_path, bed)

    return {
        "status": "ok",
        "scan_id": filename,
        "image_url": f"/api/scans/{filename}",
        "resolution": 300,
        "page_index": page_idx
    }


@app.get("/api/scans/{scan_id}")
def api_get_scan(scan_id: str, max_size: Optional[int] = None):
    file_path = os.path.join(SCANS_DIR, scan_id)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Scan file not found")

    if max_size:
        # Return downscaled preview image for fast canvas rendering
        img = cv2.imread(file_path)
        if img is None:
            raise HTTPException(status_code=500, detail="Failed to read image")
        h, w = img.shape[:2]
        if max(h, w) > max_size:
            scale = max_size / float(max(h, w))
            nw, nh = int(w * scale), int(h * scale)
            img = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)

        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return StreamingResponse(io.BytesIO(buf.tobytes()), media_type="image/jpeg")

    return FileResponse(file_path)


@app.post("/api/detect")
def api_detect(req: DetectRequest):
    file_path = os.path.join(SCANS_DIR, req.scan_id)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Scan file not found")

    img = cv2.imread(file_path)
    if img is None:
        raise HTTPException(status_code=500, detail="Failed to decode image")

    detected = detect_photos(
        img,
        min_area_ratio=req.min_area_ratio,
        sensitivity=req.sensitivity,
        has_borders=req.has_borders
    )
    # Generate immediate preview thumbnail for each detected photo
    for p in detected:
        try:
            cropped = crop_and_deskew(img, corners=p["corners"])
            ph, pw = cropped.shape[:2]
            if max(ph, pw) > 500:
                scale = 500.0 / max(ph, pw)
                cropped = cv2.resize(cropped, (int(pw * scale), int(ph * scale)), interpolation=cv2.INTER_AREA)
            _, buf = cv2.imencode(".jpg", cropped, [cv2.IMWRITE_JPEG_QUALITY, 85])
            b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
            p["preview_url"] = f"data:image/jpeg;base64,{b64}"
        except Exception:
            p["preview_url"] = None

    h, w = img.shape[:2]
    return {
        "image_width": w,
        "image_height": h,
        "photos": detected
    }


@app.post("/api/preview-crop")
def api_preview_crop(req: PreviewCropRequest):
    file_path = os.path.join(SCANS_DIR, req.scan_id)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Scan file not found")

    img = cv2.imread(file_path)
    if img is None:
        raise HTTPException(status_code=500, detail="Failed to decode image")

    try:
        cropped = crop_and_deskew(
            img,
            corners=req.crop.corners,
            rotation_90_steps=req.crop.rotation_90_steps,
            fine_angle_deg=req.crop.fine_angle_deg,
            margin_px=req.crop.margin_px
        )
        # Downscale for preview if large
        ph, pw = cropped.shape[:2]
        if max(ph, pw) > 500:
            scale = 500.0 / max(ph, pw)
            cropped = cv2.resize(cropped, (int(pw * scale), int(ph * scale)), interpolation=cv2.INTER_AREA)

        _, buf = cv2.imencode(".jpg", cropped, [cv2.IMWRITE_JPEG_QUALITY, 90])
        b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
        return {
            "status": "ok",
            "preview_url": f"data:image/jpeg;base64,{b64}",
            "width": pw,
            "height": ph
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/export")
def api_export(req: ExportRequest):
    file_path = os.path.join(SCANS_DIR, req.scan_id)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Scan file not found")

    img = cv2.imread(file_path)
    if img is None:
        raise HTTPException(status_code=500, detail="Failed to decode image")

    settings = load_settings()
    target_dir = req.output_dir or settings.get("output_dir") or OUTPUT_DIR
    target_dir = os.path.expanduser(target_dir)
    os.makedirs(target_dir, exist_ok=True)

    naming_template = req.naming_template or settings.get("naming_template", "Photo_{date}_{index:03d}")
    date_str = time.strftime("%Y%m%d")

    exported_files = []
    ext = req.format.lower()
    if ext == "jpeg":
        ext = "jpg"

    for idx, item in enumerate(req.photos, start=1):
        cropped = crop_and_deskew(
            img,
            corners=item.corners,
            rotation_90_steps=item.rotation_90_steps,
            fine_angle_deg=item.fine_angle_deg,
            margin_px=item.margin_px
        )

        if item.filename and item.filename.strip():
            base_name = item.filename.strip()
            if not base_name.lower().endswith(f".{ext}"):
                fname = f"{base_name}.{ext}"
            else:
                fname = base_name
        else:
            try:
                base_name = naming_template.format(date=date_str, index=idx)
            except Exception:
                base_name = f"Photo_{date_str}_{idx:03d}"
            fname = f"{base_name}.{ext}"

        dest_file = os.path.join(target_dir, fname)
        # Avoid overwriting existing files
        counter = 1
        name_without_ext, extension = os.path.splitext(dest_file)
        while os.path.exists(dest_file):
            dest_file = f"{name_without_ext}_{counter}{extension}"
            counter += 1

        save_photo(
            cropped,
            dest_file,
            dpi=req.dpi,
            format=req.format,
            quality=req.quality
        )
        exported_files.append(dest_file)

    return {
        "status": "ok",
        "count": len(exported_files),
        "exported_files": exported_files,
        "output_directory": target_dir
    }


@app.post("/api/export-batch")
def api_export_batch(req: BatchExportRequest):
    settings = load_settings()
    target_dir = req.output_dir or settings.get("output_dir") or OUTPUT_DIR
    target_dir = os.path.expanduser(target_dir)
    os.makedirs(target_dir, exist_ok=True)

    naming_template = req.naming_template or settings.get("naming_template", "Photo_{date}_{index:03d}")
    date_str = time.strftime("%Y%m%d")

    exported_files = []
    ext = req.format.lower()
    if ext == "jpeg":
        ext = "jpg"

    image_cache = {}
    global_index = 1

    for page in req.pages:
        scan_id = page.scan_id
        if scan_id not in image_cache:
            file_path = os.path.join(SCANS_DIR, scan_id)
            if not os.path.exists(file_path):
                continue
            img = cv2.imread(file_path)
            if img is None:
                continue
            image_cache[scan_id] = img

        img = image_cache[scan_id]

        for item in page.photos:
            cropped = crop_and_deskew(
                img,
                corners=item.corners,
                rotation_90_steps=item.rotation_90_steps,
                fine_angle_deg=item.fine_angle_deg,
                margin_px=item.margin_px
            )

            if item.filename and item.filename.strip():
                base_name = item.filename.strip()
                if not base_name.lower().endswith(f".{ext}"):
                    fname = f"{base_name}.{ext}"
                else:
                    fname = base_name
            else:
                try:
                    base_name = naming_template.format(
                        date=date_str,
                        index=global_index,
                        page=page.page_number
                    )
                except Exception:
                    base_name = f"Photo_{date_str}_{global_index:03d}"
                fname = f"{base_name}.{ext}"

            dest_file = os.path.join(target_dir, fname)
            # Avoid overwriting existing files
            counter = 1
            name_without_ext, extension = os.path.splitext(dest_file)
            while os.path.exists(dest_file):
                dest_file = f"{name_without_ext}_{counter}{extension}"
                counter += 1

            save_photo(
                cropped,
                dest_file,
                dpi=req.dpi,
                format=req.format,
                quality=req.quality
            )
            exported_files.append(dest_file)
            global_index += 1

    return {
        "status": "ok",
        "count": len(exported_files),
        "exported_files": exported_files,
        "output_directory": target_dir
    }


@app.post("/api/open-folder")
def api_open_folder(req: OpenFolderRequest):
    folder_path = os.path.expanduser(req.path)
    if not os.path.exists(folder_path):
        raise HTTPException(status_code=404, detail="Directory not found")
    if not os.path.isdir(folder_path):
        folder_path = os.path.dirname(folder_path)

    try:
        if shutil.which("xdg-open"):
            subprocess.Popen(["xdg-open", folder_path])
        elif shutil.which("gio"):
            subprocess.Popen(["gio", "open", folder_path])
        return {"status": "ok", "path": folder_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/choose-directory")
def api_choose_directory(req: Optional[ChooseDirectoryRequest] = Body(None)):
    initial_dir = req.initial_dir if req else None
    if initial_dir:
        initial_dir = os.path.expanduser(initial_dir)
        if not os.path.exists(initial_dir):
            initial_dir = None

    chosen_path = None

    # 1. Try zenity
    if shutil.which("zenity"):
        cmd = ["zenity", "--file-selection", "--directory", "--title=Selecione a pasta de exportação"]
        if initial_dir and os.path.isdir(initial_dir):
            cmd.append(f"--filename={initial_dir}/")
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
            if res.returncode == 0:
                chosen_path = res.stdout.strip()
        except Exception:
            pass

    # 2. Fallback to tkinter
    if not chosen_path:
        try:
            import tkinter
            from tkinter import filedialog
            root = tkinter.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            chosen = filedialog.askdirectory(
                initialdir=initial_dir or os.path.expanduser("~"),
                title="Selecione a pasta de exportação"
            )
            root.destroy()
            if chosen:
                chosen_path = chosen
        except Exception:
            pass

    if chosen_path:
        return {"status": "ok", "path": os.path.abspath(chosen_path)}
    else:
        return {"status": "cancelled", "path": None}


@app.get("/api/settings")
def api_get_settings():
    return load_settings()


@app.post("/api/settings")
def api_save_settings(settings: dict = Body(...)):
    current = load_settings()
    current.update(settings)
    save_settings_to_disk(current)
    return {"status": "ok", "settings": current}


@app.get("/api/server-info")
def api_server_info():
    local_ips = get_local_ips()
    primary_ip = local_ips[0]
    port = 8321
    has_qr = shutil.which("qrencode") is not None
    return {
        "status": "ok",
        "local_ip": primary_ip,
        "local_ips": local_ips,
        "port": port,
        "remote_url": f"http://{primary_ip}:{port}",
        "mobile_url": f"http://{primary_ip}:{port}/mobile",
        "all_urls": [f"http://{ip}:{port}" for ip in local_ips],
        "all_mobile_urls": [f"http://{ip}:{port}/mobile" for ip in local_ips],
        "hostname": socket.gethostname(),
        "has_qrcode": has_qr
    }


@app.get("/api/qrcode")
def api_qrcode(host: Optional[str] = None, path: Optional[str] = None):
    ip = host or get_local_ip()
    target_path = (path or "").strip()
    if target_path and not target_path.startswith("/"):
        target_path = "/" + target_path
    url = f"http://{ip}:8321{target_path}"
    if shutil.which("qrencode"):
        try:
            res = subprocess.run(
                ["qrencode", "-t", "SVG", url],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True
            )
            return StreamingResponse(io.BytesIO(res.stdout.encode("utf-8")), media_type="image/svg+xml")
        except Exception:
            pass
    raise HTTPException(status_code=404, detail="QR code generation not available")


@app.post("/api/browse-directories")
def api_browse_directories(req: Optional[BrowseDirRequest] = Body(None)):
    raw_path = (req.path if req and req.path else "").strip()
    if not raw_path:
        current_path = os.path.expanduser("~")
    else:
        current_path = os.path.expanduser(raw_path)

    current_path = os.path.abspath(current_path)
    if not os.path.exists(current_path) or not os.path.isdir(current_path):
        current_path = os.path.expanduser("~")

    parent_path = os.path.dirname(current_path) if current_path != "/" else None

    subdirs = []
    try:
        with os.scandir(current_path) as entries:
            for entry in entries:
                try:
                    if entry.is_dir(follow_symlinks=True):
                        if not (req and req.show_hidden) and entry.name.startswith("."):
                            continue
                        subdirs.append({
                            "name": entry.name,
                            "path": entry.path
                        })
                except (PermissionError, OSError):
                    continue
        subdirs.sort(key=lambda x: x["name"].lower())
    except (PermissionError, OSError):
        pass

    home_dir = os.path.expanduser("~")
    shortcuts = [
        {"name": "Home (~)", "path": home_dir},
        {"name": "Pictures", "path": os.path.join(home_dir, "Pictures")},
        {"name": "Scans", "path": os.path.join(home_dir, "Pictures", "Scans")},
        {"name": "Desktop", "path": os.path.join(home_dir, "Desktop")},
        {"name": "Downloads", "path": os.path.join(home_dir, "Downloads")},
        {"name": "Root (/)", "path": "/"}
    ]
    valid_shortcuts = [s for s in shortcuts if os.path.exists(s["path"])]

    return {
        "status": "ok",
        "current_path": current_path,
        "parent_path": parent_path,
        "directories": subdirs,
        "shortcuts": valid_shortcuts,
        "writable": os.access(current_path, os.W_OK)
    }


@app.post("/api/create-directory")
def api_create_directory(req: CreateDirRequest):
    parent = os.path.expanduser(req.parent_path.strip())
    name = req.folder_name.strip()
    if not name or "/" in name or "\\" in name or name in [".", ".."]:
        raise HTTPException(status_code=400, detail="Invalid folder name")
    new_dir = os.path.join(parent, name)
    try:
        os.makedirs(new_dir, exist_ok=False)
        return {"status": "ok", "path": os.path.abspath(new_dir)}
    except FileExistsError:
        raise HTTPException(status_code=400, detail="Folder already exists")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Session & Cache Endpoints
@app.get("/api/session")
def api_get_session():
    return {
        "status": "ok",
        "session": session_manager.session_data
    }


@app.post("/api/session")
async def api_save_session(body: dict = Body(...)):
    session_data = body.get("session", body)
    sender_id = body.get("sender_id")
    session_manager.save_session(session_data)
    await session_manager.broadcast({
        "type": "session_updated",
        "session": session_data,
        "sender_id": sender_id
    })
    return {
        "status": "ok",
        "session": session_manager.session_data
    }


@app.post("/api/session/clear")
async def api_clear_session(body: Optional[dict] = Body(None)):
    cleanup = body.get("cleanup_files", False) if body else False
    sender_id = body.get("sender_id") if body else None
    session_manager.clear_session(cleanup_files=cleanup)
    await session_manager.broadcast({
        "type": "session_cleared",
        "sender_id": sender_id
    })
    return {
        "status": "ok",
        "message": "Session cache cleared successfully"
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await session_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            sender_id = data.get("sender_id")

            if msg_type == "sync_session":
                new_session = data.get("session")
                if new_session:
                    session_manager.save_session(new_session)
                    await session_manager.broadcast({
                        "type": "session_updated",
                        "session": new_session,
                        "sender_id": sender_id
                    }, sender=websocket)
            elif msg_type == "scan_started":
                await session_manager.broadcast({
                    "type": "scan_started",
                    "sender_id": sender_id
                }, sender=websocket)
            elif msg_type == "scan_finished":
                await session_manager.broadcast({
                    "type": "scan_finished",
                    "sender_id": sender_id
                }, sender=websocket)
            elif msg_type == "clear_session":
                session_manager.clear_session(cleanup_files=data.get("cleanup_files", False))
                await session_manager.broadcast({
                    "type": "session_cleared",
                    "sender_id": sender_id
                }, sender=websocket)
    except WebSocketDisconnect:
        session_manager.disconnect(websocket)
    except Exception:
        session_manager.disconnect(websocket)


# Serve mobile remote web interface
@app.get("/mobile")
@app.get("/mobile/")
def get_mobile_page():
    mobile_html_path = os.path.join(STATIC_DIR, "mobile.html")
    if os.path.exists(mobile_html_path):
        return FileResponse(mobile_html_path, media_type="text/html")
    raise HTTPException(status_code=404, detail="Mobile page not found")


# Serve static files
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


def cli():
    """
    Main CLI entrypoint for the standalone binary and package script.
    """
    parser = argparse.ArgumentParser(
        prog="scanner-photos",
        description="Photo Scanner & Deskew: Multi-photo flatbed scanner and alignment app for Linux"
    )
    parser.add_argument("--port", type=int, default=8321, help="Port to run server on (default: 8321)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind (default: 0.0.0.0)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser window automatically")
    parser.add_argument("--version", action="version", version="Photo Scanner & Deskew 0.1.0")
    args = parser.parse_args()

    settings = load_settings()
    env_no_browser = os.environ.get("SCANNER_NO_BROWSER", "").strip().lower() in ("1", "true", "yes")
    setting_no_browser = not settings.get("open_browser_on_startup", True)
    should_open_browser = not (args.no_browser or env_no_browser or setting_no_browser)

    local_ip = get_local_ip()
    local_url = f"http://localhost:{args.port}"
    remote_url = f"http://{local_ip}:{args.port}"

    print("=" * 60)
    print("📸 Photo Scanner & Deskew - Server Running")
    print(f"🖥️  Local PC:      {local_url}")
    print(f"📱 Tablet/Remote: {remote_url}")
    if not should_open_browser:
        print("⚡ Headless mode: Browser GUI will NOT open automatically.")
    print("=" * 60)

    if should_open_browser:
        def open_browser():
            time.sleep(0.8)
            for browser_cmd in ["chromium", "google-chrome", "brave"]:
                if shutil.which(browser_cmd):
                    try:
                        subprocess.Popen([
                            browser_cmd,
                            f"--app={local_url}",
                            "--user-data-dir=/tmp/photo-scanner-chromium-profile"
                        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        return
                    except Exception:
                        pass
            webbrowser.open(local_url)

        thread = threading.Thread(target=open_browser, daemon=True)
        thread.start()

    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    cli()

