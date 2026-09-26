// Minimap.js: Interactive real-time minimap with viewport box
export class Minimap {
  constructor(state, container, canvasEl, viewportBoxEl, mainCanvasContainer) {
    this.state = state;
    this.container = container;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.viewportBox = viewportBoxEl;
    this.mainCanvasContainer = mainCanvasContainer;

    this.isDraggingViewport = false;
    this.setupMinimapInteraction();

    this.render();
    this.state.on('canvas:change', () => this.render());
    this.state.on('viewport:change', () => this.render());
  }

  render() {
    const width = this.container.clientWidth || 180;
    const height = this.container.clientHeight || 120;
    this.canvas.width = width;
    this.canvas.height = height;

    this.ctx.clearRect(0, 0, width, height);

    // Compute bounding box of all content
    let minX = -200, minY = -200, maxX = 2000, maxY = 1200;

    this.state.nodes.forEach(n => {
      minX = Math.min(minX, n.x - 100);
      minY = Math.min(minY, n.y - 100);
      maxX = Math.max(maxX, n.x + 350);
      maxY = Math.max(maxY, n.y + 200);
    });

    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;

    const scaleX = width / worldWidth;
    const scaleY = height / worldHeight;
    const scale = Math.min(scaleX, scaleY);

    this.minimapBounds = { minX, minY, maxX, maxY, scale };

    // Draw background
    const computedStyles = getComputedStyle(document.documentElement);
    this.ctx.fillStyle = computedStyles.getPropertyValue('--bg-canvas').trim() || '#090d16';
    this.ctx.fillRect(0, 0, width, height);

    // Draw edges
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 1;
    const nodeMap = new Map(this.state.nodes.map(n => [n.id, n]));

    this.state.edges.forEach(e => {
      const fromNode = nodeMap.get(e.from);
      const toNode = nodeMap.get(e.to);
      if (fromNode && toNode) {
        const x1 = (fromNode.x + 110 - minX) * scale;
        const y1 = (fromNode.y + 45 - minY) * scale;
        const x2 = (toNode.x + 110 - minX) * scale;
        const y2 = (toNode.y + 45 - minY) * scale;

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
      }
    });

    // Draw notes
    this.state.notes.forEach(note => {
      const x = (note.x - minX) * scale;
      const y = (note.y - minY) * scale;
      const w = (note.width || 200) * scale;
      const h = (note.height || 140) * scale;

      this.ctx.fillStyle = 'rgba(250, 204, 21, 0.4)';
      this.ctx.fillRect(x, y, w, h);
    });

    // Draw nodes
    this.state.nodes.forEach(node => {
      const x = (node.x - minX) * scale;
      const y = (node.y - minY) * scale;
      
      let w = 220 * scale;
      let h = 88 * scale;
      if (node.type === 'start' || node.type === 'end') {
        w = 175 * scale;
        h = 54 * scale;
      } else if (node.type === 'condition') {
        w = 160 * scale;
        h = 110 * scale;
      }

      this.ctx.fillStyle = node.color || '#3b82f6';
      this.ctx.beginPath();
      this.ctx.roundRect ? this.ctx.roundRect(x, y, w, h, 2) : this.ctx.rect(x, y, w, h);
      this.ctx.fill();
    });

    // Update viewport indicator box
    const mainRect = this.mainCanvasContainer.getBoundingClientRect();
    const { x: vpX, y: vpY, zoom } = this.state.viewport;

    const visibleWorldX = -vpX / zoom;
    const visibleWorldY = -vpY / zoom;
    const visibleWorldW = mainRect.width / zoom;
    const visibleWorldH = mainRect.height / zoom;

    const boxX = (visibleWorldX - minX) * scale;
    const boxY = (visibleWorldY - minY) * scale;
    const boxW = visibleWorldW * scale;
    const boxH = visibleWorldH * scale;

    this.viewportBox.style.left = `${Math.max(0, boxX)}px`;
    this.viewportBox.style.top = `${Math.max(0, boxY)}px`;
    this.viewportBox.style.width = `${Math.min(width, boxW)}px`;
    this.viewportBox.style.height = `${Math.min(height, boxH)}px`;
  }

  setupMinimapInteraction() {
    const handlePanToMinimapPos = (clientX, clientY) => {
      if (!this.minimapBounds) return;
      const rect = this.container.getBoundingClientRect();
      const miniX = clientX - rect.left;
      const miniY = clientY - rect.top;

      const { minX, minY, scale } = this.minimapBounds;
      const worldTargetX = minX + miniX / scale;
      const worldTargetY = minY + miniY / scale;

      const mainRect = this.mainCanvasContainer.getBoundingClientRect();
      const zoom = this.state.viewport.zoom;

      const newX = mainRect.width / 2 - worldTargetX * zoom;
      const newY = mainRect.height / 2 - worldTargetY * zoom;

      this.state.setViewport(newX, newY, zoom);
    };

    this.container.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.isDraggingViewport = true;
      handlePanToMinimapPos(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingViewport) {
        handlePanToMinimapPos(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingViewport = false;
    });
  }
}
