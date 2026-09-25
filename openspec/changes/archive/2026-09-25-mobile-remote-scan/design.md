# Design

## Context

The system currently runs a FastAPI server hosting REST APIs and WebSocket synchronization (`/ws`) for desktop and tablet clients. The existing web interface (`static/index.html`) is structured around an interactive HTML5 coordinate canvas, SVG handle drag-and-drop, and floating toolbars. 

While suitable for desktop monitors and 10"+ tablet displays in landscape mode, this architecture causes cognitive and ergonomic friction on smartphone viewports (375px–430px portrait width). When standing directly in front of the scanner hardware, the user only needs to swap physical photo prints and trigger sequential scans, leaving crop fine-tuning and validation for when they return to their PC.

See `proposal.md` for background and user motivation.

## Goals / Non-Goals

**Goals:**
- Provide a dedicated, ultra-fast mobile web interface (`/mobile`) tailored for one-handed smartphone operation.
- Implement a clear sequential scan loop: trigger scan -> progress indicator -> completion cue (vibration/visual) -> swap photos -> trigger next.
- Render an active session reel showing the count and thumbnails of scanned pages, with the ability to delete the last scan if misaligned.
- Expose essential scanner controls: scanner hardware device selection, DPI (150, 300, 600), and color mode.
- Synchronize all mobile scans in real time via WebSocket to connected desktop instances, triggering background OpenCV photo detection on the host.
- Provide direct QR pairing to the mobile route from the desktop connection modal.

**Non-Goals:**
- Complex multi-point perspective crop manipulation or corner handle dragging on mobile (intended for the desktop canvas).
- Batch photo export or directory browsing on mobile (file validation and saving occurs on the PC).
- Native iOS / Android app distribution (remains a pure zero-install web application running over LAN).

## Decisions

### 1. Dedicated Mobile Route (`/mobile`) vs Responsive Media Query Overhaul
- **Decision**: Introduce a standalone `/mobile` route serving lightweight static assets (`static/mobile.html`, `static/css/mobile.css`, `static/js/mobile.js`).
- **Rationale**: Keeps the mobile experience extremely fast (< 25 KB total assets), avoiding the heavy coordinate canvas, floating toolbars, and desktop modal trees. This eliminates layout thrashing and viewport zoom bugs common in complex canvas web apps on iOS Safari.
- **Alternatives considered**:
  - *Responsive media query view toggles in existing `index.html`*: Causes heavy DOM bloat on phones, increases bundle size, and risks regressions to the existing desktop/tablet layout.

### 2. Physical Swap Cue & Scan Loop UX
- **Decision**: When a scan completes, trigger a distinct completion sequence:
  - Haptic feedback via `navigator.vibrate([100, 50, 100])` where supported (Android Chrome).
  - High-contrast visual cue: banner transitions to green "Ready for Next Scan / Pronto para a próxima foto", accompanied by an optional subtle Web Audio chime.
  - Scan button transitions to "Scan Next Page (#N)".
- **Rationale**: Scanning a flatbed at 300–600 DPI takes between 8 and 25 seconds depending on hardware. Tactile and visual feedback allows the user to look away or organize physical prints and be notified immediately when the carriage finishes.
- **Alternatives considered**: Silent state change only. Discarded because users would have to continuously monitor the screen to know when the scanner is done.

### 3. Real-Time Synchronization Protocol
- **Decision**: The mobile interface participates in the existing WebSocket (`/ws`) protocol. When `/api/scan` returns a new `scan_id`, the mobile app appends the page to the session and broadcasts `session_update` over WebSocket. The desktop UI automatically updates its pages strip and initiates OpenCV photo detection on the host.
- **Rationale**: Zero changes to the core session architecture. When the user returns to the computer, all scans are already cached, detected, and ready for fine-tuning.

### 4. Desktop QR Pairing Flow
- **Decision**: Update `/api/server-info` to return `mobile_url` (`http://<ip>:8321/mobile`) and update the desktop QR modal to display options for both "Mobile Remote (Smartphone)" and "Full Interface (Tablet/PC)".
- **Rationale**: Scanning the QR code with an iPhone or Android camera app immediately opens the optimized mobile interface without requiring manual URL editing.

## Risks / Trade-offs

- **[Risk: iOS Safari restricts Vibration API]** → **Mitigation**: iOS Safari ignores `navigator.vibrate`. Supplement vibration with a prominent pulse animation, color transitions, and optional Web Audio API click/chime.
- **[Risk: Mobile device sleep / screen lock during long scanning sessions]** → **Mitigation**: Request Screen Wake Lock API (`navigator.wakeLock.request('screen')`) when active so the screen stays on while at the scanner, and fetch `/api/session` upon page visibility change to sync any missed updates.
- **[Risk: Accidental multiple taps triggering concurrent scans]** → **Mitigation**: Lock the scan button immediately on initial tap, displaying an active scanning spinner and elapsed timer until the hardware finishes.
