# Photo Scanner & Deskew 📸

A high-performance multi-photo scanning, auto-detection, cropping, and deskewing application designed for Linux desktop.

Scan multiple photos placed at arbitrary angles on a flatbed scanner in a single pass, auto-straighten them, review and validate them in batch, and export high-resolution individual image files with embedded DPI metadata.

---

## ✨ Features

- **Automated Multi-Photo Detection**:
  - Automatically identifies multiple photos placed simultaneously on a scanner flatbed.
  - Handles tilted and rotated prints using sub-pixel perspective transformation (`cv2.warpPerspective` with Lanczos interpolation).
  - Robust edge detection and morphological filtering supporting both light (white lid) and dark backgrounds.
- **Multi-Page Batch Sessions**:
  - Scan multiple sheets/pages consecutively in one workflow.
  - Visual **Pages Strip** displays thumbnails, page numbering, and detected photo count per page.
  - Seamlessly switch between pages to inspect and adjust crop boxes on the interactive canvas.
  - Multi-file upload support (`Open File`) to import batches of scanned flatbed images at once.
- **Hands-Free Keyboard Shortcut**:
  - Press <kbd>Space</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to immediately trigger the scan of the next page while swapping prints at the flatbed scanner.
  - Intelligent protection prevents accidental triggers while typing in text inputs or while scanning is in progress.
- **Interactive Fine-Tuning Canvas**:
  - Smooth pan and zoom (scroll wheel, `+`, `-`, fit to screen).
  - Drag corners to fine-tune perspective quadrilateral coordinates.
  - Manual box creation (`Add Box`) and deletion.
  - Live rotation (90° CW/CCW), fine angle adjustment slider, and margin trim.
- **Unified Photo Validation & Review**:
  - Consolidated gallery view showcasing **all identified photos across all pages**.
  - Checkbox toggle to include or exclude photos from the export batch.
  - Per-photo quick rotation, renaming, and "Adjust Crop" button to jump directly to the canvas coordinate.
  - Filter tabs by page and bulk actions ("Select All" / "Deselect All").
- **Batch Naming with Tokens**:
  - Apply naming masks across all photos: `{date}`, `{index:03d}`, `{page}`.
  - Example: `Family_Trip_{date}_{index:03d}` becomes `Family_Trip_20260923_001.jpg`, `002.jpg`, etc.
- **Native Linux Directory Picker**:
  - Click **"📁 Browse..."** to select output directories using the native Linux desktop file dialog (`zenity`).
  - Shortcut button **"Open Folder"** opens the exported folder in your native Linux file manager (`xdg-open`).
- **Flexible Export Settings**:
  - Resolutions from 75 DPI up to 1200 DPI.
  - Formats: JPEG (customizable compression quality), PNG (lossless), and TIFF (archival).
  - Embedded DPI resolution metadata via Pillow.
- **Bi-Lingual Interface**:
  - Built-in instant switching between **English** and **Português**.
- **Offline Demo Mode**:
  - Built-in multi-page demo scanner simulator allows testing all detection, review, and export features without physical scanner hardware.

---

## 🛠️ Prerequisites

### Linux System Packages
Ensure SANE (Scanner Access Now Easy) and Zenity are installed:

```bash
# Arch Linux / Manjaro
sudo pacman -S sane zenity

# Debian / Ubuntu / Linux Mint
sudo apt update && sudo apt install -y sane sane-utils zenity

# Fedora
sudo dnf install sane-backends sane-backends-drivers-scanners zenity
```

Verify your scanner is detected by SANE:
```bash
scanimage -L
```

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/wbecher/scanner-photos.git
cd scanner-photos
```

### 2. Launch the Application
Run the launcher script:
```bash
./run.sh
```

`run.sh` will automatically:
1. Create a Python virtual environment using `uv` (or standard venv).
2. Install the package dependencies.
3. Start the FastAPI server on `http://localhost:8321`.
4. Open the interface in native app window mode via Chromium, or launch your default web browser.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Space</kbd> / <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Scan next flatbed page |
| <kbd>V</kbd> | Open Photo Validation & Review gallery |
| <kbd>+</kbd> / <kbd>=</kbd> | Zoom in |
| <kbd>-</kbd> | Zoom out |
| <kbd>0</kbd> | Fit flatbed to screen |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete selected photo box |
| <kbd>Esc</kbd> | Close open modal (Validation / Settings) |

---

## 📁 Project Structure

```text
scanner-photos/
├── src/
│   └── scanner_photos/
│       ├── __init__.py
│       ├── main.py          # FastAPI application, REST endpoints & static server
│       ├── scanner.py       # SANE / scanimage hardware integration
│       └── vision.py        # OpenCV photo detection, deskewing & PIL export
├── static/
│   ├── index.html           # Single-page application UI
│   ├── css/
│   │   └── style.css        # Modern dark-mode styling
│   └── js/
│       ├── app.js           # Client orchestration & multi-page session state
│       ├── canvas.js        # Interactive HTML5 Canvas coordinate editor
│       └── i18n.js          # Internationalization dictionary (EN / PT)
├── tests/
│   ├── test_api.py          # FastAPI endpoints & batch export tests
│   └── test_vision.py       # Computer vision deskew and detection unit tests
├── pyproject.toml           # Project metadata & Python dependencies
├── run.sh                   # App startup & desktop launcher script
├── scanner-photos.desktop   # Linux desktop application entry
└── README.md
```

---

## 🧪 Running Automated Tests

Run the test suite with `pytest`:

```bash
.venv/bin/pytest
```

---

## 📄 License

MIT License. Feel free to use, modify, and distribute.
