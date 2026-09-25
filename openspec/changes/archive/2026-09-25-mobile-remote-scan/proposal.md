# Proposal

## Why

Scanning physical photos typically requires standing right next to the flatbed scanner to position, orient, and swap photo prints. While the application currently offers a responsive web interface and LAN pairing, the existing interface is designed for desktop and tablet displays with a multi-panel coordinate canvas, floating toolbars, photo card sidebars, and desktop-centric controls.

On smartphone screens (such as iPhones and Android devices with viewports between 375px and 430px), this full canvas layout is cramped, complex, and unnecessary during the physical scanning phase. Users standing at the scanner want a simplified, rapid sequential scanning console to trigger successive scans as they swap photos on the glass, deferring crop adjustments, deskewing, and export validation to the comfortable PC workstation afterwards.

## What Changes

- **Dedicated Mobile Remote Interface (`/mobile`)**: Introduce a lightweight, mobile-first web interface designed specifically for one-handed portrait operation on smartphones (iPhone / Android).
- **Streamlined Sequential Scanning Workflow**:
  - Prominent, high-contrast "Scan Next Page" action button with haptic vibration (via `navigator.vibrate` when supported) and visual completion cues.
  - Clear scanner state indicator (Ready, Scanning, Processing, Error).
  - Page sequence counter and visual thumbnail reel of scanned pages in the current session.
  - Quick action to delete the most recent page in case of misplaced photos or scanner errors without needing the PC.
- **Essential Scanner Settings**: Compact controls to select the active scanner device, DPI resolution (150, 300, 600 DPI), and color mode directly from the mobile console.
- **Real-Time Session Synchronization**: All scans triggered from the mobile phone immediately update the backend session cache and broadcast over WebSocket to the PC workstation, triggering automated OpenCV photo detection so pages are ready for review on the PC.
- **Mobile Connection & QR Code Enhancements**: Update the PC desktop "Tablet / Remote" modal and QR code to offer a direct mobile URL (`/mobile`) alongside the standard URL, making mobile connection via iPhone camera instant.
- **Desktop Handoff Guidance**: Provide a clear status summary on mobile indicating that all scanned pages are safely saved in the PC session cache, ready for crop fine-tuning, rotation, naming, and batch export at the computer.

## Capabilities

### New Capabilities
- `mobile-remote-scan`: Provides a lightweight, touch-optimized mobile web console for smartphones to trigger sequential flatbed scans, manage active scan session pages, and synchronize in real-time with the desktop editing workstation.

### Modified Capabilities
*(None - no existing specs in the project)*

## Impact

- **Backend (`src/scanner_photos/main.py`)**:
  - Serve `/mobile` route returning the mobile remote HTML entry point.
  - Provide mobile-aware QR code generation option or link in `/api/server-info`.
  - Maintain existing WebSocket session synchronization and scan endpoints without breaking compatibility.
- **Frontend Assets**:
  - Add `static/mobile.html` (or dedicated mobile UI view) with mobile viewport meta tags, safe area insets (`env(safe-area-inset-*)` for iPhone notch/home bar), and modern dark theme matching the desktop palette.
  - Add `static/css/mobile.css` and `static/js/mobile.js` for lightweight, dependency-free mobile operation.
  - Update `static/index.html` and `static/js/app.js` QR modal with a mobile remote access tab/link.
- **Documentation & Tests**:
  - Add test coverage in `tests/test_remote.py` for `/mobile` endpoint and mobile session interactions.
  - Update `README.md` to document the smartphone remote workflow.
