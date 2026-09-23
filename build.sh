#!/usr/bin/env bash
set -e

echo "=== Building Photo Scanner & Deskew Standalone Binary ==="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Ensure venv exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment with uv..."
    uv venv
fi

# Ensure PyInstaller is installed
if [ ! -f ".venv/bin/pyinstaller" ]; then
    echo "Installing PyInstaller..."
    uv pip install pyinstaller
fi

# Clean previous build artifacts
echo "Cleaning old build files..."
rm -rf build dist

# Run PyInstaller using spec file
echo "Running PyInstaller..."
.venv/bin/pyinstaller --clean scanner-photos.spec

# Verify build
if [ -f "dist/scanner-photos" ]; then
    SIZE=$(du -h dist/scanner-photos | cut -f1)
    echo ""
    echo "====================================================="
    echo " Build SUCCESSFUL!"
    echo " Binary output: dist/scanner-photos ($SIZE)"
    echo "====================================================="
    echo ""
    echo "To run the standalone binary:"
    echo "  ./dist/scanner-photos"
    echo ""
    echo "CLI flags supported:"
    echo "  ./dist/scanner-photos --help"
    echo "  ./dist/scanner-photos --port 8321"
    echo "  ./dist/scanner-photos --no-browser"
    echo "  ./dist/scanner-photos --version"
else
    echo "Build failed: dist/scanner-photos was not created."
    exit 1
fi
