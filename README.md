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
3. Start the FastAPI server on `0.0.0.0:8321`, accessible across your local Wi-Fi/LAN network.
4. Display your PC's local IP (`http://192.168.x.x:8321`) and an ASCII QR code in the terminal.
5. Open the interface locally in native app window mode via Chromium, or launch your default web browser.

---

## 📱 Remote Tablet & Server Workflow

You can use your PC as the central scanning and storage server, while using a tablet (iPad, Android, etc.) as your portable scanning station next to the flatbed scanner:

1. **Start the server on your PC**:
   ```bash
   ./run.sh
   # Or without opening local browser on PC:
   ./run.sh --no-browser
   ```
2. **Connect your tablet**:
   - Point your tablet's camera at the **QR Code** printed in your PC's terminal (or click the **Tablet** button in the top bar to display the QR code).
   - Alternatively, open `http://<YOUR_PC_IP>:8321` in your tablet's web browser (e.g. Safari or Chrome).
3. **Scan and inspect from the tablet**:
   - Tap **Scan Flatbed** from the tablet. The PC will trigger the physical USB scanner.
   - Adjust crop boxes with fluid touch gestures: drag corner handles with fingers (optimized 24px touch targets), **pinch-to-zoom**, and **two-finger pan**.
   - Browse and select destination folders on your PC directly from the tablet using the integrated **Web Folder Browser**.
   - Validate and export photos: all processed, deskewed high-resolution photos are saved directly to your PC's hard drive!

> [!TIP]
> Ensure your PC and tablet are connected to the same Wi-Fi router. If you have an active firewall on Linux (`ufw`), ensure port 8321 is allowed:
> ```bash
> sudo ufw allow 8321/tcp
> ```

---

## 📦 Standalone Binary Executable (No Python Required)

You can compile Photo Scanner & Deskew into a single, standalone Linux ELF binary executable. The resulting binary bundles Python, OpenCV, FastAPI, and all web assets into a self-contained executable that runs on any modern 64-bit Linux distribution without requiring Python or virtual environments installed.

### 1. Build the Binary
```bash
./build.sh
```
This compiles the application and outputs the standalone executable to:
```text
dist/scanner-photos
```

### 2. Run the Standalone Binary
```bash
# Launch app directly (opens Chromium/browser automatically)
./dist/scanner-photos

# Or run with CLI options:
./dist/scanner-photos --port 8321
./dist/scanner-photos --no-browser
./dist/scanner-photos --help
./dist/scanner-photos --version
```

### 3. Optional: Install System-Wide
To install the binary so it can be launched from anywhere in your terminal:
```bash
sudo cp dist/scanner-photos /usr/local/bin/
```

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
├── build.sh                 # PyInstaller one-click standalone compilation script
├── scanner-photos.spec      # PyInstaller bundling specification
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
