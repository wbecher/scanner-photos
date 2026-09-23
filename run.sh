#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# Ensure virtualenv is set up
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment with uv..."
    uv venv
    uv pip install -e .
fi

PORT=8321
URL="http://localhost:$PORT"

echo "Starting Photo Scanner & Deskew on $URL..."

# Start uvicorn server in background
.venv/bin/uvicorn scanner_photos.main:app --host 127.0.0.1 --port $PORT &
SERVER_PID=$!

# Trap signals to kill server on script exit
cleanup() {
    echo "Stopping server (PID $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for server to become responsive
for i in {1..30}; do
    if curl -s "$URL/api/scanners" >/dev/null 2>&1; then
        break
    fi
    sleep 0.2
done

echo "Server is ready!"

# Launch desktop app window via Chromium if available, otherwise xdg-open
if command -v chromium >/dev/null 2>&1; then
    echo "Launching in native desktop app mode via Chromium..."
    chromium --app="$URL" --user-data-dir="/tmp/photo-scanner-chromium-profile" >/dev/null 2>&1 &
    CLIENT_PID=$!
    wait $CLIENT_PID
elif command -v xdg-open >/dev/null 2>&1; then
    echo "Opening default browser..."
    xdg-open "$URL" >/dev/null 2>&1 &
    wait $SERVER_PID
else
    echo "Please open $URL in your web browser."
    wait $SERVER_PID
fi
