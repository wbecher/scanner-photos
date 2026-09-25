import pytest
from fastapi.testclient import TestClient
from scanner_photos.main import app
import os
import shutil

client = TestClient(app)

def test_api_scanners():
    response = client.get("/api/scanners")
    assert response.status_code == 200
    data = response.json()
    assert "scanners" in data
    assert "sane_available" in data


def test_api_demo_scan_and_detect():
    # 1. Create a demo scan
    demo_res = client.post("/api/demo-scan")
    assert demo_res.status_code == 200
    demo_data = demo_res.json()
    scan_id = demo_data["scan_id"]
    assert scan_id.endswith(".png")

    # 2. Run detection on this scan
    detect_res = client.post("/api/detect", json={
        "scan_id": scan_id,
        "sensitivity": 0.5,
        "min_area_ratio": 0.015,
        "has_borders": False
    })
    assert detect_res.status_code == 200
    detect_data = detect_res.json()
    photos = detect_data["photos"]
    # The demo scan has 4 photos
    assert len(photos) == 4

    # 3. Preview crop for the first photo
    preview_res = client.post("/api/preview-crop", json={
        "scan_id": scan_id,
        "crop": {
            "id": photos[0]["id"],
            "corners": photos[0]["corners"],
            "rotation_90_steps": 1,
            "fine_angle_deg": 0.0,
            "margin_px": 0
        }
    })
    assert preview_res.status_code == 200
    preview_data = preview_res.json()
    assert preview_data["status"] == "ok"
    assert preview_data["preview_url"].startswith("data:image/jpeg;base64,")

    # 4. Export all photos to a temporary folder
    test_out = "/tmp/test_scanner_export"
    if os.path.exists(test_out):
        shutil.rmtree(test_out)

    export_res = client.post("/api/export", json={
        "scan_id": scan_id,
        "photos": [
            {
                "id": p["id"],
                "corners": p["corners"],
                "rotation_90_steps": 0,
                "fine_angle_deg": 0.0,
                "margin_px": 0
            } for p in photos
        ],
        "output_dir": test_out,
        "format": "JPEG",
        "quality": 90,
        "dpi": 600
    })
    assert export_res.status_code == 200
    export_data = export_res.json()
    assert export_data["count"] == 4
    for f in export_data["exported_files"]:
        assert os.path.exists(f)

    # Clean up
    if os.path.exists(test_out):
        shutil.rmtree(test_out)


def test_api_multi_page_demo_and_batch_export():
    # 1. Page 1 demo scan
    p1_res = client.post("/api/demo-scan", json={"page_index": 1})
    assert p1_res.status_code == 200
    p1_data = p1_res.json()
    p1_scan_id = p1_data["scan_id"]

    # Detect photos on Page 1
    p1_detect = client.post("/api/detect", json={
        "scan_id": p1_scan_id,
        "sensitivity": 0.5,
        "min_area_ratio": 0.015,
        "has_borders": False
    })
    assert p1_detect.status_code == 200
    p1_photos = p1_detect.json()["photos"]
    assert len(p1_photos) == 4

    # 2. Page 2 demo scan
    p2_res = client.post("/api/demo-scan", json={"page_index": 2})
    assert p2_res.status_code == 200
    p2_data = p2_res.json()
    p2_scan_id = p2_data["scan_id"]

    # Detect photos on Page 2
    p2_detect = client.post("/api/detect", json={
        "scan_id": p2_scan_id,
        "sensitivity": 0.5,
        "min_area_ratio": 0.015,
        "has_borders": False
    })
    assert p2_detect.status_code == 200
    p2_photos = p2_detect.json()["photos"]
    assert len(p2_photos) == 3

    # 3. Batch export validated photos (select 3 from page 1, 2 from page 2)
    test_batch_dir = "/tmp/test_scanner_batch_export"
    if os.path.exists(test_batch_dir):
        shutil.rmtree(test_batch_dir)

    batch_payload = {
        "pages": [
            {
                "scan_id": p1_scan_id,
                "page_number": 1,
                "photos": [
                    {
                        "id": p["id"],
                        "corners": p["corners"],
                        "rotation_90_steps": 0,
                        "fine_angle_deg": 0.0,
                        "margin_px": 0,
                        "filename": f"Custom_P1_{i}" if i == 0 else None
                    } for i, p in enumerate(p1_photos[:3])
                ]
            },
            {
                "scan_id": p2_scan_id,
                "page_number": 2,
                "photos": [
                    {
                        "id": p["id"],
                        "corners": p["corners"],
                        "rotation_90_steps": 1,
                        "fine_angle_deg": 0.0,
                        "margin_px": 0
                    } for p in p2_photos[:2]
                ]
            }
        ],
        "output_dir": test_batch_dir,
        "format": "JPEG",
        "quality": 90,
        "dpi": 600,
        "naming_template": "Batch_{index:03d}"
    }

    batch_res = client.post("/api/export-batch", json=batch_payload)
    assert batch_res.status_code == 200
    batch_data = batch_res.json()
    assert batch_data["count"] == 5
    assert len(batch_data["exported_files"]) == 5
    for file_path in batch_data["exported_files"]:
        assert os.path.exists(file_path)

    # 4. Test open folder
    open_res = client.post("/api/open-folder", json={"path": test_batch_dir})
    assert open_res.status_code == 200

    # Test non-existent folder
    fail_res = client.post("/api/open-folder", json={"path": "/path/does/not/exist_12345"})
    assert fail_res.status_code == 404

    # Clean up
    if os.path.exists(test_batch_dir):
        shutil.rmtree(test_batch_dir)


def test_api_choose_directory(monkeypatch):
    # Test with mocked successful selection
    monkeypatch.setattr("scanner_photos.main.shutil.which", lambda cmd: "/usr/bin/zenity" if cmd == "zenity" else None)
    class MockProcess:
        returncode = 0
        stdout = "/tmp/my_selected_folder\n"
        stderr = ""
    monkeypatch.setattr("scanner_photos.main.subprocess.run", lambda *args, **kwargs: MockProcess())

    res = client.post("/api/choose-directory", json={"initial_dir": "/tmp"})
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["path"] == "/tmp/my_selected_folder"

    # Test with cancellation (returncode != 0)
    class MockCancelProcess:
        returncode = 1
        stdout = ""
        stderr = ""
    monkeypatch.setattr("scanner_photos.main.subprocess.run", lambda *args, **kwargs: MockCancelProcess())
    # Also disable tkinter fallback
    monkeypatch.setattr("sys.modules", {**__import__("sys").modules, "tkinter": None})

    res_cancel = client.post("/api/choose-directory", json={"initial_dir": "/tmp"})
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "cancelled"


def test_api_settings_shortcuts_and_loupe(tmp_path, monkeypatch):
    test_settings_file = str(tmp_path / "test_settings.json")
    monkeypatch.setattr("scanner_photos.main.SETTINGS_FILE", test_settings_file)

    # 1. Fetch current default settings
    res = client.get("/api/settings")
    assert res.status_code == 200
    settings = res.json()
    assert "shortcuts" in settings
    assert settings["shortcuts"]["cycle_corner"] == "Tab"
    assert settings["shortcuts"]["cycle_corner_reverse"] == "Shift+Tab"
    assert settings["shortcuts"]["nudge_up"] == "ArrowUp"
    assert settings["loupe_zoom"] == 3.0
    assert settings["loupe_size"] == 140

    # 2. Update with custom shortcuts and loupe zoom
    custom_payload = {
        "loupe_zoom": 4.5,
        "loupe_size": 160,
        "shortcuts": {
            "cycle_corner": "KeyC",
            "nudge_up": "KeyW"
        }
    }
    save_res = client.post("/api/settings", json=custom_payload)
    assert save_res.status_code == 200
    saved = save_res.json()["settings"]
    assert saved["loupe_zoom"] == 4.5
    assert saved["loupe_size"] == 160
    assert saved["shortcuts"]["cycle_corner"] == "KeyC"
    assert saved["shortcuts"]["nudge_up"] == "KeyW"
    # Unchanged shortcut keys should remain preserved
    assert saved["shortcuts"]["cycle_corner_reverse"] == "Shift+Tab"
    assert saved["shortcuts"]["nudge_down"] == "ArrowDown"

    # 3. Subsequent GET returns persisted updated values
    get_res = client.get("/api/settings")
    assert get_res.status_code == 200
    retrieved = get_res.json()
    assert retrieved["loupe_zoom"] == 4.5
    assert retrieved["shortcuts"]["cycle_corner"] == "KeyC"
    assert retrieved["shortcuts"]["cycle_corner_reverse"] == "Shift+Tab"


