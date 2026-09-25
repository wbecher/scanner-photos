import cv2
import numpy as np
from PIL import Image
from typing import List, Dict, Any, Tuple, Optional
import os


def order_quad_points(pts: np.ndarray) -> np.ndarray:
    """
    Orders 4 points in clockwise order:
    [top-left, top-right, bottom-right, bottom-left]
    """
    pts = np.asarray(pts, dtype=np.float32)
    rect = np.zeros((4, 2), dtype=np.float32)

    # Sum of coordinates: top-left has smallest sum, bottom-right has largest sum
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    # Difference of coordinates: top-right has smallest diff (x - y max or y - x min)
    diff = pts[:, 1] - pts[:, 0]
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]

    return rect


def detect_photos(
    image: np.ndarray,
    min_area_ratio: float = 0.015,
    max_area_ratio: float = 0.95,
    sensitivity: float = 0.5,
    has_borders: bool = False,
) -> List[Dict[str, Any]]:
    """
    Automatically detects individual photos placed on a scanner flatbed.
    Returns a list of detected bounding quadrilaterals with full-res coordinates.
    """
    orig_h, orig_w = image.shape[:2]
    total_area = orig_h * orig_w

    # Resize to working resolution for fast and noise-resistant contour detection
    max_dim = 1600
    scale = 1.0
    if max(orig_h, orig_w) > max_dim:
        scale = max_dim / float(max(orig_h, orig_w))
        working_w = int(orig_w * scale)
        working_h = int(orig_h * scale)
        small = cv2.resize(image, (working_w, working_h), interpolation=cv2.INTER_AREA)
    else:
        small = image.copy()
        working_w, working_h = orig_w, orig_h

    # Convert to grayscale and blur
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)

    # Estimate background lid color by sampling borders (top 15px, bottom 15px, left 15px, right 15px)
    border_pixels = np.concatenate([
        blurred[:15, :].flatten(),
        blurred[-15:, :].flatten(),
        blurred[:, :15].flatten(),
        blurred[:, -15:].flatten(),
    ])
    bg_median = float(np.median(border_pixels))
    is_light_bg = bg_median > 128

    # Adaptive thresholding and Otsu thresholding
    if is_light_bg:
        diff_from_bg = cv2.subtract(np.full_like(blurred, int(bg_median)), blurred)
        # Threshold: anything significantly darker or different than lid
        thresh_val = int(25 * (1.2 - sensitivity * 0.4))
        _, thresh = cv2.threshold(diff_from_bg, thresh_val, 255, cv2.THRESH_BINARY)
        # Add Canny edge detection to catch subtle borders
        edges = cv2.Canny(blurred, 30, 100)
        combined = cv2.bitwise_or(thresh, edges)
    else:
        # Dark background (open lid or black pad)
        diff_from_bg = cv2.subtract(blurred, np.full_like(blurred, int(bg_median)))
        thresh_val = int(25 * (1.2 - sensitivity * 0.4))
        _, thresh = cv2.threshold(diff_from_bg, thresh_val, 255, cv2.THRESH_BINARY)
        edges = cv2.Canny(blurred, 30, 100)
        combined = cv2.bitwise_or(thresh, edges)

    # 1. Suppress thin outer border / bezel shadow artifacts at glass edges
    border_margin = 6
    if working_w > 2 * border_margin and working_h > 2 * border_margin:
        mask = np.ones_like(combined, dtype=np.uint8) * 255
        mask[:border_margin, :] = 0
        mask[-border_margin:, :] = 0
        mask[:, :border_margin] = 0
        mask[:, -border_margin:] = 0
        combined = cv2.bitwise_and(combined, mask)

    # 2. Morphological closing to fill holes inside photos and merge internal textures without expanding outer borders
    kernel_size = 11 if not has_borders else 15
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
    closed = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
    # Note: cv2.dilate is intentionally omitted to avoid bridging adjacent photos or flatbed frame shadows

    # Find external contours
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = (working_w * working_h) * min_area_ratio
    max_area = (working_w * working_h) * max_area_ratio

    valid_candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if not (min_area <= area <= max_area):
            continue

        # Get rotated bounding rectangle
        rect = cv2.minAreaRect(cnt)
        (center_x, center_y), (w, h), angle = rect

        # Filter out thin slivers or scanner rail artifacts
        if min(w, h) < 20:
            continue
        aspect = max(w, h) / min(w, h)
        if aspect > 6.0:
            continue

        # Flatbed rail check: discard contours spanning almost entire dimension with narrow width
        if (h >= 0.88 * working_h and w <= 35) or (w >= 0.88 * working_w and h <= 35):
            continue

        # Geometric solidity check: real photos are solid rectangles
        rect_area = w * h
        if rect_area <= 0:
            continue
        solidity = area / rect_area
        if solidity < 0.65:
            continue

        valid_candidates.append({
            "contour": cnt,
            "rect": rect,
            "cx": center_x,
            "cy": center_y,
            "w": w,
            "h": h,
            "area": area,
            "solidity": solidity
        })

    # Sort photos naturally: top-to-bottom, left-to-right with row grouping
    row_band = max(20.0, working_h * 0.12)
    valid_candidates.sort(key=lambda item: (round(item["cy"] / row_band), item["cx"]))

    results: List[Dict[str, Any]] = []
    idx = 1
    for item in valid_candidates:
        rect = item["rect"]
        box = cv2.boxPoints(rect)
        # Scale back to original full-resolution coordinates
        box_full = box / scale
        ordered_box = order_quad_points(box_full)

        # Compute deskew angle
        # OpenCV minAreaRect returns angle in [-90, 0] or [0, 90] depending on version
        # We calculate angle of top edge relative to horizontal
        top_edge = ordered_box[1] - ordered_box[0]
        angle_rad = np.arctan2(top_edge[1], top_edge[0])
        angle_deg = float(np.degrees(angle_rad))

        # Photo width and height in full res
        width_full = float(np.linalg.norm(ordered_box[1] - ordered_box[0]))
        height_full = float(np.linalg.norm(ordered_box[3] - ordered_box[0]))

        results.append({
            "id": f"photo_{idx}",
            "corners": ordered_box.tolist(), # [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
            "width": round(width_full, 1),
            "height": round(height_full, 1),
            "angle": round(angle_deg, 2),
            "confidence": round(min(0.99, max(0.85, item["solidity"])), 2)
        })
        idx += 1

    return results


def crop_and_deskew(
    image: np.ndarray,
    corners: List[List[float]],
    rotation_90_steps: int = 0,
    fine_angle_deg: float = 0.0,
    margin_px: int = 0
) -> np.ndarray:
    """
    Crops and deskews an individual photo from the full-resolution image
    given 4 corner points, using sub-pixel perspective transformation.
    """
    pts = order_quad_points(np.array(corners, dtype=np.float32))

    # Calculate actual width and height of quadrilateral
    tl, tr, br, bl = pts
    width_top = np.linalg.norm(tr - tl)
    width_bottom = np.linalg.norm(br - bl)
    max_w = int(round(max(width_top, width_bottom)))

    height_right = np.linalg.norm(tr - br)
    height_left = np.linalg.norm(tl - bl)
    max_h = int(round(max(height_right, height_left)))

    if max_w < 5 or max_h < 5:
        raise ValueError("Invalid crop dimensions (too small)")

    # Target points for perspective warp (upright rectangle)
    dst_pts = np.array([
        [0, 0],
        [max_w - 1, 0],
        [max_w - 1, max_h - 1],
        [0, max_h - 1]
    ], dtype=np.float32)

    # Perspective warp
    M = cv2.getPerspectiveTransform(pts, dst_pts)
    warped = cv2.warpPerspective(
        image,
        M,
        (max_w, max_h),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REPLICATE
    )

    # Apply 90-degree steps (0, 1 = 90 CW, 2 = 180, 3 = 270 CW)
    steps = rotation_90_steps % 4
    if steps == 1:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)
    elif steps == 2:
        warped = cv2.rotate(warped, cv2.ROTATE_180)
    elif steps == 3:
        warped = cv2.rotate(warped, cv2.ROTATE_90_COUNTERCLOCKWISE)

    # Apply fine angle adjustment if needed
    if abs(fine_angle_deg) > 0.05:
        (h, w) = warped.shape[:2]
        center = (w // 2, h // 2)
        rot_mat = cv2.getRotationMatrix2D(center, fine_angle_deg, 1.0)
        warped = cv2.warpAffine(
            warped,
            rot_mat,
            (w, h),
            flags=cv2.INTER_LANCZOS4,
            borderMode=cv2.BORDER_REPLICATE
        )

    # Apply margin/padding crop if requested
    if margin_px > 0:
        h, w = warped.shape[:2]
        if w > 2 * margin_px and h > 2 * margin_px:
            warped = warped[margin_px:h - margin_px, margin_px:w - margin_px]

    return warped


def save_photo(
    photo: np.ndarray,
    output_path: str,
    dpi: int = 600,
    format: str = "JPEG",
    quality: int = 95
) -> str:
    """
    Saves the cropped photo with high quality and embeds DPI metadata.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    # Convert BGR (OpenCV) to RGB (PIL)
    rgb = cv2.cvtColor(photo, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb)

    fmt_upper = format.upper()
    if fmt_upper in ("JPG", "JPEG"):
        pil_img.save(
            output_path,
            format="JPEG",
            quality=quality,
            dpi=(dpi, dpi),
            subsampling=0
        )
    elif fmt_upper == "PNG":
        pil_img.save(
            output_path,
            format="PNG",
            dpi=(dpi, dpi),
            compress_level=3
        )
    elif fmt_upper in ("TIF", "TIFF"):
        pil_img.save(
            output_path,
            format="TIFF",
            dpi=(dpi, dpi)
        )
    else:
        pil_img.save(output_path, dpi=(dpi, dpi))

    return output_path
