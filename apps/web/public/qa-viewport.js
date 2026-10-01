// Reduced from Field's canvas input/transform kernel for Inspector review surfaces.
export const QA_MIN_SCALE = 0.02;
export const QA_MAX_SCALE = 32;
export const QA_FIT_MIN_SCALE = 0.1;
export const QA_FIT_MAX_SCALE = 2;
export const QA_ZOOM_WHEEL_SENSITIVITY = 0.002;
export const QA_ZOOM_PINCH_SENSITIVITY = 0.011;
export const QA_PINCH_MAX_DELTA = 50;
export const QA_ZOOM_MAX_DELTA = 120;
export const QA_PAN_TRACKPAD_MAX_GAIN = 1.8;
export const QA_PAN_TRACKPAD_GAIN_CUTOFF = 80;
export const QA_PAN_LINE_STEP_PX = 16;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function isTrackpadPinch(event) {
  if (event.metaKey) return false;
  return event.deltaMode === 0 && Math.abs(event.deltaY) < QA_PINCH_MAX_DELTA;
}

export function wheelZoomFactor(event) {
  const sensitivity = isTrackpadPinch(event) ? QA_ZOOM_PINCH_SENSITIVITY : QA_ZOOM_WHEEL_SENSITIVITY;
  const delta = clamp(event.deltaY, -QA_ZOOM_MAX_DELTA, QA_ZOOM_MAX_DELTA);
  return Math.exp(-delta * sensitivity);
}

export function wheelPanDelta(event, viewportHeight = 900) {
  let x = event.deltaX;
  let y = event.deltaY;
  if (event.deltaMode === 1) {
    x *= QA_PAN_LINE_STEP_PX;
    y *= QA_PAN_LINE_STEP_PX;
  } else if (event.deltaMode === 2) {
    x *= viewportHeight;
    y *= viewportHeight;
  }
  const magnitude = Math.hypot(x, y);
  const gain = event.deltaMode === 0 && magnitude < QA_PAN_TRACKPAD_GAIN_CUTOFF
    ? 1 + (QA_PAN_TRACKPAD_MAX_GAIN - 1) * (1 - magnitude / QA_PAN_TRACKPAD_GAIN_CUTOFF)
    : 1;
  return { dx: -x * gain, dy: -y * gain };
}

export function fitTransform(viewportWidth, viewportHeight, surfaceWidth, surfaceHeight, padding = 56) {
  const usableWidth = Math.max(1, viewportWidth - padding * 2);
  const usableHeight = Math.max(1, viewportHeight - padding * 2);
  const scale = clamp(Math.min(usableWidth / surfaceWidth, usableHeight / surfaceHeight), QA_FIT_MIN_SCALE, QA_FIT_MAX_SCALE);
  return { x: (viewportWidth - surfaceWidth * scale) / 2, y: (viewportHeight - surfaceHeight * scale) / 2, scale };
}

function editableTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
}

export function createQaViewport(stage, { mode = "captured" } = {}) {
  const viewport = stage.querySelector(".qa-preview");
  const camera = viewport?.querySelector(".qa-camera");
  const surface = viewport?.querySelector(".qa-surface");
  const gestureLayer = viewport?.querySelector(".qa-gesture-layer");
  if (!viewport || !camera || !surface || !gestureLayer) return { destroy() {}, fit() {}, getTransform: () => ({ x: 0, y: 0, scale: 1 }) };

  let transform = { x: 0, y: 0, scale: 1 };
  let pan = null;
  let spaceDown = false;
  let initialized = false;
  let resizeFrame = 0;

  const apply = () => {
    camera.style.transform = "translate3d(" + transform.x + "px," + transform.y + "px,0) scale(" + transform.scale + ")";
  };
  const fit = () => {
    const rect = viewport.getBoundingClientRect();
    transform = fitTransform(rect.width, rect.height, surface.offsetWidth || 1, surface.offsetHeight || 1);
    initialized = true;
    apply();
  };
  const panBy = (dx, dy) => { transform.x += dx; transform.y += dy; apply(); };
  const zoomAt = (clientX, clientY, factor) => {
    const rect = viewport.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const nextScale = clamp(transform.scale * factor, QA_MIN_SCALE, QA_MAX_SCALE);
    const worldX = (px - transform.x) / transform.scale;
    const worldY = (py - transform.y) / transform.scale;
    transform.x = px - worldX * nextScale;
    transform.y = py - worldY * nextScale;
    transform.scale = nextScale;
    apply();
  };
  const pointInsideLiveSurface = (x, y) => {
    if (mode !== "live") return false;
    const rect = surface.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };
  const onWheel = event => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, wheelZoomFactor(event));
      return;
    }
    if (pointInsideLiveSurface(event.clientX, event.clientY)) return;
    event.preventDefault();
    const delta = wheelPanDelta(event, viewport.clientHeight);
    panBy(delta.dx, delta.dy);
  };
  const beginPan = (event, source) => {
    pan = { source, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    try { viewport.setPointerCapture(event.pointerId); } catch {}
    stage.classList.add("qa-camera-panning");
  };
  const onPointerDown = event => {
    if (event.button === 1) { event.preventDefault(); beginPan(event, "middle"); return; }
    if (spaceDown && event.button === 0) { event.preventDefault(); beginPan(event, "space"); }
  };
  const onPointerMove = event => {
    if (!pan || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    pan.x = event.clientX;
    pan.y = event.clientY;
    panBy(dx, dy);
  };
  const endPan = event => {
    if (!pan || (event.pointerId != null && pan.pointerId !== event.pointerId)) return;
    try { viewport.releasePointerCapture(pan.pointerId); } catch {}
    pan = null;
    stage.classList.remove("qa-camera-panning");
  };
  const onKeyDown = event => {
    if (event.code !== "Space" || editableTarget(event.target)) return;
    spaceDown = true;
    stage.classList.add("qa-space-pan");
  };
  const onKeyUp = event => {
    if (event.code !== "Space") return;
    spaceDown = false;
    stage.classList.remove("qa-space-pan");
    if (pan?.source === "space") endPan({ pointerId: pan.pointerId });
  };
  const onMessage = event => {
    const iframe = surface.querySelector("iframe");
    if (!iframe || event.source !== iframe.contentWindow) return;
    const data = event.data || {};
    if (data.type !== "relay:inspector-camera") return;
    if (data.action === "zoom") {
      const rect = iframe.getBoundingClientRect();
      zoomAt(rect.left + Number(data.x || rect.width / 2), rect.top + Number(data.y || rect.height / 2), Number(data.factor) || 1);
    } else if (data.action === "pan") {
      panBy(Number(data.dx) || 0, Number(data.dy) || 0);
    }
  };
  const onResize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (!initialized) fit(); else apply(); });
  };

  viewport.addEventListener("wheel", onWheel, { passive: false });
  viewport.addEventListener("pointerdown", onPointerDown, true);
  viewport.addEventListener("pointermove", onPointerMove, true);
  viewport.addEventListener("pointerup", endPan, true);
  viewport.addEventListener("pointercancel", endPan, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("message", onMessage);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
  resizeObserver?.observe(viewport);
  requestAnimationFrame(fit);

  return {
    fit,
    getTransform: () => ({ ...transform }),
    destroy() {
      cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointerDown, true);
      viewport.removeEventListener("pointermove", onPointerMove, true);
      viewport.removeEventListener("pointerup", endPan, true);
      viewport.removeEventListener("pointercancel", endPan, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("message", onMessage);
    }
  };
}
