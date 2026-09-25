/**
 * Mobile Remote Controller for Photo Scanner & Deskew
 * Handles sequential scanning, haptic feedback, session reel, and LAN synchronization.
 */

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const syncBadge = document.getElementById("syncBadge");
  const scannerSelect = document.getElementById("scannerSelect");
  const dpiSelect = document.getElementById("dpiSelect");
  const modeSelect = document.getElementById("modeSelect");
  const hardwareStatusBadge = document.getElementById("hardwareStatusBadge");
  const statusCue = document.getElementById("statusCue");
  const cueReadyIcon = document.getElementById("cueReadyIcon");
  const cueSpinner = document.getElementById("cueSpinner");
  const cueTitle = document.getElementById("cueTitle");
  const cueSubtitle = document.getElementById("cueSubtitle");
  const mobileScanBtn = document.getElementById("mobileScanBtn");
  const scanBtnMainText = document.getElementById("scanBtnMainText");
  const scanBtnSubText = document.getElementById("scanBtnSubText");
  const mobileDemoBtn = document.getElementById("mobileDemoBtn");
  const hapticFeedbackCheck = document.getElementById("hapticFeedbackCheck");
  const sessionPageCountBadge = document.getElementById("sessionPageCountBadge");
  const discardLastPageBtn = document.getElementById("discardLastPageBtn");
  const pagesReelTrack = document.getElementById("pagesReelTrack");
  const emptyReelState = document.getElementById("emptyReelState");
  const confirmDiscardModal = document.getElementById("confirmDiscardModal");
  const cancelDiscardBtn = document.getElementById("cancelDiscardBtn");
  const executeDiscardBtn = document.getElementById("executeDiscardBtn");
  const mobileToast = document.getElementById("mobileToast");
  const mobileToastMsg = document.getElementById("mobileToastMsg");
  const langSelect = document.getElementById("langSelect");

  // State
  const myClientId = "mobile_" + Math.random().toString(36).substring(2, 9);
  let sessionPages = [];
  let isScanning = false;
  let scanTimerInterval = null;
  let scanStartTimestamp = 0;
  let ws = null;
  let wsReconnectTimer = null;
  let audioCtx = null;
  let wakeLock = null;

  // Initialize Language
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener("change", (e) => {
      setLanguage(e.target.value);
      updateStatusDisplay();
      updateButtonText();
    });
  }
  applyTranslations();

  // Web Audio Chime Synth
  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playChime() {
    if (!hapticFeedbackCheck || !hapticFeedbackCheck.checked) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      // Note 1: 587.33 Hz (D5)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Note 2: 880 Hz (A5)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.1);
      gain2.gain.setValueAtTime(0.2, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.35);
    } catch (e) {
      console.warn("Audio chime error:", e);
    }
  }

  function triggerHaptic() {
    if (!hapticFeedbackCheck || !hapticFeedbackCheck.checked) return;
    if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate([120, 80, 160]);
      } catch (e) {}
    }
  }

  // Toast Notification
  let toastTimer = null;
  function showToast(msg, type = "normal") {
    if (!mobileToast) return;
    if (new URLSearchParams(window.location.search).has("notoast")) return;
    mobileToastMsg.textContent = msg;
    mobileToast.className = "mobile-toast show";
    if (type === "error") mobileToast.classList.add("toast-error");
    if (type === "success") mobileToast.classList.add("toast-success");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      mobileToast.className = "mobile-toast";
    }, 3200);
  }

  // WebSocket Connection
  function initWebSocket() {
    clearTimeout(wsReconnectTimer);
    try {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        updateSyncStatus("connected");
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.sender_id === myClientId) return;

          if (data.type === "session_updated") {
            if (data.session && Array.isArray(data.session.pages)) {
              sessionPages = data.session.pages;
              renderPagesReel();
              updateButtonText();
            }
          } else if (data.type === "session_cleared") {
            sessionPages = [];
            renderPagesReel();
            updateButtonText();
            showToast(t("projectCleared"), "success");
          } else if (data.type === "scan_started") {
            if (!isScanning) {
              setScanningState(true, true);
            }
          } else if (data.type === "scan_finished") {
            if (isScanning) {
              setScanningState(false);
            }
          }
        } catch (err) {
          console.error("WS error:", err);
        }
      };

      ws.onclose = () => {
        updateSyncStatus("disconnected");
        wsReconnectTimer = setTimeout(initWebSocket, 2500);
      };

      ws.onerror = () => {
        updateSyncStatus("disconnected");
        try { ws.close(); } catch(e) {}
      };
    } catch (err) {
      updateSyncStatus("disconnected");
      wsReconnectTimer = setTimeout(initWebSocket, 2500);
    }
  }

  function updateSyncStatus(status) {
    if (!syncBadge) return;
    syncBadge.className = "sync-badge";
    const textEl = syncBadge.querySelector(".sync-text");
    if (status === "connected") {
      syncBadge.classList.add("connected");
      if (textEl) textEl.textContent = t("connectedSync");
    } else if (status === "syncing") {
      syncBadge.classList.add("syncing");
      if (textEl) textEl.textContent = t("syncing");
    } else {
      syncBadge.classList.add("disconnected");
      if (textEl) textEl.textContent = "Offline";
    }
  }

  function broadcastWs(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ ...msg, sender_id: myClientId }));
      } catch (e) {
        console.warn("Failed to send WS message:", e);
      }
    }
  }

  // Wake Lock during scanning session
  async function requestWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch (err) {}
    }
  }

  // Settings & Scanners loading
  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.default_dpi && dpiSelect) {
        dpiSelect.value = String(data.default_dpi);
      }
    } catch (e) {
      console.warn("Failed to load settings:", e);
    }
  }

  // Scanner Hardware Discovery
  async function loadScanners() {
    try {
      const res = await fetch("/api/scanners");
      const data = await res.json();
      scannerSelect.innerHTML = "";

      const scanners = data.scanners || [];
      if (scanners.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = t("noScannerFound");
        scannerSelect.appendChild(opt);
        hardwareStatusBadge.textContent = "Demo / File";
        hardwareStatusBadge.className = "badge-status";
        return;
      }

      let selectedAny = false;
      scanners.forEach((sc) => {
        const opt = document.createElement("option");
        opt.value = sc.id;
        opt.textContent = sc.display_name || `${sc.vendor} ${sc.model} (${sc.id})` || sc.id;
        if (!sc.is_camera && !selectedAny) {
          opt.selected = true;
          selectedAny = true;
        }
        scannerSelect.appendChild(opt);
      });

      if (!selectedAny && scannerSelect.options.length > 0) {
        scannerSelect.options[0].selected = true;
      }

      hardwareStatusBadge.textContent = t("ready");
      hardwareStatusBadge.className = "badge-status badge-ready";
    } catch (err) {
      console.error("Failed to load scanners:", err);
      scannerSelect.innerHTML = `<option value="">${t("noScannerFound")}</option>`;
      hardwareStatusBadge.textContent = "Offline";
      hardwareStatusBadge.className = "badge-status";
    }
  }

  // Session Management
  async function loadSession() {
    try {
      const res = await fetch("/api/session");
      const data = await res.json();
      if (data.status === "ok" && data.session && Array.isArray(data.session.pages)) {
        sessionPages = data.session.pages;
        renderPagesReel();
        updateButtonText();
      }
    } catch (err) {
      console.warn("Failed to load session:", err);
    }
  }

  async function syncSessionToServer() {
    updateSyncStatus("syncing");
    try {
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: {
            active_page_index: sessionPages.length - 1,
            pages: sessionPages
          },
          sender_id: myClientId
        })
      });
      updateSyncStatus("connected");
      broadcastWs({
        type: "session_updated",
        session: {
          active_page_index: sessionPages.length - 1,
          pages: sessionPages
        }
      });
    } catch (err) {
      console.error("Session sync failed:", err);
      updateSyncStatus("disconnected");
    }
  }

  // UI Updates
  function updateButtonText() {
    const nextNum = sessionPages.length + 1;
    if (scanBtnMainText) {
      scanBtnMainText.textContent = t("mobileScanBtn");
    }
    if (scanBtnSubText) {
      scanBtnSubText.textContent = t("pageLabel", { num: nextNum });
    }
    if (sessionPageCountBadge) {
      sessionPageCountBadge.textContent = String(sessionPages.length);
    }
    if (discardLastPageBtn) {
      discardLastPageBtn.style.display = sessionPages.length > 0 ? "inline-flex" : "none";
    }
  }

  function updateStatusDisplay(state = "ready", elapsedSec = 0) {
    if (!statusCue) return;
    statusCue.className = "scan-status-cue";

    if (state === "scanning") {
      statusCue.classList.add("status-scanning");
      cueReadyIcon.style.display = "none";
      cueSpinner.style.display = "block";
      cueTitle.textContent = t("cueScanningTitle");
      cueSubtitle.textContent = `${t("cueScanningSubtitle")} (${elapsedSec}s)`;
    } else if (state === "done") {
      statusCue.classList.add("status-done");
      cueReadyIcon.style.display = "block";
      cueSpinner.style.display = "none";
      cueTitle.textContent = t("cueDoneTitle");
      cueSubtitle.textContent = t("cueDoneSubtitle");
    } else if (state === "error") {
      cueReadyIcon.style.display = "block";
      cueSpinner.style.display = "none";
      cueTitle.textContent = t("cueErrorTitle");
      cueSubtitle.textContent = t("scanError");
    } else {
      cueReadyIcon.style.display = "block";
      cueSpinner.style.display = "none";
      cueTitle.textContent = t("cueReadyTitle");
      cueSubtitle.textContent = t("cueReadySubtitle");
    }
  }

  function setScanningState(scanning, isRemoteTrigger = false) {
    isScanning = scanning;
    if (scanning) {
      mobileScanBtn.disabled = true;
      mobileScanBtn.classList.add("scanning");
      scanStartTimestamp = Date.now();
      updateStatusDisplay("scanning", 0);

      clearInterval(scanTimerInterval);
      scanTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - scanStartTimestamp) / 1000);
        updateStatusDisplay("scanning", elapsed);
      }, 1000);
    } else {
      mobileScanBtn.disabled = false;
      mobileScanBtn.classList.remove("scanning");
      clearInterval(scanTimerInterval);
    }
  }

  // Render Scanned Pages Reel
  function renderPagesReel() {
    if (!pagesReelTrack) return;
    pagesReelTrack.innerHTML = "";

    if (sessionPages.length === 0) {
      if (emptyReelState) {
        pagesReelTrack.appendChild(emptyReelState);
      }
      return;
    }

    sessionPages.forEach((page, index) => {
      const card = document.createElement("div");
      card.className = "page-thumb-card";

      const photosCount = page.photos ? page.photos.length : 0;
      card.innerHTML = `
        <div class="page-thumb-img-wrap">
          <img class="page-thumb-img" src="/api/scans/${page.scan_id}?max_size=120" alt="Page ${page.pageNumber || index + 1}" loading="lazy">
          <div class="page-thumb-badge">P${page.pageNumber || index + 1}</div>
          <div class="page-photos-badge">${photosCount} 📷</div>
        </div>
        <div class="page-thumb-footer">
          ${t("pageLabel", { num: page.pageNumber || index + 1 })}
        </div>
      `;
      pagesReelTrack.appendChild(card);
    });

    // Scroll to end of track so newly added page is immediately visible
    setTimeout(() => {
      pagesReelTrack.scrollLeft = pagesReelTrack.scrollWidth;
    }, 50);
  }

  // Trigger Scan Action
  async function performSequentialScan() {
    if (isScanning) return;
    initAudio();
    requestWakeLock();

    const devId = scannerSelect.value || null;
    const dpi = parseInt(dpiSelect.value, 10) || 300;
    const mode = modeSelect.value || "Color";

    setScanningState(true);
    broadcastWs({ type: "scan_started" });

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: devId,
          resolution: dpi,
          mode: mode
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Scan failed");
      }

      await handleNewScanResult(data.scan_id);
    } catch (err) {
      updateStatusDisplay("error");
      showToast(t("scanError") + err.message, "error");
    } finally {
      setScanningState(false);
      broadcastWs({ type: "scan_finished" });
    }
  }

  // Handle Scan Result (Auto-detection & Session Append)
  async function handleNewScanResult(scanId) {
    const pageNumber = sessionPages.length + 1;
    let detectedPhotos = [];

    let imageWidth = 0;
    let imageHeight = 0;

    // Trigger auto-detect for detected crop boxes
    try {
      const detRes = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_id: scanId,
          sensitivity: 0.5,
          min_area_ratio: 0.012,
          has_borders: false
        })
      });
      if (detRes.ok) {
        const detData = await detRes.json();
        if (detData.image_width && detData.image_height) {
          imageWidth = detData.image_width;
          imageHeight = detData.image_height;
        }
        const existingCount = sessionPages.reduce((acc, p) => acc + (p.photos ? p.photos.length : 0), 0);
        detectedPhotos = (detData.photos || []).map((p, idx) => ({
          id: p.id || `photo_p${pageNumber}_${idx + 1}`,
          corners: p.corners,
          angle: p.angle,
          rotation_90_steps: 0,
          fine_angle_deg: 0.0,
          margin_px: 0,
          filename: `Photo_${String(existingCount + idx + 1).padStart(3, "0")}`,
          included: true,
          preview_url: p.preview_url || null
        }));
      }
    } catch (e) {
      console.warn("Auto-detect fallback:", e);
    }

    if (!imageWidth || !imageHeight) {
      try {
        const img = new Image();
        img.src = `/api/scans/${scanId}`;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
        if (img.naturalWidth && img.naturalHeight) {
          imageWidth = img.naturalWidth;
          imageHeight = img.naturalHeight;
        }
      } catch (err) {}
    }

    const newPage = {
      id: `page_${Date.now()}_${pageNumber}`,
      scan_id: scanId,
      pageNumber: pageNumber,
      imageWidth: imageWidth || 1800,
      imageHeight: imageHeight || 2400,
      photos: detectedPhotos
    };

    sessionPages.push(newPage);
    renderPagesReel();
    updateButtonText();
    await syncSessionToServer();

    // Positive completion cues: haptic vibration, audio chime, and green swap alert
    triggerHaptic();
    playChime();
    updateStatusDisplay("done");
    showToast(t("scanSuccessCue", { page: pageNumber }), "success");
  }

  // Trigger Demo Scan
  async function performDemoScan() {
    if (isScanning) return;
    initAudio();
    setScanningState(true);
    broadcastWs({ type: "scan_started" });

    try {
      const nextIdx = (sessionPages.length % 3) + 1;
      const res = await fetch("/api/demo-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_index: nextIdx })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Demo failed");

      await handleNewScanResult(data.scan_id);
    } catch (err) {
      updateStatusDisplay("error");
      showToast(err.message, "error");
    } finally {
      setScanningState(false);
      broadcastWs({ type: "scan_finished" });
    }
  }

  // Discard Last Page Modal
  if (discardLastPageBtn) {
    discardLastPageBtn.addEventListener("click", () => {
      if (sessionPages.length === 0) return;
      confirmDiscardModal.classList.add("open");
    });
  }

  if (cancelDiscardBtn) {
    cancelDiscardBtn.addEventListener("click", () => {
      confirmDiscardModal.classList.remove("open");
    });
  }

  if (executeDiscardBtn) {
    executeDiscardBtn.addEventListener("click", async () => {
      confirmDiscardModal.classList.remove("open");
      if (sessionPages.length > 0) {
        sessionPages.pop();
        renderPagesReel();
        updateButtonText();
        updateStatusDisplay("ready");
        await syncSessionToServer();
        showToast(t("lastPageDiscarded"), "success");
      }
    });
  }

  // Button Listeners
  if (mobileScanBtn) {
    mobileScanBtn.addEventListener("click", performSequentialScan);
  }

  if (mobileDemoBtn) {
    mobileDemoBtn.addEventListener("click", performDemoScan);
  }

  // Bootstrap
  initWebSocket();
  loadSettings();
  loadScanners();
  loadSession();

  // Re-sync on visibility change (e.g. phone screen woke up)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      loadSession();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        initWebSocket();
      }
    }
  });
});
