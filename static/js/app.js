document.addEventListener("DOMContentLoaded", async () => {
  let scanCanvas = null;
  let sessionPages = []; // [{ id, scan_id, pageNumber, imageWidth, imageHeight, imageElement, photos: [] }]
  let activePageIndex = -1;
  let appSettings = {};
  let currentValidationFilter = "all";

  // Elements: Header & Scanner controls
  const scannerSelect = document.getElementById("scannerSelect");
  const dpiSelect = document.getElementById("dpiSelect");
  const modeSelect = document.getElementById("modeSelect");
  const scanBtn = document.getElementById("scanBtn");
  const validateBtn = document.getElementById("validateBtn");
  const totalPhotosCount = document.getElementById("totalPhotosCount");
  const openFileBtn = document.getElementById("openFileBtn");
  const fileInput = document.getElementById("fileInput");
  const demoBtn = document.getElementById("demoBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const langSelect = document.getElementById("langSelect");

  // Elements: Pages Strip
  const pagesBar = document.getElementById("pagesBar");
  const pagesList = document.getElementById("pagesList");
  const addPageBtn = document.getElementById("addPageBtn");

  // Elements: Canvas & Tools
  const canvasElement = document.getElementById("canvasElement");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomFitBtn = document.getElementById("zoomFitBtn");
  const zoom100Btn = document.getElementById("zoom100Btn");
  const redetectBtn = document.getElementById("redetectBtn");
  const hasBordersCheck = document.getElementById("hasBordersCheck");
  const addBoxBtn = document.getElementById("addBoxBtn");
  const deleteBoxBtn = document.getElementById("deleteBoxBtn");

  // Elements: Sidebar
  const photoCardsList = document.getElementById("photoCardsList");
  const photoCountBadge = document.getElementById("photoCountBadge");
  const exportAllBtn = document.getElementById("exportAllBtn");
  const exportDestLabel = document.getElementById("exportDestLabel");

  // Elements: Overlays & Notifications
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingText = document.getElementById("loadingText");
  const progressBox = document.getElementById("progressBox");
  const progressBoxBar = document.getElementById("progressBoxBar");
  const toastNotification = document.getElementById("toastNotification");
  const toastMessage = document.getElementById("toastMessage");

  // Elements: Settings Modal
  const settingsModal = document.getElementById("settingsModal");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const settingOutputDir = document.getElementById("settingOutputDir");
  const settingBrowseDirBtn = document.getElementById("settingBrowseDirBtn");
  const settingNamingPattern = document.getElementById("settingNamingPattern");
  const settingFormat = document.getElementById("settingFormat");
  const settingQuality = document.getElementById("settingQuality");

  // Elements: Validation Modal
  const validationModal = document.getElementById("validationModal");
  const closeValidationBtn = document.getElementById("closeValidationBtn");
  const cancelValidationBtn = document.getElementById("cancelValidationBtn");
  const validationStats = document.getElementById("validationStats");
  const validationTabs = document.getElementById("validationTabs");
  const valNamingPatternInput = document.getElementById("valNamingPatternInput");
  const valApplyNamingBtn = document.getElementById("valApplyNamingBtn");
  const valSelectAllBtn = document.getElementById("valSelectAllBtn");
  const valDeselectAllBtn = document.getElementById("valDeselectAllBtn");
  const validationGrid = document.getElementById("validationGrid");
  const valOutputDir = document.getElementById("valOutputDir");
  const valBrowseDirBtn = document.getElementById("valBrowseDirBtn");
  const confirmBatchExportBtn = document.getElementById("confirmBatchExportBtn");
  const exportBatchBtnText = document.getElementById("exportBatchBtnText");

  // Elements: Connect Tablet Modal
  const connectTabletBtn = document.getElementById("connectTabletBtn");
  const connectTabletModal = document.getElementById("connectTabletModal");
  const closeConnectTabletBtn = document.getElementById("closeConnectTabletBtn");
  const tabletRemoteUrlInput = document.getElementById("tabletRemoteUrlInput");
  const copyRemoteUrlBtn = document.getElementById("copyRemoteUrlBtn");
  const tabletQrImage = document.getElementById("tabletQrImage");

  // Elements: Folder Browser Modal
  const folderBrowserModal = document.getElementById("folderBrowserModal");
  const closeFolderBrowserBtn = document.getElementById("closeFolderBrowserBtn");
  const cancelFolderBrowserBtn = document.getElementById("cancelFolderBrowserBtn");
  const selectThisFolderBtn = document.getElementById("selectThisFolderBtn");
  const folderShortcutsBar = document.getElementById("folderShortcutsBar");
  const folderUpBtn = document.getElementById("folderUpBtn");
  const folderCurrentPathInput = document.getElementById("folderCurrentPathInput");
  const folderBrowserList = document.getElementById("folderBrowserList");
  const newFolderNameInput = document.getElementById("newFolderNameInput");
  const confirmCreateFolderBtn = document.getElementById("confirmCreateFolderBtn");
  const folderWritableBadge = document.getElementById("folderWritableBadge");

  // Elements: Clear Project & Sync
  const syncBadge = document.getElementById("syncBadge");
  const clearProjectBtn = document.getElementById("clearProjectBtn");
  const confirmClearModal = document.getElementById("confirmClearModal");
  const closeConfirmClearBtn = document.getElementById("closeConfirmClearBtn");
  const cancelClearBtn = document.getElementById("cancelClearBtn");
  const executeClearBtn = document.getElementById("executeClearBtn");
  const settingOpenBrowser = document.getElementById("settingOpenBrowser");

  // Real-time Sync & WebSocket Identification
  const myClientId = "client_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
  let ws = null;
  let wsReconnectTimer = null;
  let syncDebounceTimer = null;

  function updateSyncStatus(status) {
    if (!syncBadge) return;
    const textEl = syncBadge.querySelector(".sync-text");
    if (status === "connected") {
      syncBadge.className = "sync-indicator";
      if (textEl) textEl.textContent = t("connectedSync");
    } else if (status === "syncing") {
      syncBadge.className = "sync-indicator syncing";
      if (textEl) textEl.textContent = t("syncing");
    } else {
      syncBadge.className = "sync-indicator disconnected";
      if (textEl) textEl.textContent = "Offline";
    }
  }

  function initWebSocket() {
    clearTimeout(wsReconnectTimer);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        updateSyncStatus("connected");
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.sender_id === myClientId) return;

          if (data.type === "session_updated") {
            updateSyncStatus("syncing");
            await applyRemoteSession(data.session);
            updateSyncStatus("connected");
          } else if (data.type === "session_cleared") {
            resetLocalSession();
            showToast(t("projectCleared"), "success");
          } else if (data.type === "scan_started") {
            showLoading(t("scanningWait"));
          } else if (data.type === "scan_finished") {
            hideLoading();
          }
        } catch (err) {
          console.error("WS message error:", err);
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

  function syncSessionToServer(immediate = false) {
    clearTimeout(syncDebounceTimer);
    const doSync = async () => {
      try {
        updateSyncStatus("syncing");
        const pagesToSync = sessionPages.map((p) => ({
          id: p.id,
          scan_id: p.scan_id,
          pageNumber: p.pageNumber,
          imageWidth: p.imageWidth,
          imageHeight: p.imageHeight,
          photos: (p.photos || []).map((ph) => ({
            id: ph.id,
            corners: ph.corners,
            angle: ph.angle,
            rotation_90_steps: ph.rotation_90_steps || 0,
            fine_angle_deg: ph.fine_angle_deg || 0.0,
            margin_px: ph.margin_px || 0,
            filename: ph.filename,
            included: ph.included !== false,
            preview_url: ph.preview_url
          }))
        }));

        await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session: {
              active_page_index: activePageIndex,
              pages: pagesToSync
            },
            sender_id: myClientId
          })
        });
        updateSyncStatus("connected");
      } catch (err) {
        console.error("Session sync error:", err);
      }
    };

    if (immediate) {
      doSync();
    } else {
      syncDebounceTimer = setTimeout(doSync, 300);
    }
  }

  async function applyRemoteSession(remoteSession) {
    if (!remoteSession || !Array.isArray(remoteSession.pages)) return;

    const prevSelectedBox = scanCanvas ? scanCanvas.selectedBoxId : null;
    const newPages = [];

    for (let i = 0; i < remoteSession.pages.length; i++) {
      const rp = remoteSession.pages[i];
      let localP = sessionPages.find((p) => p.id === rp.id && p.scan_id === rp.scan_id);
      let img = null;
      if (localP && localP.imageElement) {
        img = localP.imageElement;
      } else {
        img = new Image();
        img.src = `/api/scans/${rp.scan_id}`;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }

      newPages.push({
        id: rp.id,
        scan_id: rp.scan_id,
        pageNumber: rp.pageNumber || (i + 1),
        imageWidth: rp.imageWidth || img.naturalWidth,
        imageHeight: rp.imageHeight || img.naturalHeight,
        imageElement: img,
        photos: rp.photos || []
      });
    }

    sessionPages = newPages;

    if (sessionPages.length === 0) {
      activePageIndex = -1;
      if (scanCanvas) {
        scanCanvas.image = null;
        scanCanvas.boxes = [];
        scanCanvas.render();
      }
      renderCards();
      renderPagesStrip();
      updateTotalCounts();
      return;
    }

    let targetIdx = remoteSession.active_page_index;
    if (targetIdx === undefined || targetIdx < 0 || targetIdx >= sessionPages.length) {
      targetIdx = Math.min(Math.max(activePageIndex, 0), sessionPages.length - 1);
    }

    activePageIndex = targetIdx;
    const curr = sessionPages[activePageIndex];
    if (scanCanvas) {
      scanCanvas.setImage(curr.imageElement, curr.imageWidth, curr.imageHeight);
      scanCanvas.setBoxes(curr.photos);
      if (prevSelectedBox && curr.photos.some((p) => p.id === prevSelectedBox)) {
        scanCanvas.selectBox(prevSelectedBox);
      }
    }

    renderPagesStrip();
    renderCards();
    updateTotalCounts();
    if (validationModal.classList.contains("open")) {
      renderValidationTabs();
      renderValidationGrid(currentValidationFilter);
    }
  }

  function resetLocalSession() {
    sessionPages = [];
    activePageIndex = -1;
    if (scanCanvas) {
      scanCanvas.image = null;
      scanCanvas.boxes = [];
      scanCanvas.render();
    }
    renderCards();
    renderPagesStrip();
    updateTotalCounts();
    if (validationModal.classList.contains("open")) {
      closeValidationModal();
    }
  }

  async function restoreSessionFromServer() {
    try {
      const res = await fetch("/api/session");
      const data = await res.json();
      if (data.status === "ok" && data.session && data.session.pages && data.session.pages.length > 0) {
        await applyRemoteSession(data.session);
        showToast(t("projectRestored", { count: sessionPages.length }), "success");
      }
    } catch (err) {
      console.error("Failed to restore session from server:", err);
    }
  }

  async function executeClearProject() {
    try {
      showLoading(t("scanningWait"));
      await fetch("/api/session/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleanup_files: false, sender_id: myClientId })
      });
      resetLocalSession();
      showToast(t("projectCleared"), "success");
    } catch (err) {
      showToast("Failed to clear project: " + err.message, "error");
    } finally {
      hideLoading();
      if (confirmClearModal) confirmClearModal.classList.remove("open");
    }
  }

  // Clear Project Modal bindings
  if (clearProjectBtn) {
    clearProjectBtn.addEventListener("click", () => {
      if (sessionPages.length === 0) {
        showToast(t("projectCleared"), "success");
        return;
      }
      if (confirmClearModal) confirmClearModal.classList.add("open");
    });
  }

  if (closeConfirmClearBtn) {
    closeConfirmClearBtn.addEventListener("click", () => {
      confirmClearModal.classList.remove("open");
    });
  }

  if (cancelClearBtn) {
    cancelClearBtn.addEventListener("click", () => {
      confirmClearModal.classList.remove("open");
    });
  }

  if (executeClearBtn) {
    executeClearBtn.addEventListener("click", () => {
      executeClearProject();
    });
  }

  // Initialize Canvas
  scanCanvas = new ScanCanvas(
    canvasElement,
    (selectedId) => onSelectionChanged(selectedId),
    (updatedBox) => onBoxUpdated(updatedBox)
  );

  // Initialize UI, settings, and restore server cached project
  applyTranslations();
  await loadSettings();
  await loadScanners();
  await restoreSessionFromServer();
  initWebSocket();

  // Support direct modal opening via URL parameter (?modal=validation, tablet, folders)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("notoast")) {
    const toastElem = document.getElementById("toastNotification");
    if (toastElem) toastElem.style.display = "none";
  }
  if (urlParams.has("modal")) {
    document.querySelectorAll(".modal-overlay").forEach(m => {
      m.style.transition = "none";
    });
  }
  if (urlParams.get("modal") === "validation") {
    setTimeout(() => openValidationModal(), 400);
  } else if (urlParams.get("modal") === "tablet") {
    setTimeout(() => { if (connectTabletBtn) connectTabletBtn.click(); }, 400);
  } else if (urlParams.get("modal") === "folders") {
    setTimeout(() => { openFolderBrowser(null, urlParams.get("path") || "~"); }, 400);
  }

  // Language switch
  langSelect.addEventListener("change", (e) => {
    setLanguage(e.target.value);
    renderPagesStrip();
    renderCards();
    if (validationModal.classList.contains("open")) {
      renderValidationTabs();
      renderValidationGrid(currentValidationFilter);
    }
  });

  // Settings Dialog
  settingsBtn.addEventListener("click", () => {
    settingOutputDir.value = appSettings.output_dir || "";
    settingNamingPattern.value = appSettings.naming_template || "Photo_{date}_{index:03d}";
    settingFormat.value = appSettings.export_format || "JPEG";
    settingQuality.value = appSettings.export_quality || 95;
    if (settingOpenBrowser) {
      settingOpenBrowser.checked = appSettings.open_browser_on_startup !== false;
    }
    settingsModal.classList.add("open");
  });

  function closeSettings() {
    settingsModal.classList.remove("open");
  }
  closeSettingsBtn.addEventListener("click", closeSettings);
  cancelSettingsBtn.addEventListener("click", closeSettings);

  saveSettingsBtn.addEventListener("click", async () => {
    appSettings.output_dir = settingOutputDir.value;
    appSettings.naming_template = settingNamingPattern.value;
    appSettings.export_format = settingFormat.value;
    appSettings.export_quality = parseInt(settingQuality.value, 10) || 95;
    if (settingOpenBrowser) {
      appSettings.open_browser_on_startup = settingOpenBrowser.checked;
    }

    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appSettings)
    });

    updateExportLabel();
    closeSettings();
    showToast("Settings saved successfully", "success");
  });

  function updateExportLabel() {
    const dest = appSettings.output_dir || "~/Pictures/Scans";
    exportDestLabel.textContent = `Dest: ${dest}`;
    exportDestLabel.title = dest;
    if (valOutputDir) {
      valOutputDir.value = dest;
    }
  }

  // Web Directory Browser for Remote / Local use
  let activeFolderBrowserTargetInput = null;
  let browserCurrentPath = "";
  let browserParentPath = null;

  async function loadDirectories(path) {
    try {
      folderBrowserList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted);">Loading folders...</div>`;
      const res = await fetch("/api/browse-directories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path || "" })
      });
      const data = await res.json();
      if (data.status === "ok") {
        browserCurrentPath = data.current_path;
        browserParentPath = data.parent_path;
        folderCurrentPathInput.value = data.current_path;
        folderUpBtn.disabled = !data.parent_path;

        // Render shortcuts
        folderShortcutsBar.innerHTML = "";
        data.shortcuts.forEach(s => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "folder-shortcut-chip";
          chip.textContent = s.name;
          chip.addEventListener("click", () => loadDirectories(s.path));
          folderShortcutsBar.appendChild(chip);
        });

        // Render directories
        folderBrowserList.innerHTML = "";
        if (data.directories.length === 0) {
          folderBrowserList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted);">${t("emptyFolder")}</div>`;
        } else {
          data.directories.forEach(d => {
            const item = document.createElement("div");
            item.className = "folder-item";
            item.innerHTML = `<span class="folder-item-icon">📁</span><span class="folder-item-name">${d.name}</span>`;
            item.addEventListener("click", () => loadDirectories(d.path));
            folderBrowserList.appendChild(item);
          });
        }

        if (folderWritableBadge) {
          folderWritableBadge.textContent = data.writable ? "✓ Writable" : "⚠ Read-only";
          folderWritableBadge.style.color = data.writable ? "var(--accent-green)" : "var(--danger-color)";
        }
      }
    } catch (err) {
      folderBrowserList.innerHTML = `<div style="padding: 16px; color: var(--danger-color);">Error loading folders: ${err.message}</div>`;
    }
  }

  function openFolderBrowser(targetInput, startPath = null) {
    activeFolderBrowserTargetInput = targetInput;
    const initial = startPath || (targetInput ? targetInput.value : (appSettings.output_dir || ""));
    folderBrowserModal.classList.add("open");
    loadDirectories(initial);
  }

  function closeFolderBrowser() {
    folderBrowserModal.classList.remove("open");
    activeFolderBrowserTargetInput = null;
  }

  if (closeFolderBrowserBtn) closeFolderBrowserBtn.addEventListener("click", closeFolderBrowser);
  if (cancelFolderBrowserBtn) cancelFolderBrowserBtn.addEventListener("click", closeFolderBrowser);

  if (folderUpBtn) {
    folderUpBtn.addEventListener("click", () => {
      if (browserParentPath) {
        loadDirectories(browserParentPath);
      }
    });
  }

  if (selectThisFolderBtn) {
    selectThisFolderBtn.addEventListener("click", async () => {
      if (browserCurrentPath) {
        if (activeFolderBrowserTargetInput) {
          activeFolderBrowserTargetInput.value = browserCurrentPath;
        }
        appSettings.output_dir = browserCurrentPath;
        if (valOutputDir) valOutputDir.value = browserCurrentPath;
        if (settingOutputDir) settingOutputDir.value = browserCurrentPath;
        updateExportLabel();
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(appSettings)
        });
        showToast(browserCurrentPath, "success");
      }
      closeFolderBrowser();
    });
  }

  if (confirmCreateFolderBtn) {
    confirmCreateFolderBtn.addEventListener("click", async () => {
      const name = newFolderNameInput.value.trim();
      if (!name) return;
      try {
        const res = await fetch("/api/create-directory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parent_path: browserCurrentPath,
            folder_name: name
          })
        });
        const data = await res.json();
        if (data.status === "ok") {
          newFolderNameInput.value = "";
          await loadDirectories(data.path);
          showToast("Folder created: " + name, "success");
        } else {
          showToast(data.detail || "Failed to create folder", "error");
        }
      } catch (err) {
        showToast("Error: " + err.message, "error");
      }
    });
  }

  if (valBrowseDirBtn) {
    valBrowseDirBtn.addEventListener("click", () => openFolderBrowser(valOutputDir));
  }
  if (settingBrowseDirBtn) {
    settingBrowseDirBtn.addEventListener("click", () => openFolderBrowser(settingOutputDir));
  }

  // Tablet / Mobile Connect Handlers
  const qrTabMobileBtn = document.getElementById("qrTabMobileBtn");
  const qrTabFullBtn = document.getElementById("qrTabFullBtn");
  const qrDescText = document.getElementById("qrDescText");
  let cachedServerInfo = null;
  let activeQrTab = "mobile";

  function updateQrView() {
    if (activeQrTab === "mobile") {
      if (qrTabMobileBtn) qrTabMobileBtn.className = "btn btn-primary";
      if (qrTabFullBtn) qrTabFullBtn.className = "btn btn-secondary";
      if (qrDescText) qrDescText.textContent = t("connectMobileDesc");
      const mobUrl = cachedServerInfo && cachedServerInfo.mobile_url ? cachedServerInfo.mobile_url : `${window.location.origin}/mobile`;
      tabletRemoteUrlInput.value = mobUrl;
      tabletQrImage.src = `/api/qrcode?path=/mobile&t=${Date.now()}`;
    } else {
      if (qrTabMobileBtn) qrTabMobileBtn.className = "btn btn-secondary";
      if (qrTabFullBtn) qrTabFullBtn.className = "btn btn-primary";
      if (qrDescText) qrDescText.textContent = t("connectTabletDesc");
      const fullUrl = cachedServerInfo && cachedServerInfo.remote_url ? cachedServerInfo.remote_url : window.location.origin;
      tabletRemoteUrlInput.value = fullUrl;
      tabletQrImage.src = `/api/qrcode?t=${Date.now()}`;
    }
  }

  if (qrTabMobileBtn) {
    qrTabMobileBtn.addEventListener("click", () => {
      activeQrTab = "mobile";
      updateQrView();
    });
  }

  if (qrTabFullBtn) {
    qrTabFullBtn.addEventListener("click", () => {
      activeQrTab = "full";
      updateQrView();
    });
  }

  if (connectTabletBtn) {
    connectTabletBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/server-info");
        const info = await res.json();
        if (info.status === "ok") {
          cachedServerInfo = info;
        }
      } catch (err) {
        console.warn("Server info error:", err);
      }
      updateQrView();
      connectTabletModal.classList.add("open");
    });
  }

  if (closeConnectTabletBtn) {
    closeConnectTabletBtn.addEventListener("click", () => {
      connectTabletModal.classList.remove("open");
    });
  }

  if (copyRemoteUrlBtn) {
    copyRemoteUrlBtn.addEventListener("click", () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(tabletRemoteUrlInput.value);
        showToast(t("linkCopied"), "success");
      } else {
        tabletRemoteUrlInput.select();
        document.execCommand("copy");
        showToast(t("linkCopied"), "success");
      }
    });
  }

  // Zoom / View controls
  zoomInBtn.addEventListener("click", () => scanCanvas.setZoom(scanCanvas.scale * 1.25));
  zoomOutBtn.addEventListener("click", () => scanCanvas.setZoom(scanCanvas.scale * 0.8));
  zoomFitBtn.addEventListener("click", () => scanCanvas.fitToScreen());
  zoom100Btn.addEventListener("click", () => scanCanvas.setZoom(1.0));

  addBoxBtn.addEventListener("click", () => {
    scanCanvas.isAddBoxActive = !scanCanvas.isAddBoxActive;
    addBoxBtn.classList.toggle("active", scanCanvas.isAddBoxActive);
    if (scanCanvas.isAddBoxActive) {
      showToast("Click and drag on canvas to add a photo box", "success");
    }
  });

  deleteBoxBtn.addEventListener("click", () => {
    scanCanvas.deleteSelectedBox();
    if (activePageIndex >= 0 && sessionPages[activePageIndex]) {
      sessionPages[activePageIndex].photos = scanCanvas.boxes;
    }
    renderCards();
    renderPagesStrip();
    updateTotalCounts();
  });

  redetectBtn.addEventListener("click", async () => {
    if (activePageIndex < 0 || !sessionPages[activePageIndex]) return;
    await runAutoDetect(activePageIndex);
  });

  // Open File (supports single or multiple file selection)
  openFileBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    showLoading(t("scanningWait"));
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        showLoading(`${t("scanningWait")} (${i + 1}/${files.length})`);
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        await addNewPage(data.scan_id);
      }
    } catch (err) {
      showToast("Failed to upload image(s): " + err.message, "error");
    } finally {
      hideLoading();
      fileInput.value = "";
    }
  });

  // Load Demo (supports generating consecutive distinct demo pages)
  demoBtn.addEventListener("click", async () => {
    const nextPageIndex = (sessionPages.length % 3) + 1;
    showLoading(`Generating demo scan (Page ${sessionPages.length + 1})...`);
    try {
      const res = await fetch("/api/demo-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_index: nextPageIndex })
      });
      const data = await res.json();
      await addNewPage(data.scan_id);
    } catch (err) {
      showToast("Failed to load demo: " + err.message, "error");
    } finally {
      hideLoading();
    }
  });

  // Scan Button (Physical Scanner or simulation)
  scanBtn.addEventListener("click", async () => {
    const devId = scannerSelect.value;
    const dpi = parseInt(dpiSelect.value, 10);
    const mode = modeSelect.value;

    showLoading(t("scanningWait"));
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: devId, resolution: dpi, mode: mode })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Scan error");
      }
      await addNewPage(data.scan_id);
    } catch (err) {
      showToast(t("scanError") + err.message, "error");
    } finally {
      hideLoading();
    }
  });

  // Add Page Button in Pages Strip triggers scan
  addPageBtn.addEventListener("click", () => {
    scanBtn.click();
  });

  // Keyboard Shortcuts: Space (Scan Next Page), Ctrl+Enter, Esc, and V
  window.addEventListener("keydown", (e) => {
    // If typing in input, textarea, or select, do not trigger shortcuts
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
      return;
    }

    // Modal navigation
    if (validationModal.classList.contains("open")) {
      if (e.key === "Escape") {
        closeValidationModal();
      }
      return;
    }

    if (settingsModal.classList.contains("open")) {
      if (e.key === "Escape") {
        closeSettings();
      }
      return;
    }

    // Scan next page shortcut: Space or Ctrl+Enter
    if (e.code === "Space" || (e.key === "Enter" && e.ctrlKey)) {
      e.preventDefault();
      if (loadingOverlay.classList.contains("active")) {
        return;
      }
      showToast(t("shortcutScanning"), "success");
      scanBtn.click();
    } else if (e.key === "v" || e.key === "V") {
      openValidationModal();
    }
  });

  // Validation Button and Sidebar Export Button both open the Validation Review Modal
  validateBtn.addEventListener("click", () => openValidationModal());
  exportAllBtn.addEventListener("click", () => openValidationModal());

  // Validation Modal Controls
  closeValidationBtn.addEventListener("click", closeValidationModal);
  cancelValidationBtn.addEventListener("click", closeValidationModal);

  function closeValidationModal() {
    validationModal.classList.remove("open");
  }

  valSelectAllBtn.addEventListener("click", () => {
    setIncludedStateForFiltered(true);
  });

  valDeselectAllBtn.addEventListener("click", () => {
    setIncludedStateForFiltered(false);
  });

  function setIncludedStateForFiltered(state) {
    const photos = getFilteredPhotos(currentValidationFilter);
    photos.forEach(({ photo }) => {
      photo.included = state;
    });
    renderValidationGrid(currentValidationFilter);
    updateValidationStats();
  }

  // Batch Naming in Validation
  function applyBatchNamingPattern(pattern) {
    if (!pattern || !pattern.trim()) {
      pattern = "Photo_{date}_{index:03d}";
    }
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    let globalIdx = 1;
    let count = 0;

    sessionPages.forEach((page) => {
      page.photos.forEach((photo) => {
        let name = pattern;
        name = name.replace(/\{date\}/g, dateStr);
        name = name.replace(/\{page\}/g, String(page.pageNumber));
        name = name.replace(/\{index:0(\d+)d\}/g, (_, digits) =>
          String(globalIdx).padStart(parseInt(digits, 10), "0")
        );
        name = name.replace(/\{index\}/g, String(globalIdx));
        photo.filename = name;
        globalIdx++;
        count++;
      });
    });

    renderValidationGrid(currentValidationFilter);
    if (activePageIndex >= 0) renderCards();
    showToast(t("namingApplied", { count }), "success");
  }

  if (valApplyNamingBtn) {
    valApplyNamingBtn.addEventListener("click", () => {
      const pattern = valNamingPatternInput ? valNamingPatternInput.value : "";
      applyBatchNamingPattern(pattern);
    });
  }

  // Confirm Batch Export
  confirmBatchExportBtn.addEventListener("click", async () => {
    // Gather all pages with included photos
    const exportPages = [];
    for (const page of sessionPages) {
      const incPhotos = page.photos.filter((p) => p.included !== false);
      if (incPhotos.length > 0) {
        exportPages.push({
          scan_id: page.scan_id,
          page_number: page.pageNumber,
          photos: incPhotos
        });
      }
    }

    const totalSelected = exportPages.reduce((acc, p) => acc + p.photos.length, 0);
    if (totalSelected === 0) {
      showToast("No photos selected for export", "error");
      return;
    }

    confirmBatchExportBtn.disabled = true;
    showLoading(t("exportProgress", { current: 1, total: totalSelected }), true);

    try {
      const destDir = valOutputDir.value.trim() || appSettings.output_dir || "~/Pictures/Scans";
      const res = await fetch("/api/export-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages: exportPages,
          output_dir: destDir,
          format: appSettings.export_format || "JPEG",
          quality: appSettings.export_quality || 95,
          dpi: parseInt(dpiSelect.value, 10) || 600,
          naming_template: appSettings.naming_template || "Photo_{date}_{index:03d}"
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Batch export error");

      closeValidationModal();
      showToast(
        t("exportBatchSuccess", { count: data.count }),
        "success",
        t("openFolder"),
        () => {
          fetch("/api/open-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: data.output_directory })
          });
        }
      );
    } catch (err) {
      showToast("Export failed: " + err.message, "error");
    } finally {
      confirmBatchExportBtn.disabled = false;
      hideLoading();
    }
  });

  // Multi-Page Session Functions
  async function addNewPage(scanId) {
    showLoading(t("scanningWait"));
    try {
      const img = new Image();
      img.src = `/api/scans/${scanId}`;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const pageNumber = sessionPages.length + 1;
      const pageObj = {
        id: `page_${Date.now()}_${pageNumber}`,
        scan_id: scanId,
        pageNumber: pageNumber,
        imageWidth: img.naturalWidth,
        imageHeight: img.naturalHeight,
        imageElement: img,
        photos: []
      };

      // Run auto-detect for this new page
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_id: scanId,
          sensitivity: 0.5,
          min_area_ratio: 0.012,
          has_borders: hasBordersCheck.checked
        })
      });

      const data = await res.json();
      const existingPhotoCount = sessionPages.reduce((acc, p) => acc + p.photos.length, 0);

      pageObj.photos = (data.photos || []).map((p, idx) => ({
        id: p.id || `photo_p${pageNumber}_${idx + 1}`,
        corners: p.corners,
        angle: p.angle,
        rotation_90_steps: 0,
        fine_angle_deg: 0.0,
        margin_px: 0,
        filename: `Photo_${String(existingPhotoCount + idx + 1).padStart(3, "0")}`,
        included: true,
        preview_url: null
      }));

      sessionPages.push(pageObj);

      // Fetch previews for this page
      for (const ph of pageObj.photos) {
        await fetchPreviewForPhoto(ph, pageObj.scan_id);
      }

      renderPagesStrip();
      await switchPage(sessionPages.length - 1);
      syncSessionToServer(true);

      showToast(t("multiScanPrompt", { page: pageNumber, count: pageObj.photos.length }), "success");
    } catch (err) {
      showToast("Error processing page: " + err.message, "error");
    } finally {
      hideLoading();
    }
  }

  async function switchPage(index) {
    if (index < 0 || index >= sessionPages.length) return;

    // Save current canvas boxes to current active page first
    if (activePageIndex >= 0 && activePageIndex < sessionPages.length) {
      sessionPages[activePageIndex].photos = scanCanvas.boxes;
    }

    activePageIndex = index;
    const page = sessionPages[activePageIndex];

    scanCanvas.setImage(page.imageElement, page.imageWidth, page.imageHeight);
    scanCanvas.setBoxes(page.photos);

    renderPagesStrip();
    renderCards();
    updateTotalCounts();
  }

  function removePage(index) {
    if (index < 0 || index >= sessionPages.length) return;
    sessionPages.splice(index, 1);
    // Re-number remaining pages
    sessionPages.forEach((p, idx) => (p.pageNumber = idx + 1));

    if (sessionPages.length === 0) {
      activePageIndex = -1;
      scanCanvas.image = null;
      scanCanvas.boxes = [];
      scanCanvas.render();
      renderCards();
    } else {
      const nextIdx = Math.min(index, sessionPages.length - 1);
      switchPage(nextIdx);
    }

    renderPagesStrip();
    updateTotalCounts();
    syncSessionToServer(true);
  }

  function renderPagesStrip() {
    pagesList.innerHTML = "";

    sessionPages.forEach((page, idx) => {
      const isActive = idx === activePageIndex;
      const pageEl = document.createElement("div");
      pageEl.className = `page-item ${isActive ? "active" : ""}`;

      pageEl.innerHTML = `
        <img class="page-thumb" src="/api/scans/${page.scan_id}?max_size=80" alt="Page ${page.pageNumber}">
        <span>${t("page")} ${page.pageNumber}</span>
        <span class="page-badge">${page.photos.length}</span>
        <button class="btn-remove-page" title="${t("deletePage")}">✕</button>
      `;

      pageEl.addEventListener("click", (e) => {
        if (e.target.classList.contains("btn-remove-page")) {
          e.stopPropagation();
          removePage(idx);
        } else {
          switchPage(idx);
        }
      });

      pagesList.appendChild(pageEl);
    });

    updateTotalCounts();
  }

  function updateTotalCounts() {
    const totalPhotos = sessionPages.reduce((acc, p) => acc + p.photos.length, 0);
    if (totalPhotosCount) {
      totalPhotosCount.textContent = totalPhotos;
    }
    if (validateBtn) {
      validateBtn.disabled = totalPhotos === 0;
    }
    if (exportAllBtn) {
      exportAllBtn.disabled = totalPhotos === 0;
    }
  }

  async function runAutoDetect(pageIndex) {
    const page = sessionPages[pageIndex];
    if (!page) return;

    showLoading("Detecting photos...");
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_id: page.scan_id,
          sensitivity: 0.5,
          min_area_ratio: 0.012,
          has_borders: hasBordersCheck.checked
        })
      });

      const data = await res.json();
      page.photos = (data.photos || []).map((p, idx) => ({
        id: p.id || `photo_p${page.pageNumber}_${idx + 1}`,
        corners: p.corners,
        angle: p.angle,
        rotation_90_steps: 0,
        fine_angle_deg: 0.0,
        margin_px: 0,
        filename: `Photo_P${page.pageNumber}_${String(idx + 1).padStart(3, "0")}`,
        included: true,
        preview_url: null
      }));

      for (const ph of page.photos) {
        await fetchPreviewForPhoto(ph, page.scan_id);
      }

      if (activePageIndex === pageIndex) {
        scanCanvas.setBoxes(page.photos);
        renderCards();
      }
      renderPagesStrip();
      updateTotalCounts();
      syncSessionToServer(true);
    } catch (err) {
      showToast("Detection error: " + err.message, "error");
    } finally {
      hideLoading();
    }
  }

  async function fetchPreviewForPhoto(photo, scanId) {
    try {
      const res = await fetch("/api/preview-crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_id: scanId,
          crop: {
            id: photo.id,
            corners: photo.corners,
            rotation_90_steps: photo.rotation_90_steps || 0,
            fine_angle_deg: photo.fine_angle_deg || 0.0,
            margin_px: photo.margin_px || 0
          }
        })
      });
      const data = await res.json();
      if (res.ok) {
        photo.preview_url = data.preview_url;
      }
    } catch (e) {
      console.error("Preview crop error:", e);
    }
  }

  // Sidebar cards rendering for active page
  function renderCards() {
    const page = activePageIndex >= 0 ? sessionPages[activePageIndex] : null;
    const currentPhotos = page ? page.photos : [];

    photoCountBadge.textContent = currentPhotos.length;
    photoCardsList.innerHTML = "";

    if (!page || currentPhotos.length === 0) {
      photoCardsList.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.4;">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <p>${t("noPhotosDetected")}</p>
        </div>
      `;
      return;
    }

    currentPhotos.forEach((photo, idx) => {
      const isSelected = photo.id === scanCanvas.selectedBoxId;
      const card = document.createElement("div");
      card.className = `photo-card ${isSelected ? "selected" : ""}`;
      card.id = `card_${photo.id}`;

      card.innerHTML = `
        <div class="photo-card-preview">
          <img src="${photo.preview_url || ""}" alt="Photo ${idx + 1}" id="img_${photo.id}">
        </div>
        <div class="photo-card-body">
          <div class="photo-title-row">
            <span style="font-weight: 600; font-size: 0.85rem;">#${idx + 1}</span>
            <input type="text" class="photo-title-input" value="${photo.filename || ""}" placeholder="${t("filenamePlaceholder")}">
            <div class="photo-btn-group">
              <button class="btn-icon btn-rotate-ccw" title="${t("rotateCCW")}">↺</button>
              <button class="btn-icon btn-rotate-cw" title="${t("rotateCW")}">↻</button>
              <button class="btn-icon btn-delete" title="Delete" style="color: var(--danger-color);">✕</button>
            </div>
          </div>

          <div class="slider-row">
            <span>${t("fineAngle")}</span>
            <input type="range" class="fine-angle-slider" min="-5" max="5" step="0.2" value="${photo.fine_angle_deg || 0}">
            <span class="fine-angle-val">${(photo.fine_angle_deg || 0).toFixed(1)}°</span>
          </div>

          <div class="slider-row">
            <span>${t("marginTrim")}</span>
            <input type="range" class="margin-slider" min="0" max="25" step="1" value="${photo.margin_px || 0}">
            <span class="margin-val">${photo.margin_px || 0}px</span>
          </div>
        </div>
      `;

      card.addEventListener("click", (e) => {
        if (e.target.tagName !== "INPUT" && e.target.tagName !== "BUTTON") {
          scanCanvas.selectBox(photo.id);
        }
      });

      const titleInput = card.querySelector(".photo-title-input");
      titleInput.addEventListener("input", (e) => {
        photo.filename = e.target.value;
        syncSessionToServer();
      });

      card.querySelector(".btn-rotate-ccw").addEventListener("click", async () => {
        photo.rotation_90_steps = ((photo.rotation_90_steps || 0) + 3) % 4;
        await updateCardPreview(photo, page.scan_id);
        syncSessionToServer();
      });

      card.querySelector(".btn-rotate-cw").addEventListener("click", async () => {
        photo.rotation_90_steps = ((photo.rotation_90_steps || 0) + 1) % 4;
        await updateCardPreview(photo, page.scan_id);
        syncSessionToServer();
      });

      card.querySelector(".btn-delete").addEventListener("click", () => {
        scanCanvas.selectedBoxId = photo.id;
        scanCanvas.deleteSelectedBox();
        page.photos = scanCanvas.boxes;
        renderCards();
        renderPagesStrip();
        updateTotalCounts();
        syncSessionToServer();
      });

      const angleSlider = card.querySelector(".fine-angle-slider");
      const angleVal = card.querySelector(".fine-angle-val");
      angleSlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        photo.fine_angle_deg = val;
        angleVal.textContent = `${val.toFixed(1)}°`;
      });
      angleSlider.addEventListener("change", async () => {
        await updateCardPreview(photo, page.scan_id);
        syncSessionToServer();
      });

      const marginSlider = card.querySelector(".margin-slider");
      const marginVal = card.querySelector(".margin-val");
      marginSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        photo.margin_px = val;
        marginVal.textContent = `${val}px`;
      });
      marginSlider.addEventListener("change", async () => {
        await updateCardPreview(photo, page.scan_id);
        syncSessionToServer();
      });

      photoCardsList.appendChild(card);
    });
  }

  async function updateCardPreview(photo, scanId) {
    await fetchPreviewForPhoto(photo, scanId);
    const imgEl = document.getElementById(`img_${photo.id}`);
    if (imgEl && photo.preview_url) {
      imgEl.src = photo.preview_url;
    }
  }

  function onSelectionChanged(selectedId) {
    document.querySelectorAll(".photo-card").forEach((c) => c.classList.remove("selected"));
    if (selectedId) {
      const card = document.getElementById(`card_${selectedId}`);
      if (card) {
        card.classList.add("selected");
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  let debounceTimer = null;
  function onBoxUpdated(updatedBox) {
    if (activePageIndex < 0 || !sessionPages[activePageIndex]) return;
    const page = sessionPages[activePageIndex];

    let photo = page.photos.find((p) => p.id === updatedBox.id);
    if (!photo) {
      photo = updatedBox;
      photo.included = true;
      page.photos.push(photo);
      renderCards();
      renderPagesStrip();
      updateTotalCounts();
    } else {
      photo.corners = updatedBox.corners;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      await updateCardPreview(photo, page.scan_id);
      syncSessionToServer();
    }, 250);
  }

  // VALIDATION & REVIEW MODAL LOGIC
  function openValidationModal() {
    if (activePageIndex >= 0 && sessionPages[activePageIndex]) {
      sessionPages[activePageIndex].photos = scanCanvas.boxes;
    }

    const allPhotos = sessionPages.flatMap((p) => p.photos);
    if (allPhotos.length === 0) {
      showToast(t("noPhotosInValidation"), "error");
      return;
    }

    valOutputDir.value = appSettings.output_dir || "~/Pictures/Scans";
    if (valNamingPatternInput) {
      valNamingPatternInput.value = appSettings.naming_template || "Photo_{date}_{index:03d}";
    }
    currentValidationFilter = "all";

    renderValidationTabs();
    renderValidationGrid("all");
    updateValidationStats();

    validationModal.classList.add("open");
  }

  function renderValidationTabs() {
    validationTabs.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.className = `tab-btn ${currentValidationFilter === "all" ? "active" : ""}`;
    allBtn.textContent = t("filterAll");
    allBtn.addEventListener("click", () => {
      currentValidationFilter = "all";
      setActiveTab(allBtn);
      renderValidationGrid("all");
    });
    validationTabs.appendChild(allBtn);

    sessionPages.forEach((page, pIdx) => {
      const pageBtn = document.createElement("button");
      pageBtn.className = `tab-btn ${currentValidationFilter === pIdx ? "active" : ""}`;
      pageBtn.textContent = t("filterPage", { num: page.pageNumber }) + ` (${page.photos.length})`;
      pageBtn.addEventListener("click", () => {
        currentValidationFilter = pIdx;
        setActiveTab(pageBtn);
        renderValidationGrid(pIdx);
      });
      validationTabs.appendChild(pageBtn);
    });
  }

  function setActiveTab(activeBtn) {
    document.querySelectorAll(".validation-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
    activeBtn.classList.add("active");
  }

  function getFilteredPhotos(filter) {
    const list = [];
    sessionPages.forEach((page, pIdx) => {
      if (filter === "all" || filter === pIdx) {
        page.photos.forEach((photo) => {
          list.push({ photo, page, pageIndex: pIdx });
        });
      }
    });
    return list;
  }

  function renderValidationGrid(filter = "all") {
    validationGrid.innerHTML = "";
    const items = getFilteredPhotos(filter);

    if (items.length === 0) {
      validationGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>${t("noPhotosDetected")}</p></div>`;
      return;
    }

    items.forEach(({ photo, page, pageIndex }) => {
      const isIncluded = photo.included !== false;
      const card = document.createElement("div");
      card.className = `validation-card ${isIncluded ? "included" : "excluded"}`;
      card.id = `val_card_${photo.id}`;

      card.innerHTML = `
        <div class="validation-card-header">
          <label>
            <input type="checkbox" class="val-checkbox" ${isIncluded ? "checked" : ""}>
            <span>${t("includeInExport")}</span>
          </label>
          <span class="validation-page-pill">${t("page")} ${page.pageNumber}</span>
        </div>
        <div class="validation-card-preview">
          <img src="${photo.preview_url || ""}" alt="${photo.filename || "Photo"}" id="val_img_${photo.id}">
        </div>
        <div class="validation-card-body">
          <input type="text" class="photo-title-input val-name-input" value="${photo.filename || ""}" placeholder="${t("filenamePlaceholder")}">
        </div>
        <div class="validation-card-footer">
          <div class="photo-btn-group">
            <button class="btn-icon val-btn-ccw" title="${t("rotateCCW")}">↺</button>
            <button class="btn-icon val-btn-cw" title="${t("rotateCW")}">↻</button>
          </div>
          <button class="btn btn-secondary val-btn-adjust" style="font-size: 0.75rem; padding: 4px 8px;">
            ${t("adjustInCanvas")}
          </button>
        </div>
      `;

      // Checkbox listener
      const chk = card.querySelector(".val-checkbox");
      chk.addEventListener("change", (e) => {
        photo.included = e.target.checked;
        card.classList.toggle("included", photo.included);
        card.classList.toggle("excluded", !photo.included);
        updateValidationStats();
      });

      // Name input listener
      const nameInput = card.querySelector(".val-name-input");
      nameInput.addEventListener("input", (e) => {
        photo.filename = e.target.value;
      });

      // Rotate CCW
      card.querySelector(".val-btn-ccw").addEventListener("click", async () => {
        photo.rotation_90_steps = ((photo.rotation_90_steps || 0) + 3) % 4;
        await fetchPreviewForPhoto(photo, page.scan_id);
        const img = card.querySelector(`#val_img_${photo.id}`);
        if (img && photo.preview_url) img.src = photo.preview_url;
        // Also sync to active canvas if on same page
        if (activePageIndex === pageIndex) renderCards();
      });

      // Rotate CW
      card.querySelector(".val-btn-cw").addEventListener("click", async () => {
        photo.rotation_90_steps = ((photo.rotation_90_steps || 0) + 1) % 4;
        await fetchPreviewForPhoto(photo, page.scan_id);
        const img = card.querySelector(`#val_img_${photo.id}`);
        if (img && photo.preview_url) img.src = photo.preview_url;
        if (activePageIndex === pageIndex) renderCards();
      });

      // Adjust in canvas
      card.querySelector(".val-btn-adjust").addEventListener("click", () => {
        closeValidationModal();
        switchPage(pageIndex);
        scanCanvas.selectBox(photo.id);
        showToast(t("dragHint"), "success");
      });

      validationGrid.appendChild(card);
    });
  }

  function updateValidationStats() {
    const totalPhotos = sessionPages.reduce((acc, p) => acc + p.photos.length, 0);
    const selectedPhotos = sessionPages.reduce(
      (acc, p) => acc + p.photos.filter((ph) => ph.included !== false).length,
      0
    );

    validationStats.textContent = t("validationSummary", {
      pages: sessionPages.length,
      total: totalPhotos,
      selected: selectedPhotos
    });

    exportBatchBtnText.textContent = t("exportBatchBtn", { count: selectedPhotos });
    confirmBatchExportBtn.disabled = selectedPhotos === 0;
  }

  // Settings & Scanners loading
  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      appSettings = await res.json();
      if (appSettings.language) {
        setLanguage(appSettings.language);
      }
      if (appSettings.default_dpi) {
        dpiSelect.value = String(appSettings.default_dpi);
      }
      updateExportLabel();
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  async function loadScanners() {
    try {
      const res = await fetch("/api/scanners");
      const data = await res.json();
      scannerSelect.innerHTML = "";

      if (!data.scanners || data.scanners.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = t("noScannerFound");
        scannerSelect.appendChild(opt);
        return;
      }

      data.scanners.forEach((sc) => {
        const opt = document.createElement("option");
        opt.value = sc.id;
        opt.textContent = sc.display_name;
        if (!sc.is_camera) {
          opt.selected = true;
        }
        scannerSelect.appendChild(opt);
      });
    } catch (e) {
      console.error("Failed to list scanners:", e);
    }
  }

  // Loading & Progress helpers
  function showLoading(msg, showProgress = false) {
    loadingText.textContent = msg;
    if (progressBox) {
      progressBox.style.display = showProgress ? "block" : "none";
      if (progressBoxBar) progressBoxBar.style.width = "40%";
    }
    loadingOverlay.classList.add("active");
  }

  function hideLoading() {
    loadingOverlay.classList.remove("active");
    if (progressBox) progressBox.style.display = "none";
  }

  // Toast Notifications
  function showToast(msg, type = "success", actionText = null, onAction = null) {
    toastMessage.textContent = msg;
    const existingAction = toastNotification.querySelector(".toast-action-btn");
    if (existingAction) existingAction.remove();

    if (actionText && onAction) {
      const btn = document.createElement("button");
      btn.className = "toast-action-btn";
      btn.textContent = actionText;
      btn.addEventListener("click", () => {
        onAction();
      });
      toastNotification.appendChild(btn);
    }

    toastNotification.className = `toast show ${type}`;
    setTimeout(() => {
      toastNotification.classList.remove("show");
    }, 6000);
  }
});
