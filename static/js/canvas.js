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

    this.handleRadius = 8; // Screen px

    this.initEvents();
    this.resizeCanvas();
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
    this.imageWidth = originalWidth || imageElement.naturalWidth || imageElement.width;
    this.imageHeight = originalHeight || imageElement.naturalHeight || imageElement.height;
    this.fitToScreen();
  }

  setBoxes(boxes) {
    this.boxes = boxes || [];
    if (this.boxes.length > 0 && !this.selectedBoxId) {
      this.selectedBoxId = this.boxes[0].id;
    }
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

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      this.setZoom(this.scale * zoomFactor, e.offsetX, e.offsetY);
    }, { passive: false });

    this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
    window.addEventListener("mousemove", (e) => this.onMouseMove(e));
    window.addEventListener("mouseup", (e) => this.onMouseUp(e));

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
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

  hitTestCorner(screenX, screenY) {
    for (let b = this.boxes.length - 1; b >= 0; b--) {
      const box = this.boxes[b];
      for (let c = 0; c < 4; c++) {
        const pt = this.imageToScreen(box.corners[c][0], box.corners[c][1]);
        const dist = Math.hypot(screenX - pt.x, screenY - pt.y);
        if (dist <= this.handleRadius + 4) {
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

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (e.button === 1 || e.spaceKey) {
      // Middle click or space pan
      this.dragMode = "PAN";
      this.dragStartMouse = { x: sx, y: sy };
      return;
    }

    if (this.isAddBoxActive) {
      this.dragMode = "DRAW_BOX";
      this.newBoxStart = this.screenToImage(sx, sy);
      return;
    }

    // 1. Check corner handle click
    const cornerHit = this.hitTestCorner(sx, sy);
    if (cornerHit) {
      this.dragMode = "DRAG_CORNER";
      this.selectedBoxId = cornerHit.boxId;
      this.activeCornerIndex = cornerHit.cornerIndex;
      this.dragStartMouse = { x: sx, y: sy };
      this.onSelectionChange(this.selectedBoxId);
      this.render();
      return;
    }

    // 2. Check box interior click
    const boxHit = this.hitTestBox(sx, sy);
    if (boxHit) {
      this.dragMode = "DRAG_BOX";
      this.selectedBoxId = boxHit;
      this.dragStartMouse = { x: sx, y: sy };
      const box = this.boxes.find(b => b.id === boxHit);
      this.dragStartBoxCorners = box.corners.map(c => [...c]);
      this.onSelectionChange(this.selectedBoxId);
      this.render();
      return;
    }

    // 3. Clicked on canvas background: start Pan
    this.dragMode = "PAN";
    this.dragStartMouse = { x: sx, y: sy };
    this.selectedBoxId = null;
    this.onSelectionChange(null);
    this.render();
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (!this.dragMode) {
      // Update cursor depending on hover
      if (this.isAddBoxActive) {
        this.canvas.style.cursor = "crosshair";
      } else if (this.hitTestCorner(sx, sy)) {
        this.canvas.style.cursor = "pointer";
      } else if (this.hitTestBox(sx, sy)) {
        this.canvas.style.cursor = "move";
      } else {
        this.canvas.style.cursor = "grab";
      }
      return;
    }

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

  onMouseUp(e) {
    if (this.dragMode === "DRAW_BOX" && this.newBoxStart) {
      const rect = this.canvas.getBoundingClientRect();
      const curr = this.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
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
      if (box && this.onCropChange) {
        this.onCropChange(box);
      }
    }

    this.dragMode = null;
    this.activeCornerIndex = -1;
    this.dragStartBoxCorners = null;
    this.render();
  }

  selectBox(boxId) {
    this.selectedBoxId = boxId;
    this.render();
  }

  deleteSelectedBox() {
    if (!this.selectedBoxId) return;
    this.boxes = this.boxes.filter(b => b.id !== this.selectedBoxId);
    this.selectedBoxId = this.boxes.length > 0 ? this.boxes[0].id : null;
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
    for (let c = 0; c < 4; c++) {
      ctx.beginPath();
      ctx.arc(pts[c].x, pts[c].y, this.handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#f59e0b" : "#38bdf8";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
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
}
