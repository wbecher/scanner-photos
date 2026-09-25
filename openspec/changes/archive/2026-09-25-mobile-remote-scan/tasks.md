# Tasks

## 1. Backend Route & Server Info Updates

- [x] 1.1 Add `/mobile` route in `src/scanner_photos/main.py` serving `static/mobile.html` and verify `GET /mobile` returns HTTP 200 with HTML content.
- [x] 1.2 Update `/api/server-info` to expose `mobile_url` and update `/api/qrcode` to support target path parameters, verifying via tests in `tests/test_remote.py`.
- [x] 1.3 Verify session WebSocket broadcasting ensures scans initiated from mobile immediately update desktop clients without payload discrepancies.

## 2. Mobile Remote Interface (HTML & CSS)

- [x] 2.1 Create `static/mobile.html` with safe area viewport meta tags, connection sync badge, quick hardware selector, prominent scan trigger area, and recent pages reel.
- [x] 2.2 Create `static/css/mobile.css` providing touch-friendly ergonomics, high-contrast dark theme, active scanning pulse animations, and responsive layouts for viewports 360px–430px wide.
- [x] 2.3 Add bilingual dictionary strings (PT / EN) for all mobile remote scanning prompts, status badges, and swap cues.

## 3. Mobile Remote Client Logic

- [x] 3.1 Implement `static/js/mobile.js` to fetch scanner devices from `/api/scanners`, load active session from `/api/session`, and establish WebSocket connection.
- [x] 3.2 Implement sequential scan execution in `static/js/mobile.js` with button locking, progress timer, haptic vibration (`navigator.vibrate`), and visual swap notifications.
- [x] 3.3 Implement the mobile session reel in `static/js/mobile.js` displaying page thumbnails, total count, and a quick discard action for the most recent scan.

## 4. Desktop Pairing Integration

- [x] 4.1 Update the desktop QR modal in `static/index.html` and `static/js/app.js` to include a "Smartphone Remote" tab/toggle pointing directly to `/mobile`.
- [x] 4.2 Add a switcher button in `static/mobile.html` allowing users to jump to the full desktop/tablet canvas editor (`/`) if they choose.

## 5. End-to-End Verification & Documentation

- [x] 5.1 Run automated test suite (`.venv/bin/pytest`) and verify all backend routes and remote tests pass.
- [x] 5.2 Update `README.md` with instructions and documentation for the smartphone remote sequential scanning workflow.
