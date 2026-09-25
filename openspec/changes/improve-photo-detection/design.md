# Design

## Context

The current photo detection pipeline in `src/scanner_photos/vision.py` downscales scanned flatbeds to a working resolution (max 1600px), estimates the flatbed background (e.g. white lid vs dark pad), creates a binary mask using intensity difference and Canny edges, applies morphological closing, and executes `cv2.dilate`.

When photos are placed asymmetrically or in irregular quantities (such as 3 photos: 1 horizontal on top, 2 vertical on bottom), two primary failure modes occur:
1. Flatbed glass rails and bezel shadows along the image perimeter produce thin continuous edge lines.
2. The aggressive `cv2.dilate` operation expands the white masks, bridging photos situated near the flatbed border directly into the perimeter shadow line. This results in a massive contour spanning the entire scanner height (0 to 1600px).
3. Closely placed photos can also be bridged together by over-dilation.

## Goals / Non-Goals

**Goals:**
- Eliminate false contour bridging between photos and flatbed scanner borders/rails.
- Reliably detect asymmetric arrangements (such as 3 photos in mixed orientations, e.g. 1 landscape + 2 portrait).
- Keep processing deterministic, lightweight, and fast (<300ms) using OpenCV on downscaled representations.
- Maintain full compatibility with existing frontend payloads and API contracts.

**Non-Goals:**
- Heavy deep learning or neural network object detection models (YOLO, Mask R-CNN, etc.), which would add substantial binary size and require GPU acceleration.
- Altering manual crop manipulation tools in the frontend.

## Decisions

### Decision 1: Replace Post-Closing Dilation with Clean Morphological Closing
- **Rationale**: `cv2.morphologyEx(..., MORPH_CLOSE)` already fills holes and merges internal texture variations inside photographs without dilating the external perimeter. The subsequent `cv2.dilate` was causing borders to expand by ~8px, bridging gaps between photos and flatbed edges.
- **Alternatives considered**:
  - *Keep dilate but add erode (closing by reconstruction)*: Unnecessary extra pass when a properly sized closing kernel (9x9 to 11x11) achieves uniform fill without boundary growth.

### Decision 2: Flatbed Perimeter Bezel & Rail Suppression
- **Rationale**: Flatbed scanners inevitably produce shadow lines or glass bevel edges along the extreme margins (x=0, x=width, y=0, y=height). Suppressing a narrow border zone (e.g. 4-6px on working resolution) from edge detection, or filtering contours whose bounding rect spans >95% of a dimension while having a narrow width (<25px), stops edge rails from ever connecting to photo contours.
- **Alternatives considered**:
  - *Cropping the scanned image itself*: Undesirable because users sometimes place photos flush against the flatbed glass guide rulers. Masking out edge artifacts in the binary detection mask preserves the photo image data.

### Decision 3: Contour Solidity and Rectangularity Validation
- **Rationale**: Photographs are rigid rectangles. When segmented properly, their solidity (`contourArea / minAreaRectArea`) is typically > 0.85. Contours formed by edge bridging or irregular shadows have low solidity or extreme aspect ratios (> 6.0). Enforcing geometric validity checks prevents false positives.
- **Alternatives considered**:
  - *Convex hull only*: Over-simplifies concave corners without verifying if the underlying shape is truly rectangular.

### Decision 4: Multi-Photo Centroid Ordering
- **Rationale**: Order detected photos intuitively (top-to-bottom, left-to-right) using centroid clustering or row-bucketing so photo numbering (`photo_1`, `photo_2`, `photo_3`) remains predictable and logical for users.

## Risks / Trade-offs

- **[Risk]** Very light photo borders matching the flatbed lid color might be under-segmented.
  - **Mitigation**: Combine background difference thresholding with Canny edge detection and optional `has_borders` sensitivity adjustment.
- **[Risk]** Photos placed touching each other edge-to-edge.
  - **Mitigation**: Closing kernel size is constrained to 11x11, preventing bridging across visible gaps. If contours have abnormally large areas with low rectangular solidity, contour approximation or corner detection can be leveraged.
