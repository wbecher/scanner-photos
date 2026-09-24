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
NO_BROWSER=0

for arg in "$@"; do
    if [ "$arg" = "--no-browser" ]; then
        NO_BROWSER=1
    fi
done

if [ "$NO_BROWSER" -eq 0 ]; then
    if [ "$SCANNER_NO_BROWSER" = "1" ] || [ "$SCANNER_NO_BROWSER" = "true" ]; then
        NO_BROWSER=1
    else
        SETTING_BROWSER=$(.venv/bin/python3 -c "import json, os; s = json.load(open('settings.json')) if os.path.exists('settings.json') else {}; print(s.get('open_browser_on_startup', True))" 2>/dev/null || echo "True")
        if [ "$SETTING_BROWSER" = "False" ] || [ "$SETTING_BROWSER" = "false" ]; then
            NO_BROWSER=1
        fi
    fi
fi

# Start uvicorn server in background listening on all network interfaces (0.0.0.0)
.venv/bin/uvicorn scanner_photos.main:app --host 0.0.0.0 --port $PORT &
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

LOCAL_IPS=$(.venv/bin/python3 -c "from scanner_photos.main import get_local_ips; print(' '.join(get_local_ips()))" 2>/dev/null || echo "127.0.0.1")
PRIMARY_IP=$(echo $LOCAL_IPS | awk '{print $1}')
REMOTE_URL="http://${PRIMARY_IP}:${PORT}"

echo ""
echo "=========================================================="
echo " 📸 Photo Scanner & Deskew - Server Ready!"
echo " 🖥️  Local PC:      $URL"
for ip in $LOCAL_IPS; do
    echo " 📱 Tablet/Remote: http://${ip}:${PORT}"
done
echo "=========================================================="

if command -v qrencode >/dev/null 2>&1; then
    echo "  Scan with your tablet camera to open immediately:"
    echo ""
    qrencode -t ansiutf8 "$REMOTE_URL"
    echo ""
    echo "=========================================================="
fi

if systemctl is-active --quiet ufw 2>/dev/null; then
    echo "  🔒 Firewall (UFW) ativo no seu PC Linux."
    echo "  Se o tablet não conectar, libere a porta 8321 executando:"
    echo "     sudo ufw allow 8321/tcp"
    echo "=========================================================="
fi

if [ "$NO_BROWSER" -eq 1 ]; then
    echo "Running in headless server mode (no browser). Press Ctrl+C to stop."
    wait $SERVER_PID
elif command -v chromium >/dev/null 2>&1; then
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
