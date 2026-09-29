// Canvas.js: Infinite panning, zooming, coordinate conversion, marquee, and alignment guides
export class Canvas {
  constructor(state, container, world, grid, guideX, guideY, marquee) {
    this.state = state;
    this.container = container;
    this.world = world;
    this.grid = grid;
    this.guideX = guideX;
    this.guideY = guideY;
    this.marquee = marquee;

    // Last pointer position over the canvas (paste target)
    this.lastPointerWorld = null;
    this.pointerInside = false;
    container.addEventListener('mousemove', (e) => {
      this.pointerInside = true;
      this.lastPointerWorld = this.screenToWorld(e.clientX, e.clientY);
    });
    container.addEventListener('mouseleave', () => { this.pointerInside = false; });

    // Pan state
    this.isPanning = false;
    this.isPanMode = false;
    this.spaceHeld = false;
    this.panStart = { x: 0, y: 0 };
    this.initialViewport = { x: 0, y: 0 };

    // Marquee state
    this.isMarquee = false;
    this.marqueeStart = { x: 0, y: 0 };

    this.initEventListeners();
    this.updateTransform();

    // Subscribe to state viewport changes
    this.state.on('viewport:change', () => this.updateTransform());
  }

  screenToWorld(screenX, screenY) {
    const rect = this.container.getBoundingClientRect();
    const relX = screenX - rect.left;
    const relY = screenY - rect.top;
    const { x, y, zoom } = this.state.viewport;
    return {
      x: (relX - x) / zoom,
      y: (relY - y) / zoom
    };
  }

  worldToScreen(worldX, worldY) {
    const rect = this.container.getBoundingClientRect();
    const { x, y, zoom } = this.state.viewport;
    return {
      x: rect.left + x + worldX * zoom,
      y: rect.top + y + worldY * zoom
    };
  }

  updateTransform() {
    const { x, y, zoom } = this.state.viewport;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    this.world.style.setProperty('--zoom', zoom); // lets edge grab areas stay a fixed screen size

    // Sync grid background
    const gridSize = 24 * zoom;
    this.grid.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    this.grid.style.backgroundPosition = `${x}px ${y}px`;
  }

  showGuide(type, coord) {
    if (type === 'x' && this.guideX) {
      this.guideX.style.display = 'block';
      this.guideX.style.top = `${coord}px`;
    } else if (type === 'y' && this.guideY) {
      this.guideY.style.display = 'block';
      this.guideY.style.left = `${coord}px`;
    }
  }

  hideGuides() {
    if (this.guideX) this.guideX.style.display = 'none';
    if (this.guideY) this.guideY.style.display = 'none';
  }

  initEventListeners() {
    // Mouse wheel zoom
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Pinch zoom or Ctrl/Cmd + wheel vs standard wheel
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      this.state.zoomBy(delta, cursorX, cursorY);
    }, { passive: false });

    // Right-drag pans the canvas, so the browser menu is suppressed on the canvas
    // (kept inside text fields so copy/paste still works there)
    this.container.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
    });

    // Canvas Mouse Down: Pan or Marquee
    this.container.addEventListener('mousedown', (e) => {
      // Right or middle button drag pans from anywhere on the canvas, even over nodes
      const isPanButton = e.button === 1 || e.button === 2;
      if (isPanButton &&
          !e.target.closest('.minimap-container, .simulator-drawer, .canvas-floating-dock, .sidebar-collapse-toggle, .inspector-collapse-toggle, input, textarea, [contenteditable="true"]')) {
        e.preventDefault(); // no middle-click autoscroll
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.initialViewport = { ...this.state.viewport };
        this.container.classList.add('panning');
        return;
      }

      // Ignore if clicking on nodes, notes, ports, dock, or controls
      if (
        e.target.closest('.workflow-node') ||
        e.target.closest('.canvas-note') ||
        e.target.closest('.node-port') ||
        e.target.closest('.minimap-container') ||
        e.target.closest('.simulator-drawer') ||
        e.target.closest('.canvas-floating-dock') ||
        e.target.closest('.sidebar-collapse-toggle') ||
        e.target.closest('.inspector-collapse-toggle') ||
        e.target.closest('.edge-path') ||
        e.target.closest('.edge-label-group')
      ) {
        return;
      }

      // Pan Trigger: isPanMode, Space key held, or Shift click (right/middle handled above)
      const isPanTrigger = this.isPanMode || e.shiftKey || this.spaceHeld;

      if (isPanTrigger || e.button === 0) {
        if (isPanTrigger) {
          this.isPanning = true;
          this.panStart = { x: e.clientX, y: e.clientY };
          this.initialViewport = { ...this.state.viewport };
          this.container.classList.add('panning');
        } else {
          // Left click on background: Marquee select or clear selection
          if (!e.metaKey && !e.ctrlKey) {
            this.state.clearSelection();
          }

          this.isMarquee = true;
          const rect = this.container.getBoundingClientRect();
          this.marqueeStart = {
            screenX: e.clientX - rect.left,
            screenY: e.clientY - rect.top,
            world: this.screenToWorld(e.clientX, e.clientY)
          };
          this.marquee.style.display = 'block';
          this.marquee.style.left = `${this.marqueeStart.world.x}px`;
          this.marquee.style.top = `${this.marqueeStart.world.y}px`;
          this.marquee.style.width = '0px';
          this.marquee.style.height = '0px';
        }
      }
    });

    // Window Mouse Move
    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        const dx = e.clientX - this.panStart.x;
        const dy = e.clientY - this.panStart.y;
        this.state.setViewport(
          this.initialViewport.x + dx,
          this.initialViewport.y + dy,
          this.initialViewport.zoom
        );
      } else if (this.isMarquee) {
        const currentWorld = this.screenToWorld(e.clientX, e.clientY);
        const minX = Math.min(this.marqueeStart.world.x, currentWorld.x);
        const minY = Math.min(this.marqueeStart.world.y, currentWorld.y);
        const width = Math.abs(currentWorld.x - this.marqueeStart.world.x);
        const height = Math.abs(currentWorld.y - this.marqueeStart.world.y);

        this.marquee.style.left = `${minX}px`;
        this.marquee.style.top = `${minY}px`;
        this.marquee.style.width = `${width}px`;
        this.marquee.style.height = `${height}px`;

        // Check enclosed nodes (shape-aware dimensions)
        const enclosedIds = new Set();
        this.state.nodes.forEach(n => {
          const dims = this.getNodeDimensions(n);
          if (n.x >= minX && n.x + dims.w <= minX + width && n.y >= minY && n.y + dims.h <= minY + height) {
            enclosedIds.add(n.id);
          }
        });

        this.state.selectedNodeIds = enclosedIds;
        this.state.emit('canvas:change');
      }
    });

    // Window Mouse Up
    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.classList.remove('panning');
      }
      if (this.isMarquee) {
        this.isMarquee = false;
        this.marquee.style.display = 'none';
        // mousemove already selected the fully enclosed nodes; re-select through the
        // state API so the inspector and listeners get a selection:change event
        const ids = Array.from(this.state.selectedNodeIds);
        if (ids.length) {
          this.state.selectedNodeIds.clear();
          ids.forEach((id, i) => this.state.selectNode(id, i > 0));
        }
      }
    });

    // Space key tracking for pan gesture
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.target.closest('input, textarea, [contenteditable]')) {
        e.preventDefault();
        this.spaceHeld = true;
        this.container.classList.add('panning');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceHeld = false;
        if (!this.isPanning) {
          this.container.classList.remove('panning');
        }
      }
    });
  }

  // Get shape-aware node dimensions (rendered size when available)
  getNodeDimensions(node) {
    const measured = this.state.measureNode && this.state.measureNode(node);
    if (measured) return { w: measured.width, h: measured.height };
    if (node.type === 'start' || node.type === 'end') {
      return { w: 175, h: 54 };
    } else if (node.type === 'condition') {
      return { w: 160, h: 110 };
    }
    return { w: 220, h: 88 };
  }
}
