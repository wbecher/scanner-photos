# mobile-remote-scan Specification

## Purpose
Provides a lightweight, touch-optimized mobile web console for smartphones to trigger sequential flatbed scans, manage active session pages, and synchronize in real-time with the desktop editing workstation.

## Requirements

### Requirement: Dedicated Mobile Remote Route
The system SHALL provide a dedicated mobile remote web interface accessible at `/mobile`, optimized for smartphone viewports and one-handed operation.

#### Scenario: Opening mobile remote interface
- **WHEN** a user visits `/mobile` in a smartphone web browser
- **THEN** the server returns a streamlined mobile remote web application that displays hardware controls and scan session actions without loading the desktop multi-point canvas or desktop sidebars.

### Requirement: Sequential Scan Trigger from Mobile
The mobile remote SHALL provide a primary scan button to trigger scans sequentially while standing at the physical scanner hardware, with clear state feedback.

#### Scenario: Initiating a scan from mobile
- **WHEN** the user taps the primary scan button on the mobile remote
- **THEN** the system triggers a hardware scan on the host PC, disables repeat clicks, and displays active scanning progress.

#### Scenario: Scan completion and swap cue
- **WHEN** a scan completes successfully
- **THEN** the mobile remote displays a visual completion cue, triggers haptic vibration on supported devices, and updates the scan button to indicate readiness for the next page.

### Requirement: Mobile Scan Session Reel and Page Counter
The mobile remote SHALL display the active session's scanned page count and a sequential thumbnail strip of pages scanned during the session.

#### Scenario: Displaying scanned page count and thumbnails
- **WHEN** scans are completed in the current session
- **THEN** the mobile remote updates the total page counter and renders thumbnail previews for each scanned page in sequence.

#### Scenario: Deleting the last scanned page
- **WHEN** the user taps the delete action on the most recently scanned page
- **THEN** the page is removed from the active session cache on the server, and the mobile page counter and reel update immediately.

### Requirement: Essential Hardware Settings on Mobile
The mobile remote SHALL allow users to view and modify essential scan settings including the active scanner device, DPI resolution, and color mode.

#### Scenario: Selecting DPI resolution on mobile
- **WHEN** the user selects a DPI setting (such as 300 or 600 DPI) from the mobile controls
- **THEN** subsequent scans triggered from the mobile remote use the selected DPI value.

### Requirement: Real-Time Session Synchronization with Desktop
All scans triggered from the mobile remote SHALL be saved to the persistent server session cache and broadcast over WebSocket to any connected desktop clients.

#### Scenario: Live synchronization to PC workstation
- **WHEN** a scan triggered from the mobile remote completes
- **THEN** connected desktop clients receive a WebSocket session update, display the new page in the desktop pages strip, and automatically run photo boundary detection.

### Requirement: Mobile Quick Pairing via Desktop QR Code
The desktop application SHALL provide a QR code and URL pointing directly to the mobile remote interface (`/mobile`) for instant pairing via smartphone camera.

#### Scenario: Scanning QR code from desktop
- **WHEN** the user opens the remote connection modal on the desktop PC
- **THEN** the desktop displays a QR code that encodes the direct mobile URL (`http://<HOST_IP>:8321/mobile`) and allows copying the link.
