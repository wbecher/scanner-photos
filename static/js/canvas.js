class ScanCanvas {
  constructor(canvasElement, onSelectionChange, onCropChange) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext("2d");
    this.onSelectionChange = onSelectionChange;
    this.onCropChange = onCropChange;

    this.image = null; // HTMLImageElement
    this.imageWidth = 0;
    this.imageHeight = 0;

    // Viewport transform
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;

    // Photo boxes: [{ id, corners: [[x,y],[x,y],[x,y],[x,y]], rotation_90_steps, fine_angle_deg, margin_px, filename }]
    this.boxes = [];
    this.selectedBoxId = null;

    // Interaction states
    this.dragMode = null; // 'PAN', 'DRAG_CORNER', 'DRAG_BOX', 'DRAW_BOX'
    this.activeCornerIndex = -1;
    this.dragStartMouse = { x: 0, y: 0 };
    this.dragStartBoxCorners = null;
    this.newBoxStart = null;
    this.isAddBoxActive = false;

    this.handleRadius = 8; // Screen px for mouse
    this.touchHandleRadius = 24; // Screen px for finger touch targets on tablet

    // Corner adjustment, Loupe & Focus states
    this.focusedCornerIndex = -1;
    this.loupeZoom = 3.0;
    this.loupeSize = 140;
    this.showLoupe = false;
    this.loupePos = { x: 0, y: 0 };
    this.loupeTarget = { x: 0, y: 0 };
    this.isTouchDrag = false;
    this.shortcuts = {
      cycle_corner: "Tab",
      cycle_corner_reverse: "Shift+Tab",
      nudge_up: "ArrowUp",
      nudge_down: "ArrowDown",
      nudge_left: "ArrowLeft",
      nudge_right: "ArrowRight",
      exit_focus: "Escape"
    };

    // Touch and Pinch states
    this.pinchStartDist = null;
    this.pinchStartScale = 1.0;
    this.pinchStartCenter = null;
    this.pinchStartPan = null;
    this.lastTouchPos = null;

    this.initEvents();
    this.resizeCanvas();
  }

  setShortcuts(shortcuts) {
    if (shortcuts && typeof shortcuts === "object") {
      this.shortcuts = { ...this.shortcuts, ...shortcuts };
    }
  }

  setLoupePreferences(zoom, size) {
    if (zoom) this.loupeZoom = parseFloat(zoom);
    if (size) this.loupeSize = parseInt(size, 10);
  }

  computeLoupeScreenPos(sx, sy, isTouch = false) {
    const d = this.loupeSize || 140;
    const r = d / 2;
    const margin = 12;

    let lx, ly;
    if (isTouch) {
      lx = sx;
      ly = sy - 90 - r;
    } else {
      lx = sx + 50 + r;
      ly = sy - 50 - r;
    }

    // Boundary collision adjustments
    if (ly - r < margin) {
      ly = sy + (isTouch ? 80 : 50) + r;
    }
    if (ly + r > this.canvas.height - margin) {
      ly = this.canvas.height - margin - r;
    }
    if (lx + r > this.canvas.width - margin) {
      lx = sx - (isTouch ? 0 : 50) - r;
    }
    if (lx - r < margin) {
      lx = margin + r;
    }

    return { x: lx, y: ly };
  }

  focusNextCorner(reverse = false) {
    if (!this.boxes || this.boxes.length === 0) return;
    if (!this.selectedBoxId) {
      this.selectBox(this.boxes[0].id);
    }
    const box = this.boxes.find(b => b.id === this.selectedBoxId);
    if (!box) return;

    if (this.focusedCornerIndex === -1) {
      this.focusedCornerIndex = reverse ? 3 : 0;
    } else {
      this.focusedCornerIndex = (this.focusedCornerIndex + (reverse ? 3 : 1)) % 4;
    }

    // Auto-pan viewport to center on the focused corner
    const [cx, cy] = box.corners[this.focusedCornerIndex];
    const targetScale = Math.max(this.scale, 1.0);
    this.scale = targetScale;
    this.panX = this.canvas.width / 2 - cx * this.scale;
    this.panY = this.canvas.height / 2 - cy * this.scale;

    this.showLoupe = true;
    const cornerScreen = this.imageToScreen(cx, cy);
    this.loupeTarget = { x: cx, y: cy };
    this.loupePos = this.computeLoupeScreenPos(cornerScreen.x, cornerScreen.y, false);

    this.render();
  }

  nudgeFocusedCorner(dx, dy) {
    if (!this.selectedBoxId || this.focusedCornerIndex < 0) return;
    const box = this.boxes.find(b => b.id === this.selectedBoxId);
    if (!box) return;

    box.corners[this.focusedCornerIndex][0] = Math.max(0, Math.min(this.imageWidth, box.corners[this.focusedCornerIndex][0] + dx));
    box.corners[this.focusedCornerIndex][1] = Math.max(0, Math.min(this.imageHeight, box.corners[this.focusedCornerIndex][1] + dy));

    // Recompute angle
    const pt0 = box.corners[0];
    const pt1 = box.corners[1];
    const rad = Math.atan2(pt1[1] - pt0[1], pt1[0] - pt0[0]);
    box.angle = Math.round((rad * 180 / Math.PI) * 100) / 100;

    const [cx, cy] = box.corners[this.focusedCornerIndex];
    this.showLoupe = true;
    this.loupeTarget = { x: cx, y: cy };
    const cornerScreen = this.imageToScreen(cx, cy);
    this.loupePos = this.computeLoupeScreenPos(cornerScreen.x, cornerScreen.y, false);

    if (this.onCropChange) {
      this.onCropChange(box);
    }
    this.render();
  }

  clearFocusedCorner() {
    this.focusedCornerIndex = -1;
    this.showLoupe = false;
    this.render();
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.render();
  }

  setImage(imageElement, originalWidth, originalHeight) {
    this.image = imageElement;
    this.imageWidth = (imageElement && imageElement.naturalWidth) || originalWidth || (imageElement && imageElement.width) || 0;
    this.imageHeight = (imageElement && imageElement.naturalHeight) || originalHeight || (imageElement && imageElement.height) || 0;
    this.fitToScreen();
  }

  setBoxes(boxes) {
    this.boxes = boxes || [];
    if (this.boxes.length > 0 && !this.selectedBoxId) {
      this.selectedBoxId = this.boxes[0].id;
    }
    this.focusedCornerIndex = -1;
    this.showLoupe = false;
    this.render();
  }

  fitToScreen() {
    if (!this.image || this.canvas.width === 0 || this.canvas.height === 0) return;
    const padding = 30;
    const availW = this.canvas.width - padding * 2;
    const availH = this.canvas.height - padding * 2;

    const scaleX = availW / this.imageWidth;
    const scaleY = availH / this.imageHeight;
    this.scale = Math.min(scaleX, scaleY);

    this.panX = (this.canvas.width - this.imageWidth * this.scale) / 2;
    this.panY = (this.canvas.height - this.imageHeight * this.scale) / 2;

    this.render();
  }

  setZoom(newScale, centerScreenX, centerScreenY) {
    newScale = Math.max(0.05, Math.min(10.0, newScale));
    const cx = centerScreenX !== undefined ? centerScreenX : this.canvas.width / 2;
    const cy = centerScreenY !== undefined ? centerScreenY : this.canvas.height / 2;

    const imgX = (cx - this.panX) / this.scale;
    const imgY = (cy - this.panY) / this.scale;

    this.scale = newScale;
    this.panX = cx - imgX * this.scale;
    this.panY = cy - imgY * this.scale;

    this.render();
  }

  // Coordinate transforms
  screenToImage(sx, sy) {
    return {
      x: (sx - this.panX) / this.scale,
      y: (sy - this.panY) / this.scale
    };
  }

  imageToScreen(ix, iy) {
    return {
      x: ix * this.scale + this.panX,
      y: iy * this.scale + this.panY
    };
  }

  initEvents() {
    window.addEventListener("resize", () => this.resizeCanvas());
    window.addEventListener("orientationchange", () => setTimeout(() => this.resizeCanvas(), 250));

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      this.setZoom(this.scale * zoomFactor, e.offsetX, e.offsetY);
    }, { passive: false });

    // Mouse events
    this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
    window.addEventListener("mousemove", (e) => this.onMouseMove(e));
    window.addEventListener("mouseup", (e) => this.onMouseUp(e));

    // Touch events for tablets and mobile devices
    this.canvas.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
    window.addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: false });
    window.addEventListener("touchend", (e) => this.onTouchEnd(e), { passive: false });
    window.addEventListener("touchcancel", (e) => this.onTouchEnd(e), { passive: false });

    window.addEventListener("keydown", (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (document.querySelector(".modal-overlay.open")) return;

      const sc = this.shortcuts || {};
      const cycleKey = sc.cycle_corner || "Tab";
      const cycleRevKey = sc.cycle_corner_reverse || "Shift+Tab";
      const nudgeUp = sc.nudge_up || "ArrowUp";
      const nudgeDown = sc.nudge_down || "ArrowDown";
      const nudgeLeft = sc.nudge_left || "ArrowLeft";
      const nudgeRight = sc.nudge_right || "ArrowRight";
      const exitFocus = sc.exit_focus || "Escape";

      const matchesKey = (targetKey, evt) => {
        if (!targetKey) return false;
        if (targetKey === "Tab" && evt.key === "Tab" && !evt.shiftKey) return true;
        if (targetKey === "Shift+Tab" && evt.key === "Tab" && evt.shiftKey) return true;
        return evt.key === targetKey || evt.code === targetKey;
      };

      // Corner cycling via Tab or custom shortcut
      if (matchesKey(cycleRevKey, e)) {
        if (this.selectedBoxId || this.boxes.length > 0) {
          e.preventDefault();
          this.focusNextCorner(true);
          return;
        }
      } else if (matchesKey(cycleKey, e)) {
        if (this.selectedBoxId || this.boxes.length > 0) {
          e.preventDefault();
          this.focusNextCorner(false);
          return;
        }
      }

      // Exit corner focus / loupe
      if (matchesKey(exitFocus, e) || e.key === "Escape") {
        if (this.focusedCornerIndex >= 0 || this.showLoupe) {
          this.clearFocusedCorner();
          return;
        }
      }

      // Nudging focused corner via arrow keys
      if (this.focusedCornerIndex >= 0 && this.selectedBoxId) {
        const step = e.shiftKey ? 10 : 1;
        if (matchesKey(nudgeUp, e)) {
          e.preventDefault();
          this.nudgeFocusedCorner(0, -step);
          return;
        }
        if (matchesKey(nudgeDown, e)) {
          e.preventDefault();
          this.nudgeFocusedCorner(0, step);
          return;
        }
        if (matchesKey(nudgeLeft, e)) {
          e.preventDefault();
          this.nudgeFocusedCorner(-step, 0);
          return;
        }
        if (matchesKey(nudgeRight, e)) {
          e.preventDefault();
          this.nudgeFocusedCorner(step, 0);
          return;
        }
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        this.deleteSelectedBox();
      } else if (e.key === "+" || e.key === "=") {
        this.setZoom(this.scale * 1.2);
      } else if (e.key === "-") {
        this.setZoom(this.scale * 0.8);
      } else if (e.key === "0") {
        this.fitToScreen();
      }
    });
  }

  hitTestCorner(screenX, screenY, isTouch = false) {
    const radius = isTouch ? this.touchHandleRadius : this.handleRadius;
    for (let b = this.boxes.length - 1; b >= 0; b--) {
      const box = this.boxes[b];
      for (let c = 0; c < 4; c++) {
        const pt = this.imageToScreen(box.corners[c][0], box.corners[c][1]);
        const dist = Math.hypot(screenX - pt.x, screenY - pt.y);
        if (dist <= radius + (isTouch ? 8 : 4)) {
          return { boxId: box.id, cornerIndex: c };
        }
      }
    }
    return null;
  }

  isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  hitTestBox(screenX, screenY) {
    const imgPt = this.screenToImage(screenX, screenY);
    for (let b = this.boxes.length - 1; b >= 0; b--) {
      const box = this.boxes[b];
      if (this.isPointInPolygon(imgPt, box.corners)) {
        return box.id;
      }
    }
    return null;
  }

  startDrag(sx, sy, isTouch = false, isMiddle = false) {
    if (isMiddle) {
      this.dragMode = "PAN";
      this.dragStartMouse = { x: sx, y: sy };
      return;
    }

    if (this.isAddBoxActive) {
      this.dragMode = "DRAW_BOX";
      this.newBoxStart = this.screenToImage(sx, sy);
      return;
    }

    // 1. Check corner handle click/touch
    const cornerHit = this.hitTestCorner(sx, sy, isTouch);
    if (cornerHit) {
      this.dragMode = "DRAG_CORNER";
      this.selectedBoxId = cornerHit.boxId;
      this.activeCornerIndex = cornerHit.cornerIndex;
      this.focusedCornerIndex = cornerHit.cornerIndex;
      this.dragStartMouse = { x: sx, y: sy };
      this.isTouchDrag = isTouch;
      const box = this.boxes.find(b => b.id === this.selectedBoxId);
      if (box) {
        this.showLoupe = true;
        this.loupeTarget = { x: box.corners[this.activeCornerIndex][0], y: box.corners[this.activeCornerIndex][1] };
        this.loupePos = this.computeLoupeScreenPos(sx, sy, isTouch);
      }
      this.onSelectionChange(this.selectedBoxId);
      this.render();
      return;
    }

    // 2. Check box interior click/touch
    const boxHit = this.hitTestBox(sx, sy);
    if (boxHit) {
      this.dragMode = "DRAG_BOX";
      this.selectedBoxId = boxHit;
      this.focusedCornerIndex = -1;
      this.showLoupe = false;
      this.dragStartMouse = { x: sx, y: sy };
      const box = this.boxes.find(b => b.id === boxHit);
      this.dragStartBoxCorners = box.corners.map(c => [...c]);
      this.onSelectionChange(this.selectedBoxId);
      this.render();
      return;
    }

    // 3. Canvas background: start Pan
    this.dragMode = "PAN";
    this.dragStartMouse = { x: sx, y: sy };
    this.selectedBoxId = null;
    this.focusedCornerIndex = -1;
    this.showLoupe = false;
    this.onSelectionChange(null);
    this.render();
  }

  updateDrag(sx, sy) {
    if (!this.dragMode) return;

    if (this.dragMode === "PAN") {
      this.canvas.style.cursor = "grabbing";
      const dx = sx - this.dragStartMouse.x;
      const dy = sy - this.dragStartMouse.y;
      this.panX += dx;
      this.panY += dy;
      this.dragStartMouse = { x: sx, y: sy };
      this.render();
    } else if (this.dragMode === "DRAG_CORNER") {
      this.canvas.style.cursor = "pointer";
      const box = this.boxes.find(b => b.id === this.selectedBoxId);
      if (box && this.activeCornerIndex >= 0) {
        const imgPt = this.screenToImage(sx, sy);
        box.corners[this.activeCornerIndex] = [
          Math.max(0, Math.min(this.imageWidth, imgPt.x)),
          Math.max(0, Math.min(this.imageHeight, imgPt.y))
        ];
        this.showLoupe = true;
        this.loupeTarget = { x: box.corners[this.activeCornerIndex][0], y: box.corners[this.activeCornerIndex][1] };
        this.loupePos = this.computeLoupeScreenPos(sx, sy, this.isTouchDrag);
        this.render();
      }
    } else if (this.dragMode === "DRAG_BOX") {
      this.canvas.style.cursor = "move";
      const box = this.boxes.find(b => b.id === this.selectedBoxId);
      if (box && this.dragStartBoxCorners) {
        const dx = (sx - this.dragStartMouse.x) / this.scale;
        const dy = (sy - this.dragStartMouse.y) / this.scale;
        box.corners = this.dragStartBoxCorners.map(([cx, cy]) => [
          Math.max(0, Math.min(this.imageWidth, cx + dx)),
          Math.max(0, Math.min(this.imageHeight, cy + dy))
        ]);
        this.render();
      }
    } else if (this.dragMode === "DRAW_BOX") {
      this.canvas.style.cursor = "crosshair";
      this.render();
      // Draw temporary rectangle
      const curr = this.screenToImage(sx, sy);
      const p1 = this.imageToScreen(this.newBoxStart.x, this.newBoxStart.y);
      const p2 = this.imageToScreen(curr.x, curr.y);
      this.ctx.strokeStyle = "#38bdf8";
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(
        Math.min(p1.x, p2.x),
        Math.min(p1.y, p2.y),
        Math.abs(p2.x - p1.x),
        Math.abs(p2.y - p1.y)
      );
      this.ctx.setLineDash([]);
    }
  }

  endDrag(sx, sy) {
    if (this.dragMode === "DRAW_BOX" && this.newBoxStart) {
      const curr = this.screenToImage(sx, sy);
      const minX = Math.min(this.newBoxStart.x, curr.x);
      const maxX = Math.max(this.newBoxStart.x, curr.x);
      const minY = Math.min(this.newBoxStart.y, curr.y);
      const maxY = Math.max(this.newBoxStart.y, curr.y);

      if (maxX - minX > 30 && maxY - minY > 30) {
        const newId = `photo_${Date.now()}`;
        const newBox = {
          id: newId,
          corners: [
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY]
          ],
          rotation_90_steps: 0,
          fine_angle_deg: 0.0,
          margin_px: 0,
          filename: ""
        };
        this.boxes.push(newBox);
        this.selectedBoxId = newId;
        this.isAddBoxActive = false;
        if (this.onCropChange) this.onCropChange(newBox);
        if (this.onSelectionChange) this.onSelectionChange(newId);
      }
      this.newBoxStart = null;
    } else if (this.dragMode === "DRAG_CORNER" || this.dragMode === "DRAG_BOX") {
      const box = this.boxes.find(b => b.id === this.selectedBoxId);
      if (box) {
        if (this.dragMode === "DRAG_CORNER") {
          const pt0 = box.corners[0];
          const pt1 = box.corners[1];
          const rad = Math.atan2(pt1[1] - pt0[1], pt1[0] - pt0[0]);
          box.angle = Math.round((rad * 180 / Math.PI) * 100) / 100;
        }
        if (this.onCropChange) {
          this.onCropChange(box);
        }
      }
    }

    this.showLoupe = false;
    this.isTouchDrag = false;
    this.dragMode = null;
    this.activeCornerIndex = -1;
    this.dragStartBoxCorners = null;
    this.render();
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    this.startDrag(sx, sy, false, e.button === 1 || e.spaceKey);
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (!this.dragMode) {
      if (this.isAddBoxActive) {
        this.canvas.style.cursor = "crosshair";
      } else if (this.hitTestCorner(sx, sy, false)) {
        this.canvas.style.cursor = "pointer";
      } else if (this.hitTestBox(sx, sy)) {
        this.canvas.style.cursor = "move";
      } else {
        this.canvas.style.cursor = "grab";
      }
      return;
    }
    this.updateDrag(sx, sy);
  }

  onMouseUp(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    this.endDrag(sx, sy);
  }

  onTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      this.dragMode = "PINCH";
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const rect = this.canvas.getBoundingClientRect();
      this.pinchStartDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      this.pinchStartScale = this.scale;
      this.pinchStartCenter = {
        x: (t0.clientX + t1.clientX) / 2 - rect.left,
        y: (t0.clientY + t1.clientY) / 2 - rect.top
      };
      this.pinchStartPan = { x: this.panX, y: this.panY };
      return;
    }

    if (e.touches.length === 1) {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.touches[0].clientX - rect.left;
      const sy = e.touches[0].clientY - rect.top;
      this.lastTouchPos = { x: sx, y: sy };
      this.startDrag(sx, sy, true, false);
    }
  }

  onTouchMove(e) {
    if (this.dragMode === "PINCH" && e.touches.length === 2) {
      e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const rect = this.canvas.getBoundingClientRect();
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      if (this.pinchStartDist && dist > 0) {
        const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
        const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
        const scaleFactor = dist / this.pinchStartDist;
        const newScale = Math.max(0.05, Math.min(10.0, this.pinchStartScale * scaleFactor));

        const imgX = (this.pinchStartCenter.x - this.pinchStartPan.x) / this.pinchStartScale;
        const imgY = (this.pinchStartCenter.y - this.pinchStartPan.y) / this.pinchStartScale;

        this.scale = newScale;
        this.panX = midX - imgX * newScale;
        this.panY = midY - imgY * newScale;
        this.render();
      }
      return;
    }

    if (this.dragMode && e.touches.length === 1) {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.touches[0].clientX - rect.left;
      const sy = e.touches[0].clientY - rect.top;
      this.lastTouchPos = { x: sx, y: sy };
      this.updateDrag(sx, sy);
    }
  }

  onTouchEnd(e) {
    if (this.dragMode === "PINCH") {
      this.dragMode = null;
      this.pinchStartDist = null;
      this.pinchStartCenter = null;
      this.render();
      return;
    }

    if (this.dragMode) {
      const pos = this.lastTouchPos || { x: 0, y: 0 };
      this.endDrag(pos.x, pos.y);
    }
  }

  selectBox(boxId) {
    if (this.selectedBoxId !== boxId) {
      this.focusedCornerIndex = -1;
      this.showLoupe = false;
    }
    this.selectedBoxId = boxId;
    this.render();
  }

  deleteSelectedBox() {
    if (!this.selectedBoxId) return;
    this.boxes = this.boxes.filter(b => b.id !== this.selectedBoxId);
    this.selectedBoxId = this.boxes.length > 0 ? this.boxes[0].id : null;
    this.focusedCornerIndex = -1;
    this.showLoupe = false;
    this.onSelectionChange(this.selectedBoxId);
    this.render();
  }

  render() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.image) {
      return;
    }

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.scale, this.scale);

    // Draw background scanner image
    ctx.drawImage(this.image, 0, 0, this.imageWidth, this.imageHeight);
    ctx.restore();

    // Draw photo quadrilateral overlays
    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i];
      const isSelected = box.id === this.selectedBoxId;
      this.drawBox(box, i + 1, isSelected);
    }

    // Draw magnifying loupe HUD if active
    if (this.showLoupe) {
      this.drawLoupe();
    }
  }

  drawBox(box, number, isSelected) {
    const { ctx } = this;
    const pts = box.corners.map(c => this.imageToScreen(c[0], c[1]));

    ctx.save();

    // Fill polygon
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();

    ctx.fillStyle = isSelected ? "rgba(245, 158, 11, 0.22)" : "rgba(56, 189, 248, 0.16)";
    ctx.fill();

    // Outline
    ctx.lineWidth = isSelected ? 2.5 : 1.8;
    ctx.strokeStyle = isSelected ? "#f59e0b" : "#38bdf8";
    ctx.stroke();

    // Corner handles
    const cornerTags = ["TL", "TR", "BR", "BL"];
    for (let c = 0; c < 4; c++) {
      const isFocusedCorner = isSelected && c === this.focusedCornerIndex;
      if (isFocusedCorner) {
        // Outer pulsing/focus ring
        ctx.beginPath();
        ctx.arc(pts[c].x, pts[c].y, this.handleRadius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Highlighted inner handle
        ctx.beginPath();
        ctx.arc(pts[c].x, pts[c].y, this.handleRadius + 2, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#f59e0b";
        ctx.stroke();

        // Corner label indicator (TL, TR, BR, BL)
        ctx.font = "bold 9px sans-serif";
        ctx.fillStyle = "#0f172a";
        const ctw = ctx.measureText(cornerTags[c]).width;
        ctx.fillText(cornerTags[c], pts[c].x - ctw / 2, pts[c].y + 3);
      } else {
        ctx.beginPath();
        ctx.arc(pts[c].x, pts[c].y, this.handleRadius, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "#f59e0b" : "#38bdf8";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
    }

    // Badge with Photo Number & Angle
    const badgeX = pts[0].x;
    const badgeY = pts[0].y - 12;

    const angleDeg = box.angle !== undefined ? `${box.angle}°` : "";
    const badgeText = `#${number} ${angleDeg}`.trim();

    ctx.font = "bold 11px sans-serif";
    const textWidth = ctx.measureText(badgeText).width;

    ctx.fillStyle = isSelected ? "#f59e0b" : "#1e293b";
    ctx.beginPath();
    ctx.roundRect(badgeX - 4, badgeY - 14, textWidth + 12, 18, 4);
    ctx.fill();
    ctx.strokeStyle = isSelected ? "#ffffff" : "#475569";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isSelected ? "#000000" : "#ffffff";
    ctx.fillText(badgeText, badgeX + 2, badgeY);

    ctx.restore();
  }

  drawLoupe() {
    if (!this.showLoupe || !this.image) return;
    const { ctx } = this;
    const d = this.loupeSize || 140;
    const r = d / 2;
    const { x: lx, y: ly } = this.loupePos;
    const { x: tx, y: ty } = this.loupeTarget;
    const zoom = this.loupeZoom || 3.0;

    ctx.save();

    // 1. Draw outer shadow & bezel
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, r + 4, 0, Math.PI * 2);
    ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.restore();

    // 2. Clip circular viewport
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = "#020617";
    ctx.fillRect(lx - r, ly - r, d, d);

    // Crisp pixelated sampling for precision alignment
    ctx.imageSmoothingEnabled = false;

    const sw = d / zoom;
    const sh = d / zoom;
    const sx = tx - sw / 2;
    const sy = ty - sh / 2;

    ctx.drawImage(this.image, sx, sy, sw, sh, lx - r, ly - r, d, d);

    // 3. Draw crosshair guide at exact center
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    const chGap = 5;
    const chLen = 24;

    ctx.beginPath();
    ctx.moveTo(lx - chLen, ly);
    ctx.lineTo(lx - chGap, ly);
    ctx.moveTo(lx + chGap, ly);
    ctx.lineTo(lx + chLen, ly);
    ctx.moveTo(lx, ly - chLen);
    ctx.lineTo(lx, ly - chGap);
    ctx.moveTo(lx, ly + chGap);
    ctx.lineTo(lx, ly + chLen);
    ctx.stroke();

    // Crosshair drop shadow lines for contrast against bright images
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.strokeRect(lx - 2, ly - 2, 4, 4);

    // Center focal dot
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();

    ctx.restore(); // end clip

    // 4. Outer metallic ring border
    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, Math.PI * 2);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#38bdf8";
    ctx.stroke();

    // 5. Magnification badge
    ctx.font = "bold 10px monospace";
    const zoomText = `${zoom.toFixed(1)}x`;
    const tw = ctx.measureText(zoomText).width;
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.beginPath();
    ctx.roundRect(lx - tw / 2 - 6, ly + r - 16, tw + 12, 14, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(zoomText, lx - tw / 2, ly + r - 5);

    ctx.restore();
  }
}
