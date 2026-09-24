import os
import json
import pytest
from fastapi.testclient import TestClient
from scanner_photos.main import app, session_manager, SESSION_FILE, SCANS_DIR, load_settings, save_settings_to_disk

client = TestClient(app)

@pytest.fixture(autouse=True)
def cleanup_session():
    # Setup: clean session before test
    session_manager.clear_session()
    yield
    # Teardown: clean session after test
    session_manager.clear_session()


def test_api_session_lifecycle():
    # 1. Initially empty
    res = client.get("/api/session")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["session"]["pages"] == []
    assert data["session"]["active_page_index"] == -1

    # 2. Create demo scan to have a real file in SCANS_DIR
    demo_res = client.post("/api/demo-scan", json={"page_index": 1})
    assert demo_res.status_code == 200
    scan_id = demo_res.json()["scan_id"]

    # 3. Save a session with this page
    sample_session = {
        "active_page_index": 0,
        "pages": [
            {
                "id": "page_test_1",
                "scan_id": scan_id,
                "pageNumber": 1,
                "imageWidth": 1800,
                "imageHeight": 2400,
                "photos": [
                    {
                        "id": "photo_1",
                        "corners": [[100, 100], [500, 100], [500, 500], [100, 500]],
                        "filename": "Photo_001"
                    }
                ]
            }
        ]
    }
    save_res = client.post("/api/session", json={"session": sample_session, "sender_id": "test_client"})
    assert save_res.status_code == 200
    assert os.path.exists(SESSION_FILE)

    # 4. Verify disk persistence by reloading session manager
    reloaded_data = session_manager.load_session()
    assert len(reloaded_data["pages"]) == 1
    assert reloaded_data["pages"][0]["id"] == "page_test_1"
    assert reloaded_data["active_page_index"] == 0

    # 5. Clear session
    clear_res = client.post("/api/session/clear")
    assert clear_res.status_code == 200
    assert not os.path.exists(SESSION_FILE)

    get_after = client.get("/api/session")
    assert get_after.json()["session"]["pages"] == []


def test_session_prunes_missing_scans():
    # Create fake session file with non-existent scan_id
    fake_data = {
        "active_page_index": 0,
        "pages": [
            {"id": "p_ghost", "scan_id": "non_existent_file_99999.png", "photos": []}
        ]
    }
    with open(SESSION_FILE, "w", encoding="utf-8") as f:
        json.dump(fake_data, f)

    loaded = session_manager.load_session()
    assert len(loaded["pages"]) == 0
    assert loaded["active_page_index"] == -1


def test_headless_setting_persistence():
    settings = load_settings()
    original_val = settings.get("open_browser_on_startup", True)

    try:
        # Save disabled
        save_res = client.post("/api/settings", json={"open_browser_on_startup": False})
        assert save_res.status_code == 200
        assert save_res.json()["settings"]["open_browser_on_startup"] is False

        check = load_settings()
        assert check["open_browser_on_startup"] is False
    finally:
        # Restore
        client.post("/api/settings", json={"open_browser_on_startup": original_val})


def test_websocket_connection_and_events():
    with client.websocket_connect("/ws") as ws:
        # Send a clear_session message
        ws.send_json({
            "type": "clear_session",
            "sender_id": "test_ws_client"
        })
        # Check that session was cleared
        res = client.get("/api/session")
        assert res.status_code == 200
        assert res.json()["session"]["pages"] == []


