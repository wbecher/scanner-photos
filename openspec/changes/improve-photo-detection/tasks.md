# Tasks

## 1. Flatbed Border & Rail Artifact Suppression

- [ ] 1.1 Add perimeter margin masking and scanner rail artifact filtering in `src/scanner_photos/vision.py` to prevent glass bezel shadows from connecting to photo contours; verify by testing detection on flatbed edge border regions.
- [ ] 1.2 Refine morphological processing in `detect_photos()` by removing aggressive post-closing dilation that falsely merges nearby contours; verify contour boundaries maintain separation between closely placed items.

## 2. Multi-Photo Geometry Validation & Ordering

- [ ] 2.1 Implement contour solidity (`contour_area / min_area_rect_area`) and rectangularity checks in `detect_photos()` to validate photos and discard irregular edge slivers; verify with unit tests.
- [ ] 2.2 Enhance spatial ordering of detected photos (top-to-bottom, left-to-right) based on centroid positions; verify that asymmetric 3-photo layouts are numbered predictably.

## 3. Testing & Verification

- [ ] 3.1 Add automated test cases in `tests/test_vision.py` covering asymmetric 3-photo layouts (such as 1 landscape on top, 2 portrait on bottom) and verify detection produces 3 distinct quadrilaterals without oversized full-scan boxes; run `.venv/bin/pytest tests/test_vision.py`.
- [ ] 3.2 Execute the complete test suite via `.venv/bin/pytest` and confirm all 19+ tests pass without regressions.
