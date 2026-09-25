import pytest
import numpy as np
import cv2
import os
from scanner_photos.vision import (
    order_quad_points,
    detect_photos,
    crop_and_deskew,
    save_photo
)
from PIL import Image


def test_order_quad_points():
    # Unordered points
    pts = np.array([
        [100, 200], # bl
        [100, 100], # tl
        [300, 200], # br
        [300, 100]  # tr
    ])
    ordered = order_quad_points(pts)
    assert np.allclose(ordered[0], [100, 100]) # tl
    assert np.allclose(ordered[1], [300, 100]) # tr
    assert np.allclose(ordered[2], [300, 200]) # br
    assert np.allclose(ordered[3], [100, 200]) # bl


def test_detect_multiple_tilted_photos():
    # Create simulated flatbed scanner image with white lid
    bed = np.full((1800, 1400, 3), 248, dtype=np.uint8)

    def draw_rotated_rect(img, center, size, angle_deg, color):
        w, h = size
        rect = (center, (w, h), angle_deg)
        box = cv2.boxPoints(rect)
        box = np.int32(box)
        cv2.fillPoly(img, [box], color)
        # Inner pattern to emulate photo contents
        cv2.circle(img, (int(center[0]), int(center[1])), min(w, h)//4, (120, 80, 210), -1)

    # Place 4 photos tilted at various angles
    draw_rotated_rect(bed, (350, 420), (320, 450), 10, (50, 120, 200))
    draw_rotated_rect(bed, (1000, 450), (340, 460), -8, (70, 180, 90))
    draw_rotated_rect(bed, (400, 1250), (360, 480), -14, (210, 120, 60))
    draw_rotated_rect(bed, (1020, 1280), (330, 440), 7, (190, 80, 180))

    results = detect_photos(bed, min_area_ratio=0.015, sensitivity=0.5)

    assert len(results) == 4
    for photo in results:
        assert len(photo["corners"]) == 4
        assert photo["width"] > 250
        assert photo["height"] > 250


def test_crop_and_deskew():
    # Create an image with an intentionally tilted rectangle containing text/color
    img = np.full((800, 800, 3), 255, dtype=np.uint8)
    rect = ((400, 400), (200, 300), 20) # 200x300 rectangle tilted 20 degrees
    box = cv2.boxPoints(rect)
    box = np.int32(box)
    cv2.fillPoly(img, [box], (100, 150, 220))

    cropped = crop_and_deskew(img, box.tolist())
    h, w = cropped.shape[:2]

    # Should be close to 200x300 or 300x200
    assert abs(w - 200) < 5 or abs(w - 300) < 5
    assert abs(h - 300) < 5 or abs(h - 200) < 5


def test_save_photo_with_dpi(tmp_path):
    dummy_img = np.zeros((100, 100, 3), dtype=np.uint8)
    out_file = str(tmp_path / "test_photo.jpg")

    save_photo(dummy_img, out_file, dpi=600, format="JPEG", quality=95)

    assert os.path.exists(out_file)
    with Image.open(out_file) as im:
        dpi = im.info.get("dpi")
        assert dpi is not None
        assert int(round(dpi[0])) == 600


def test_detect_asymmetric_three_photos_with_edge_shadow():
    # Simulate a scanner flatbed (height=1600, width=1200) with white lid
    bed = np.full((1600, 1200, 3), 245, dtype=np.uint8)

    # Simulate flatbed right bezel shadow (thin strip along extreme right edge)
    bed[:, 1194:1200] = (40, 40, 40)

    # Photo 1: Landscape orientation on top (centered)
    bed[100:450, 200:850] = (40, 90, 160)
    # Photo 2: Portrait orientation on bottom-left
    bed[650:1350, 100:550] = (70, 150, 60)
    # Photo 3: Portrait orientation on bottom-right (close to right edge/bezel)
    bed[650:1350, 650:1120] = (160, 80, 120)

    results = detect_photos(bed, min_area_ratio=0.015, sensitivity=0.5)

    # Exactly 3 photos should be detected
    assert len(results) == 3

    # Check natural top-to-bottom, left-to-right order
    # Photo 1 should be the top photo
    p1 = results[0]
    p2 = results[1]
    p3 = results[2]

    # Verify no photo spans full height (which happened before when bridging to bezel)
    for p in results:
        assert p["height"] < 1400
        assert p["width"] < 1100

    # p1 is on top (centroid y around 275)
    corners1 = np.array(p1["corners"])
    cy1 = corners1[:, 1].mean()
    assert cy1 < 500

    # p2 is bottom-left, p3 is bottom-right
    corners2 = np.array(p2["corners"])
    corners3 = np.array(p3["corners"])
    cx2 = corners2[:, 0].mean()
    cx3 = corners3[:, 0].mean()
    assert cx2 < cx3


def test_real_scan_asymmetric_3photos_if_present():
    real_scan_path = "scans/scan_20260925_112537_600dpi.png"
    if not os.path.exists(real_scan_path):
        pytest.skip("Sample scan file not present")

    img = cv2.imread(real_scan_path)
    results = detect_photos(img)

    assert len(results) == 3
    # Verify neither photo erroneously spans the flatbed height (7016px)
    for p in results:
        assert p["height"] < 5000
        assert p["width"] < 5000

