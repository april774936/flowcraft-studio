// TouchInput.js: Touch support for the canvas (phones / iPad).
// The editor's interaction code is written against mouse events, so instead of duplicating it
// this layer turns touches into the same mouse events:
//   • one finger on a node / port / [+] / note / edge  → left-button drag (move, connect, …)
//   • one finger on empty canvas                       → right-button drag (= pan)
//   • tap                                              → mousedown/up + click (select, buttons)
//   • double tap                                       → dblclick (quick-add on canvas, edit)
//   • two fingers                                      → pinch zoom + pan
const TAP_SLOP = 10;        // px a finger may wander and still count as a tap
const DOUBLE_TAP_MS = 320;

// Canvas chrome that should keep native touch behavior (scrolling lists, focusing inputs)
const NATIVE_SELECTOR = 'input, textarea, select, [contenteditable="true"]:focus, .simulator-drawer, .timeline-settings-popover';
// Things a single finger should grab instead of panning the canvas
const GRAB_SELECTOR = '.workflow-node, .canvas-note, .minimap-container, g[data-edge-id], .node-port, .node-quick-add, .edge-path, .edge-hit, .edge-label-group, .edge-bend-handle, .canvas-floating-dock, .sidebar-collapse-toggle, .inspector-collapse-toggle, .tl-cell, .tl-point, .tl-handle, .timeline-ruler, button';

export class TouchInput {
  constructor(state, canvas) {
    this.state = state;
    this.canvas = canvas;
    this.container = canvas.container;
    this.single = null;   // { id, target, button, startX, startY, lastX, lastY, moved, t }
    this.pinch = null;    // { d0, zoom0, wx, wy }
    this.lastTap = null;  // { t, x, y, target }

    const opts = { passive: false };
    this.container.addEventListener('touchstart', (e) => this.onStart(e), opts);
    this.container.addEventListener('touchmove', (e) => this.onMove(e), opts);
    this.container.addEventListener('touchend', (e) => this.onEnd(e), opts);
    this.container.addEventListener('touchcancel', (e) => this.onEnd(e, true), opts);
  }

  fire(type, target, x, y, button = 0, detail = 1) {
    if (!target) return;
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, clientX: x, clientY: y,
      screenX: x, screenY: y, button, buttons: type === 'mouseup' ? 0 : (button === 2 ? 2 : 1), detail
    }));
  }

  hit(x, y) {
    return document.elementFromPoint(x, y) || this.container;
  }

  onStart(e) {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const target = e.target instanceof Element ? e.target : this.container;
      if (target.closest(NATIVE_SELECTOR)) { this.single = null; return; }
      e.preventDefault(); // no page scroll/zoom, no emulated mouse events (we send our own)
      const onCanvas = !target.closest(GRAB_SELECTOR);
      this.single = {
        id: t.identifier, target, button: onCanvas ? 2 : 0, onCanvas,
        startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastY: t.clientY,
        moved: false, t: Date.now()
      };
      this.fire('mousemove', target, t.clientX, t.clientY);
      this.fire('mousedown', target, t.clientX, t.clientY, this.single.button);
    } else if (e.touches.length === 2) {
      e.preventDefault();
      // A second finger turns whatever the first one started into a pinch
      if (this.single) {
        this.fire('mouseup', this.hit(this.single.lastX, this.single.lastY), this.single.lastX, this.single.lastY, this.single.button);
        this.single = null;
      }
      const [a, b] = [e.touches[0], e.touches[1]];
      const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      const w = this.canvas.screenToWorld(mid.x, mid.y);
      this.pinch = { d0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, zoom0: this.state.viewport.zoom, wx: w.x, wy: w.y };
    }
  }

  onMove(e) {
    if (this.pinch && e.touches.length >= 2) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const zoom = Math.min(Math.max(this.pinch.zoom0 * (d / this.pinch.d0), 0.25), 2.5);
      const rect = this.container.getBoundingClientRect();
      const mx = (a.clientX + b.clientX) / 2 - rect.left;
      const my = (a.clientY + b.clientY) / 2 - rect.top;
      // keep the world point that started under the fingers under them
      this.state.setViewport(mx - this.pinch.wx * zoom, my - this.pinch.wy * zoom, zoom);
      return;
    }
    const s = this.single;
    if (!s) return;
    const t = [...e.changedTouches].find(x => x.identifier === s.id);
    if (!t) return;
    e.preventDefault();
    s.lastX = t.clientX; s.lastY = t.clientY;
    if (!s.moved && Math.hypot(t.clientX - s.startX, t.clientY - s.startY) > TAP_SLOP) s.moved = true;
    if (s.moved) this.fire('mousemove', this.hit(t.clientX, t.clientY), t.clientX, t.clientY, s.button);
  }

  onEnd(e, cancelled = false) {
    if (this.pinch) {
      if (e.touches.length < 2) this.pinch = null;
      e.preventDefault();
      return;
    }
    const s = this.single;
    if (!s) return;
    const t = [...e.changedTouches].find(x => x.identifier === s.id);
    if (!t) return;
    e.preventDefault();
    this.single = null;
    const x = t.clientX, y = t.clientY;
    const dropTarget = this.hit(x, y);
    this.fire('mouseup', dropTarget, x, y, s.button);
    if (cancelled || s.moved) return;

    // Tap: empty canvas gets a left click (clears selection); everything else a real click
    if (s.onCanvas) {
      this.fire('mousedown', s.target, x, y, 0);
      this.fire('mouseup', s.target, x, y, 0);
    }
    this.fire('click', s.target, x, y, 0);

    const now = Date.now();
    const prev = this.lastTap;
    if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(x - prev.x, y - prev.y) < 24) {
      this.fire('dblclick', s.target, x, y, 0, 2);
      this.lastTap = null;
    } else {
      this.lastTap = { t: now, x, y };
    }
  }
}
