# Proposal

## Why

While automatic photo detection reliably identifies contours and orientation, photos placed close together, slightly bent, or with irregular white/black borders often require subtle manual corner repositioning. Currently, users must click and drag tiny corner handles across a full-page overview canvas where fingers or mouse pointers obscure the exact photo edge, making sub-pixel or pixel-perfect alignment difficult and tedious.

## What Changes

- **Interactive Magnifying Loupe (HUD)**: When clicking or dragging a corner handle on the canvas, display a real-time magnifying loupe (HUD inset) rendering a high-resolution zoomed view (e.g. 2x–4x or 1:1 scanner resolution) centered directly on the corner vertex with clear crosshair guides.
- **Sequential Corner Focus & Auto-Pan (TAB Cycling)**: When a photo is selected, pressing `Tab` (or `Shift+Tab`) cycles focus through its four corners (Top-Left, Top-Right, Bottom-Right, Bottom-Left), centering the canvas viewport directly on the active corner at 1:1 (or 2:1) scale with a prominent visual focus ring.
- **Keyboard Pixel Nudging**: Allow arrow keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) to nudge the focused corner by 1 pixel (or 10 pixels with `Shift`) for precise micro-adjustments without mouse jitter.
- **Configurable Keyboard Shortcuts**: Provide a dedicated "Keyboard Shortcuts" section in the application Settings modal allowing users to customize shortcut keys (Cycle Corner, Reverse Cycle, Nudge, Toggle Loupe, Exit Focus) and loupe zoom preferences, persisted to settings.
- **Touch & Tablet Compatibility**: Ensure the magnifying loupe floats offset from touch contact points so fingers do not obstruct the zoomed view on mobile/tablet devices.

## Capabilities

### New Capabilities
- `corner-adjustment`: Covers magnifying loupe visualization during corner dragging, sequential corner navigation (TAB cycling) with viewport centering at high zoom, pixel-accurate keyboard nudging, and configurable shortcut keybindings in settings.

### Modified Capabilities
<!-- None: existing photo-detection and mobile-remote-scan requirement contracts remain intact. -->

## Impact

- **Frontend Canvas (`static/js/canvas.js`)**: Add loupe HUD rendering, active corner focus state, viewport auto-pan to corner coordinates, and keyboard nudge methods.
- **Frontend App & UI (`static/js/app.js`, `static/index.html`, `static/css/style.css`)**: Handle keydown listeners for TAB/Shift+TAB and arrow keys when canvas or photo cards are active; add keyboard shortcuts section to Settings modal; add i18n localization keys.
- **Backend Settings (`src/scanner_photos/main.py`)**: Include default shortcut keybindings and loupe settings in `DEFAULT_SETTINGS` dictionary and `settings.json`.
