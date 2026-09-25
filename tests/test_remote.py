import pytest
import os
import shutil
from fastapi.testclient import TestClient
from scanner_photos.main import app, get_local_ip

client = TestClient(app)

def test_mobile_route():
    res = client.get("/mobile")
    assert res.status_code == 200
    assert "text/html" in res.headers.get("content-type", "")
    assert "Scanner Remote" in res.text

    res_slash = client.get("/mobile/")
    assert res_slash.status_code == 200


def test_api_scanners_response():
    res = client.get("/api/scanners")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "scanners" in data
    assert "sane_available" in data


def test_api_server_info():
    res = client.get("/api/server-info")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "local_ip" in data
    assert data["port"] == 8321
    assert data["remote_url"].startswith("http://")
    assert "mobile_url" in data
    assert data["mobile_url"].endswith("/mobile")
    assert "all_mobile_urls" in data
    assert "has_qrcode" in data


def test_api_qrcode():
    res = client.get("/api/qrcode")
    # If qrencode is installed on system, returns 200 SVG; otherwise 404
    if shutil.which("qrencode"):
        assert res.status_code == 200
        assert "image/svg+xml" in res.headers.get("content-type", "")
        assert b"<svg" in res.content

        # Test with path parameter
        res_mobile = client.get("/api/qrcode?path=/mobile")
        assert res_mobile.status_code == 200
        assert "image/svg+xml" in res_mobile.headers.get("content-type", "")
    else:
        assert res.status_code in [200, 404]


def test_api_browse_directories():
    # 1. Test browsing default home directory
    res = client.post("/api/browse-directories", json={})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "current_path" in data
    assert "directories" in data
    assert "shortcuts" in data
    assert isinstance(data["directories"], list)
    assert isinstance(data["shortcuts"], list)
    assert "writable" in data

    # 2. Test browsing a specific existing directory (/tmp)
    res_tmp = client.post("/api/browse-directories", json={"path": "/tmp"})
    assert res_tmp.status_code == 200
    data_tmp = res_tmp.json()
    assert data_tmp["current_path"] == "/tmp"
    assert data_tmp["parent_path"] == "/"


def test_api_create_directory():
    test_parent = "/tmp"
    test_folder_name = "test_scanner_tablet_mkdir_xyz"
    full_path = os.path.join(test_parent, test_folder_name)

    if os.path.exists(full_path):
        shutil.rmtree(full_path)

    # 1. Create directory
    res = client.post("/api/create-directory", json={
        "parent_path": test_parent,
        "folder_name": test_folder_name
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["path"] == full_path
    assert os.path.isdir(full_path)

    # 2. Prevent duplicate folder creation error
    res_dup = client.post("/api/create-directory", json={
        "parent_path": test_parent,
        "folder_name": test_folder_name
    })
    assert res_dup.status_code == 400

    # 3. Prevent path traversal in folder name
    res_bad = client.post("/api/create-directory", json={
        "parent_path": test_parent,
        "folder_name": "../hacked"
    })
    assert res_bad.status_code == 400

    # Clean up
    if os.path.exists(full_path):
        shutil.rmtree(full_path)
