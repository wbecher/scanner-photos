# Tasks

## 1. Backend Settings & Default Shortcuts

- [x] 1.1 Extend `DEFAULT_SETTINGS` in `src/scanner_photos/main.py` with default keyboard shortcuts (`cycle_corner: "Tab"`, `cycle_corner_reverse: "Shift+Tab"`, `nudge_up: "ArrowUp"`, `nudge_down: "ArrowDown"`, `nudge_left: "ArrowLeft"`, `nudge_right: "ArrowRight"`, `exit_focus: "Escape"`) and loupe preferences (`loupe_zoom: 3.0`, `loupe_size: 140`), verifying with unit test.
- [x] 1.2 Update settings API tests in `tests/test_api.py` to verify that custom shortcut configurations and loupe parameters are correctly saved and retrieved via `/api/settings`.

## 2. Canvas Magnifying Loupe HUD

- [x] 2.1 Implement `drawLoupe()` in `static/js/canvas.js` to render a high-magnification circular HUD with source image sampling, crosshair guides, and canvas boundary collision detection during corner drag.
- [x] 2.2 Add touch-specific offset calculations in `canvas.js` to position the loupe HUD above or beside finger touch points without obstruction.

## 3. Keyboard Corner Cycling & Viewport Pan (TAB & Arrow Keys)

- [x] 3.1 Implement corner focus tracking (`focusedCornerIndex`), visual focus indicator ring in `drawBox()`, and `focusNextCorner(reverse)` in `static/js/canvas.js` with auto-panning and 1:1 zoom centering on the active corner.
- [x] 3.2 Implement `nudgeFocusedCorner(dx, dy)` in `static/js/canvas.js` for single-pixel arrow nudging and 10-pixel shift-arrow nudging, recomputing quadrilateral geometry and angle in real time.
- [x] 3.3 Connect keydown listener in `static/js/canvas.js` to handle `Tab`, `Shift+Tab`, arrow keys, and `Escape` based on active shortcuts, ensuring text inputs and modals are not blocked.

## 4. Settings UI & Localization

- [x] 4.1 Add "Keyboard Shortcuts & Loupe Settings" section to the Settings modal in `static/index.html` with shortcut inputs, loupe magnification controls, and a "Reset to Defaults" button.
- [x] 4.2 Implement shortcut binding capture, settings serialization, and dynamic update to `scanCanvas` in `static/js/app.js`.
- [x] 4.3 Add Portuguese and English i18n translation strings for all new shortcut settings and loupe labels in `static/js/app.js`.

## 5. Verification & Integration

- [x] 5.1 Run full Python test suite (`.venv/bin/pytest`) and JS syntax checks (`node -c`) to verify zero regressions.
- [x] 5.2 Validate end-to-end interactive workflow: corner drag displays loupe HUD, TAB cycles corners with 1:1 auto-pan, arrows nudge corners, and custom shortcuts function as configured.
