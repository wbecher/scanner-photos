# Proposal

## Why

When scanning multiple photos arranged in asymmetric or non-grid layouts on a flatbed scanner (such as 3 photos placed with 1 horizontal and 2 vertical, or photos placed close to the edges of the glass), auto-detection frequently produces degraded results. In current scans, photos positioned near the scanner glass bezel can become bridged to dark rail/shadow artifacts—often caused by aggressive dilation—resulting in an oversized bounding box that spans the entire scan height instead of isolating each individual photograph. Enhancing the detection pipeline ensures accurate, automatic cropping for arbitrary photo arrangements, orientations, and quantities without requiring manual correction.

## What Changes

- **Flatbed Bezel & Margin Artifact Suppression**: Prevent scanner frame, glass edge, and bezel shadows from bridging to adjacent photo contours.
- **Tuned Morphological Processing**: Eliminate over-aggressive dilation that falsely connects nearby photos or photos near flatbed edges, relying on shape-preserving morphological closing.
- **Asymmetric Layout & Multi-Item Separation**: Improve detection of photos arranged with mixed orientations (e.g. 1 landscape, 2 portrait) and different positions across the bed.
- **Contour Solidity & Rectangularity Verification**: Evaluate candidate contours by their rectangular solidity (`contour_area / rect_area`) and aspect ratio to identify and split/discard spurious edge artifacts or bridged clusters.
- **Robust Corner & Quadrilateral Fitting**: Ensure sub-pixel quad corners and deskew angles are accurately computed for each detected photograph.
- **Backward-Compatible Output**: Preserve the existing `detect_photos` return contract (`id`, `corners`, `width`, `height`, `angle`, `confidence`) so frontend session handling and API endpoints operate without changes.

## Capabilities

### New Capabilities
- `photo-detection`: Automatic multi-photo segmentation, contour isolation, and quad extraction on scanner flatbeds supporting arbitrary asymmetric placements, edge proximity, and mixed orientations.

### Modified Capabilities
<!-- None -->

## Impact
- **Backend Core**: Updates `src/scanner_photos/vision.py` (`detect_photos`).
- **Testing**: Adds test fixtures and assertions in `tests/test_vision.py` covering asymmetric 3-photo layouts and edge proximity.
- **Performance & API**: Keeps fast processing time (operating on downscaled working representation) and preserves existing JSON schema for `/api/detect`.
