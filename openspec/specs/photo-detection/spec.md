# photo-detection Specification

## Purpose
Automatically segments, isolates, and detects individual photos on a scanner flatbed, handling asymmetric arrangements, edge proximity, variable orientations, and multiple items.

## Requirements

### Requirement: Asymmetric multi-photo detection
The system SHALL detect all individual photos placed on the flatbed regardless of whether they are arranged symmetrically or asymmetrically (including mixed landscape and portrait orientations, such as 1 horizontal photo and 2 vertical photos).

#### Scenario: Scan containing three asymmetrically placed photos
- **WHEN** an image containing three photos (one landscape orientation on top and two portrait orientations side-by-side below) is processed for detection
- **THEN** the system returns exactly three distinct photo items, each bounding one of the three photographs.

### Requirement: Flatbed edge and bezel shadow isolation
The system SHALL suppress flatbed glass border shadows, bezel frames, and scanner rail artifacts, preventing them from bridging with photos positioned near the scanner edges.

#### Scenario: Photo placed adjacent to flatbed border
- **WHEN** a photograph is placed close to or against the flatbed glass edge
- **THEN** the detected bounding quadrilateral outlines the photograph itself and does not stretch across the scan boundary or merge with the flatbed rail shadow.

### Requirement: Contour shape and cluster separation
The system SHALL evaluate candidate contours using geometric criteria including area, solidity, and aspect ratio to ensure nearby photos are not fused into a single bounding box and thin edge artifacts are rejected.

#### Scenario: Closely situated photos
- **WHEN** two photographs are placed in close proximity on the scanner glass
- **THEN** the segmentation preserves the boundary between them and outputs individual bounding quadrilaterals for each photograph.

### Requirement: Quadrilateral geometry and deskew output
The system SHALL calculate sub-pixel corner coordinates ordered clockwise [top-left, top-right, bottom-right, bottom-left] and compute rotation angle in degrees for each detected photograph.

#### Scenario: Individual photo quadrilateral generation
- **WHEN** a photograph is detected on the flatbed
- **THEN** the resulting photo entry contains full-resolution corner coordinates, calculated width and height, deskew angle, and detection confidence.
