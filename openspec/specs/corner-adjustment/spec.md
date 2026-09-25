# corner-adjustment Specification

## Purpose
Enables pixel-accurate fine-tuning of detected photo quadrilateral corners using an interactive magnifying loupe, keyboard-driven sequential corner focus with 1:1 auto-pan, directional nudge controls, and user-configurable shortcut keybindings.

## Requirements

### Requirement: Interactive Magnifying Loupe on Drag
The system SHALL display a real-time magnifying loupe HUD whenever a photo quadrilateral corner handle is clicked, grabbed, or dragged on the canvas. The loupe SHALL render a magnified view of the source scanner image centered on the corner coordinate with a crosshair target marker.

#### Scenario: Dragging corner with mouse activates loupe
- **WHEN** user clicks and holds down a corner handle of a selected photo box and moves the pointer
- **THEN** the system displays a magnifying loupe window positioned adjacent to the cursor showing a 3x magnified view of the scanner image centered on the corner point with crosshair guides

#### Scenario: Releasing drag dismisses loupe
- **WHEN** user releases the mouse button or lifts touch contact after adjusting a corner
- **THEN** the system hides the magnifying loupe HUD and keeps the corner anchored at the new coordinate

#### Scenario: Touch interaction offsets loupe from finger
- **WHEN** user drags a corner handle using a touch screen or tablet stylus
- **THEN** the system renders the loupe HUD positioned with an offset above or beside the contact point ensuring the user's hand does not obstruct the magnified view

### Requirement: Sequential Corner Navigation via TAB Cycling
When a photo quadrilateral is selected on the canvas, the system SHALL allow the user to cycle active focus sequentially through its four corners using keyboard shortcuts (`Tab` forward and `Shift+Tab` backward), automatically centering the viewport on the focused corner at 1:1 (or higher) zoom.

#### Scenario: Pressing TAB cycles to next corner and centers viewport
- **WHEN** a photo box is selected and the user presses `Tab`
- **THEN** the canvas viewport smoothly pans to center the active view on the next corner (cycling Top-Left, Top-Right, Bottom-Right, Bottom-Left) and zooms to 100% (1:1) scanner scale

#### Scenario: Visual focus ring on active corner
- **WHEN** a specific corner is focused via keyboard cycling
- **THEN** that corner handle displays a distinctive visual focus ring to clearly indicate it is currently active for adjustment

#### Scenario: Reverse cycling with Shift+Tab
- **WHEN** user presses `Shift+Tab` while focusing a corner
- **THEN** the system cycles focus to the previous corner in counter-clockwise order and pans the viewport accordingly

### Requirement: Precision Keyboard Nudging
While a corner handle has active keyboard focus, the system SHALL allow directional arrow keys to nudge the corner position in pixel increments without mouse jitter.

#### Scenario: Single arrow key nudge
- **WHEN** a corner is actively focused and user presses `ArrowUp`, `ArrowDown`, `ArrowLeft`, or `ArrowRight`
- **THEN** the corner position moves by exactly 1 pixel in that direction within image coordinates and the quadrilateral polygon and angle recalculate immediately

#### Scenario: Accelerated nudge with Shift modifier
- **WHEN** user holds `Shift` while pressing an arrow key on a focused corner
- **THEN** the corner position moves by 10 pixels per keypress in that direction

#### Scenario: Debounced preview thumbnail refresh
- **WHEN** user completes a sequence of arrow key nudges
- **THEN** the system triggers preview thumbnail generation and syncs the updated coordinates to session cache

### Requirement: Configurable Keyboard Shortcuts and Loupe Preferences
The system SHALL provide configuration options in the Settings modal to customize keyboard shortcuts for corner navigation, nudging, and loupe behavior, persisting preferences across sessions.

#### Scenario: Customizing shortcut keys in Settings
- **WHEN** user opens Settings and modifies the shortcut keys for corner cycling or nudging and clicks Save Settings
- **THEN** the system persists the custom keybindings to settings storage via `/api/settings` and applies them immediately to canvas keyboard event listeners

#### Scenario: Adjusting loupe zoom magnification factor
- **WHEN** user changes the magnifier magnification level (e.g., from 3x to 4x or 2x) in Settings
- **THEN** subsequent loupe renderings use the updated magnification factor
