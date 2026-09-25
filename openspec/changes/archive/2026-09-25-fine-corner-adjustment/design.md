# Design

## Context

The scanner photos application allows users to preview flatbed scans and manually manipulate four corner handles per detected photo. The current canvas implementation (`static/js/canvas.js`) supports mouse dragging, pinch-to-zoom, and box selection, but lacks precision visual feedback when corners are adjusted.

See `proposal.md` for motivation and `specs/corner-adjustment/spec.md` for functional requirements.

## Goals / Non-Goals

**Goals:**
- Provide zero-latency, high-magnification visual feedback during corner drag via an in-canvas magnifying loupe HUD.
- Enable full hands-on-keyboard corner navigation (`Tab` / `Shift+Tab`) with viewport centering at 1:1 scanner resolution.
- Enable directional pixel-level nudging via arrow keys with accelerated shift modifiers.
- Make all keybindings and loupe zoom parameters user-configurable through the Settings modal.
- Ensure smooth touch/tablet support by floating the loupe above touch points.

**Non-Goals:**
- Arbitrary n-gon polygon editing (photos are constrained to 4-corner quadrilaterals).
- Automatic edge-snapping or computer vision redetection on every nudge (computations remain client-side until debounced crop preview sync).

## Decisions

### Decision 1: In-Canvas Loupe Rendering vs. Separate DOM Overlay
- **Chosen Approach**: Render the magnifying loupe directly on the HTML5 2D canvas at the end of the `ScanCanvas.render()` pass.
- **Rationale**:
  - Eliminates DOM layout thrashing and synchronizes perfectly with the 60fps canvas dragging loop.
  - Allows circular clipping (`ctx.arc()`, `ctx.clip()`), crisp crosshair rendering, shadow borders, and sub-pixel sampling from `this.image` in a single paint operation.
- **Alternatives Considered**:
  - *Secondary DOM Canvas / Floating Div*: Adds z-index management, CSS transform sync overhead, and border clipping issues across full-screen layouts.

### Decision 2: Viewport Auto-Panning on Corner Focus
- **Chosen Approach**: When `Tab` cycles to a corner, calculate the target screen center for `box.corners[focusedCornerIndex]`, animate or immediately translate `panX`/`panY`, and set `scale` to at least 1.0 (1:1 image pixel to screen pixel, or user-selected zoom level).
- **Rationale**: Gives users immediate macro clarity of the corner position without requiring manual zoom and pan before nudging.
- **Alternatives Considered**:
  - *Keep current zoom level*: If the user is zoomed out viewing an entire A4 page, cycling corners without zooming makes nudging by 1px imperceptible.

### Decision 3: Keyboard Event Capture & Configurable Shortcuts
- **Chosen Approach**:
  - Store shortcut configurations in `DEFAULT_SETTINGS` under a `shortcuts` dictionary (`cycle_corner: "Tab"`, `nudge_up: "ArrowUp"`, etc.).
  - Listen in `window.addEventListener("keydown")` inside `canvas.js`, verifying `e.target` is not an input or textarea. Prevent default browser behavior for `Tab` only when a box/corner is focused.
  - Settings UI captures key presses via a dedicated key-recorder input or accessible selects, persisting via `/api/settings`.
- **Alternatives Considered**:
  - *Hardcoded keybindings*: Restricts international keyboard layouts and accessibility tools.

### Decision 4: Debouncing Preview Updates on Keyboard Nudge
- **Chosen Approach**: As the user taps arrow keys to nudge, recompute quadrilateral coordinates and repaint the canvas instantly, while debouncing the `/api/preview-crop` call and session sync by 250ms.
- **Rationale**: Keeps rendering instantaneous while preventing server API flooding during rapid key presses.

## Risks / Trade-offs

- **[Risk]**: The loupe HUD might occlude adjacent photos or render offscreen near canvas edges.
  - **Mitigation**: Implement edge detection in `drawLoupe()`: if the cursor is near the top or right canvas edge, dynamically flip the loupe position to the bottom or left.
- **[Risk]**: `Tab` key conflict with normal web accessibility navigation.
  - **Mitigation**: Only intercept `Tab` when the user has actively clicked or selected a photo box on the canvas; pressing `Escape` or clicking outside clears corner focus and restores standard browser tab navigation.

## Migration Plan

- Settings schema is backward-compatible; missing `shortcuts` keys automatically populate with defaults in `DEFAULT_SETTINGS`.
