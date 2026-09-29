// Connections.js: Professional Flowchart Orthogonal Routing, Bezier Curves, and Port Geometry
import { isBranchPort, branchIdOf, branchPortPoint, branchPort, newItemId } from './Branches.js';
import { isSecondClick } from '../utils/doubleClick.js';
import { computeMainPath } from './MainPath.js';

export class Connections {
  constructor(state, svgElement, edgesGroup, tempPathElement) {
    this.state = state;
    this.svg = svgElement;
    this.edgesGroup = edgesGroup;
    this.tempPath = tempPathElement;

    this.isConnecting = false;
    this.dragStart = null;
    this.canvas = null; // set by main.js (screen → world for line dragging)
    this.bendDrag = null;

    window.addEventListener('mousemove', (e) => this.onBendMove(e));
    window.addEventListener('mouseup', () => this.onBendEnd());
  }

  onBendMove(e) {
    const bd = this.bendDrag;
    if (!bd || !this.canvas) return;
    if (!bd.started) {
      if (Math.hypot(e.clientX - bd.x, e.clientY - bd.y) < 5) return;
      bd.started = true;
      this.state.beginGesture();
      if (this.state.selectedEdgeId !== bd.edgeId) this.state.selectEdge(bd.edgeId);
      document.body.classList.add('bending-edge');
    }
    const edge = this.state.edges.find(x => x.id === bd.edgeId);
    const from = edge && this.state.nodes.find(n => n.id === edge.from);
    const to = edge && this.state.nodes.find(n => n.id === edge.to);
    if (!from || !to) return;
    const p1 = this.getPortCoordinates(from, edge.fromPort || 'right');
    const p2 = this.getPortCoordinates(to, edge.toPort || 'left');
    const w = this.canvas.screenToWorld(e.clientX, e.clientY);
    edge.bend = { dx: Math.round(w.x - (p1.x + p2.x) / 2), dy: Math.round(w.y - (p1.y + p2.y) / 2) };
    this.renderEdges();
  }

  onBendEnd() {
    const bd = this.bendDrag;
    this.bendDrag = null;
    if (!bd || !bd.started) return;
    document.body.classList.remove('bending-edge');
    this.suppressEdgeClick = true;
    setTimeout(() => { this.suppressEdgeClick = false; }, 0);
    this.state.endGesture();
    this.state.emit('canvas:change');
  }

  // Get accurate port coordinates based on node shape
  getPortCoordinates(node, port) {
    let width = 240;
    let height = 72;

    if (node.type === 'start' || node.type === 'end') {
      width = 180;
      height = 48;
    } else if (node.type === 'condition') {
      width = 200;
      height = 120;
    }

    // Prefer the rendered size (nodes grow with their text)
    const el = document.querySelector(`[data-node-id="${node.id}"]`);
    if (el && el.offsetWidth) {
      width = el.offsetWidth;
      height = el.offsetHeight;
    }

    const nx = node.x;
    const ny = node.y;

    // N-way decision: one port per branch on the right half of the diamond
    if (isBranchPort(port) && Array.isArray(node.branches)) {
      const idx = node.branches.findIndex(b => b.id === branchIdOf(port));
      if (idx >= 0) {
        const p = branchPortPoint(idx, node.branches.length, width, height);
        return { x: nx + p.x, y: ny + p.y };
      }
    }

    // Side ports on slanted outlines (inverted triangle / trapezoid) sit on the outline
    const inset = node.shape === 'filing' ? 0.25 : node.shape === 'invtrap' ? 0.1 : 0;
    if (inset && (port === 'left' || port === 'right')) {
      return { x: port === 'left' ? nx + width * inset : nx + width * (1 - inset), y: ny + height / 2 };
    }

    switch (port) {
      case 'top':
        return { x: nx + width / 2, y: ny };
      case 'bottom':
        return { x: nx + width / 2, y: ny + height };
      case 'left':
        return { x: nx, y: ny + height / 2 };
      case 'right':
      default:
        return { x: nx + width, y: ny + height / 2 };
    }
  }

  // Smart Orthogonal Step Path with 8px rounded corners (Industry standard for flowcharts)
  // midRatio: where the vertical segment of a right→left edge sits between the two nodes
  createOrthogonalPathD(p1, p2, fromPort = 'right', toPort = 'left', midRatio = 0.5) {
    const r = 8; // Corner radius

    // 1. Right to Left (Standard horizontal flow)
    if ((fromPort === 'right' && toPort === 'left') || (fromPort === 'left' && toPort === 'right')) {
      const isForward = p2.x > p1.x + 4; // close neighbours still connect directly

      if (isForward) {
        const midX = p1.x + (p2.x - p1.x) * midRatio;
        const dy = p2.y - p1.y;

        if (Math.abs(dy) < 6) {
          // Straight horizontal line
          return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
        }

        const dirY = Math.sign(dy);
        const cr = Math.min(r, Math.abs(dy) / 2, Math.abs(midX - p1.x) / 2);

        return `M ${p1.x} ${p1.y} ` +
               `L ${midX - cr} ${p1.y} ` +
               `Q ${midX} ${p1.y}, ${midX} ${p1.y + dirY * cr} ` +
               `L ${midX} ${p2.y - dirY * cr} ` +
               `Q ${midX} ${p2.y}, ${midX + cr} ${p2.y} ` +
               `L ${p2.x} ${p2.y}`;
      } else {
        // Loop back route (target is behind source)
        const extendX = p1.x + 30;
        const targetExtendX = p2.x - 30;
        const midY = (p1.y + p2.y) / 2 + (p1.y === p2.y ? 80 : 0);
        return `M ${p1.x} ${p1.y} ` +
               `L ${extendX} ${p1.y} ` +
               `L ${extendX} ${midY} ` +
               `L ${targetExtendX} ${midY} ` +
               `L ${targetExtendX} ${p2.y} ` +
               `L ${p2.x} ${p2.y}`;
      }
    }

    // 2. Bottom to Top or Bottom to Left (Branch down)
    if (fromPort === 'bottom') {
      const dy = p2.y - p1.y;
      const dx = p2.x - p1.x;

      if (toPort === 'left') {
        const turnY = p2.y;
        const cr = Math.min(r, Math.abs(dy) / 2, Math.abs(dx) / 2);
        const dirX = Math.sign(dx);
        return `M ${p1.x} ${p1.y} ` +
               `L ${p1.x} ${turnY - cr} ` +
               `Q ${p1.x} ${turnY}, ${p1.x + dirX * cr} ${turnY} ` +
               `L ${p2.x} ${p2.y}`;
      } else if (toPort === 'top') {
        const midY = (p1.y + p2.y) / 2;
        const dirX = Math.sign(dx);
        const cr = Math.min(r, Math.abs(dx) / 2, Math.abs(midY - p1.y) / 2);
        if (Math.abs(dx) < 6) {
          return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
        }
        return `M ${p1.x} ${p1.y} ` +
               `L ${p1.x} ${midY - cr} ` +
               `Q ${p1.x} ${midY}, ${p1.x + dirX * cr} ${midY} ` +
               `L ${p2.x - dirX * cr} ${midY} ` +
               `Q ${p2.x} ${midY}, ${p2.x} ${midY + cr} ` +
               `L ${p2.x} ${p2.y}`;
      }
    }

    // 3. One-corner routes: sideways out, then down/up into a top/bottom port (and the reverse)
    const horiz = (p) => p === 'right' || p === 'left';
    const vert = (p) => p === 'top' || p === 'bottom';
    if (horiz(fromPort) && vert(toPort)) {
      const outOk = fromPort === 'right' ? p2.x > p1.x + 10 : p2.x < p1.x - 10;
      const inOk = toPort === 'top' ? p2.y > p1.y + 10 : p2.y < p1.y - 10;
      if (outOk && inOk) {
        const dx = Math.sign(p2.x - p1.x), dy = Math.sign(p2.y - p1.y);
        const cr = Math.min(r, Math.abs(p2.x - p1.x) / 2, Math.abs(p2.y - p1.y) / 2);
        return `M ${p1.x} ${p1.y} L ${p2.x - dx * cr} ${p1.y} Q ${p2.x} ${p1.y}, ${p2.x} ${p1.y + dy * cr} L ${p2.x} ${p2.y}`;
      }
    }
    if (vert(fromPort) && horiz(toPort)) {
      const outOk = fromPort === 'bottom' ? p2.y > p1.y + 10 : p2.y < p1.y - 10;
      const inOk = toPort === 'left' ? p2.x > p1.x + 10 : p2.x < p1.x - 10;
      if (outOk && inOk) {
        const dx = Math.sign(p2.x - p1.x), dy = Math.sign(p2.y - p1.y);
        const cr = Math.min(r, Math.abs(p2.x - p1.x) / 2, Math.abs(p2.y - p1.y) / 2);
        return `M ${p1.x} ${p1.y} L ${p1.x} ${p2.y - dy * cr} Q ${p1.x} ${p2.y}, ${p1.x + dx * cr} ${p2.y} L ${p2.x} ${p2.y}`;
      }
    }
    // top -> bottom (upward link)
    if (fromPort === 'top' && toPort === 'bottom' && p2.y < p1.y - 10) {
      const midY = (p1.y + p2.y) / 2;
      if (Math.abs(p2.x - p1.x) < 6) return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
      return `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
    }

    // 4. Same-side loops (e.g. "다시" back to an earlier step): run around below / above
    if ((fromPort === 'bottom' && toPort === 'bottom') || (fromPort === 'top' && toPort === 'top')) {
      const down = fromPort === 'bottom';
      const y = down ? Math.max(p1.y, p2.y) + 44 : Math.min(p1.y, p2.y) - 44;
      return `M ${p1.x} ${p1.y} L ${p1.x} ${y} L ${p2.x} ${y} L ${p2.x} ${p2.y}`;
    }

    // Fallback: Clean step line
    const midX = (p1.x + p2.x) / 2;
    return `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
  }

  // Smooth Bezier line
  createBezierPathD(p1, p2, fromPort = 'right', toPort = 'left') {
    const dx = Math.abs(p2.x - p1.x);
    const curvature = Math.max(dx * 0.45, 35);

    let cx1 = p1.x;
    let cy1 = p1.y;
    let cx2 = p2.x;
    let cy2 = p2.y;

    if (fromPort === 'right') cx1 += curvature;
    else if (fromPort === 'left') cx1 -= curvature;
    else if (fromPort === 'bottom') cy1 += curvature;
    else if (fromPort === 'top') cy1 -= curvature;

    if (toPort === 'left') cx2 -= curvature;
    else if (toPort === 'right') cx2 += curvature;
    else if (toPort === 'top') cy2 -= curvature;
    else if (toPort === 'bottom') cy2 += curvature;

    return `M ${p1.x} ${p1.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.x} ${p2.y}`;
  }

  createPathD(p1, p2, lineType = 'orthogonal', fromPort = 'right', toPort = 'left', midRatio = 0.5, bend = null) {
    if (isBranchPort(fromPort)) fromPort = 'right'; // branch ports leave to the right
    if (bend) return this.createBentPathD(p1, p2, lineType, fromPort, toPort, bend);
    if (lineType === 'straight') {
      return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    }
    if (lineType === 'bezier') {
      return this.createBezierPathD(p1, p2, fromPort, toPort);
    }
    // Default: Professional Orthogonal
    return this.createOrthogonalPathD(p1, p2, fromPort, toPort, midRatio);
  }

  // Absolute bend point of an edge (stored relative to the middle of its two ends)
  bendPoint(edge, p1, p2) {
    if (!edge.bend) return null;
    return { x: (p1.x + p2.x) / 2 + edge.bend.dx, y: (p1.y + p2.y) / 2 + edge.bend.dy };
  }

  // Path through a user-dragged bend point b
  createBentPathD(p1, p2, lineType, fromPort, toPort, b) {
    if (lineType === 'straight') return `M ${p1.x} ${p1.y} L ${b.x} ${b.y} L ${p2.x} ${p2.y}`;
    if (lineType === 'bezier') {
      // quadratic curve that passes through b at its middle
      const qx = 2 * b.x - (p1.x + p2.x) / 2, qy = 2 * b.y - (p1.y + p2.y) / 2;
      return `M ${p1.x} ${p1.y} Q ${qx} ${qy}, ${p2.x} ${p2.y}`;
    }
    const H = (p) => p === 'right' || p === 'left';
    const out = 24;
    let pts;
    if (H(fromPort) && H(toPort)) {
      const lo = Math.min(p1.y, p2.y) - 30, hi = Math.max(p1.y, p2.y) + 30;
      if (b.y < lo || b.y > hi) { // pulled above/below both ends: go around at that height
        const ox = p1.x + (fromPort === 'right' ? out : -out);
        const ix = p2.x + (toPort === 'left' ? -out : out);
        pts = [p1, { x: ox, y: p1.y }, { x: ox, y: b.y }, { x: ix, y: b.y }, { x: ix, y: p2.y }, p2];
      } else {
        pts = [p1, { x: b.x, y: p1.y }, { x: b.x, y: p2.y }, p2];
      }
    } else if (!H(fromPort) && !H(toPort)) {
      const lo = Math.min(p1.x, p2.x) - 30, hi = Math.max(p1.x, p2.x) + 30;
      if (b.x < lo || b.x > hi) { // pulled to the side of both ends
        const oy = p1.y + (fromPort === 'bottom' ? out : -out);
        const iy = p2.y + (toPort === 'top' ? -out : out);
        pts = [p1, { x: p1.x, y: oy }, { x: b.x, y: oy }, { x: b.x, y: iy }, { x: p2.x, y: iy }, p2];
      } else {
        pts = [p1, { x: p1.x, y: b.y }, { x: p2.x, y: b.y }, p2];
      }
    } else if (H(fromPort)) {
      pts = [p1, { x: b.x, y: p1.y }, { x: b.x, y: b.y }, { x: p2.x, y: b.y }, p2];
    } else {
      pts = [p1, { x: p1.x, y: b.y }, { x: b.x, y: b.y }, { x: b.x, y: p2.y }, p2];
    }
    return this.roundedPolyline(pts, 8);
  }

  // Orthogonal polyline with rounded corners (collinear / repeated points dropped)
  roundedPolyline(points, r) {
    const pts = [];
    points.forEach(p => {
      const last = pts[pts.length - 1];
      if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) return;
      pts.push(p);
    });
    const clean = pts.filter((p, i) => {
      if (i === 0 || i === pts.length - 1) return true;
      const a = pts[i - 1], c = pts[i + 1];
      return !((Math.abs(a.x - p.x) < 0.5 && Math.abs(p.x - c.x) < 0.5) || (Math.abs(a.y - p.y) < 0.5 && Math.abs(p.y - c.y) < 0.5));
    });
    let d = `M ${clean[0].x} ${clean[0].y}`;
    for (let i = 1; i < clean.length - 1; i++) {
      const a = clean[i - 1], p = clean[i], c = clean[i + 1];
      const lin = Math.hypot(p.x - a.x, p.y - a.y), lout = Math.hypot(c.x - p.x, c.y - p.y);
      const cr = Math.min(r, lin / 2, lout / 2);
      const ux = (p.x - a.x) / (lin || 1), uy = (p.y - a.y) / (lin || 1);
      const vx = (c.x - p.x) / (lout || 1), vy = (c.y - p.y) / (lout || 1);
      d += ` L ${p.x - ux * cr} ${p.y - uy * cr} Q ${p.x} ${p.y}, ${p.x + vx * cr} ${p.y + vy * cr}`;
    }
    const end = clean[clean.length - 1];
    return d + ` L ${end.x} ${end.y}`;
  }

  // Branch edges of one decision node turn at staggered x positions so their vertical
  // segments don't overlap: outer branches turn early, middle ones late.
  branchMidRatio(node, port) {
    if (!isBranchPort(port) || !Array.isArray(node.branches) || node.branches.length < 2) return 0.5;
    const n = node.branches.length;
    const idx = node.branches.findIndex(b => b.id === branchIdOf(port));
    if (idx < 0) return 0.5;
    const center = (n - 1) / 2;
    const outer = Math.abs(idx - center) / center; // 1 = outermost, 0 = middle
    return 0.72 - 0.44 * outer;
  }

  // Node bounding box in world coordinates (rendered size when available)
  getNodeRect(node) {
    const top = this.getPortCoordinates(node, 'top');
    const bottom = this.getPortCoordinates(node, 'bottom');
    const w = (top.x - node.x) * 2; // top port is at the horizontal centre of the box
    return { x: node.x, y: node.y, w, h: bottom.y - node.y };
  }

  // Put the label on the path where it covers no node and no other label:
  // try the middle first, then walk outwards along the edge.
  placeLabel(pathEl, w, h, obstacles) {
    let len = 0;
    try { len = pathEl.getTotalLength(); } catch (e) { /* not rendered */ }
    if (!len) return null;
    const pad = 4;
    const hits = (cx, cy) => obstacles.some(o =>
      cx - w / 2 - pad < o.x + o.w && cx + w / 2 + pad > o.x &&
      cy - h / 2 - pad < o.y + o.h && cy + h / 2 + pad > o.y);
    const ts = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88];
    for (const t of ts) {
      const p = pathEl.getPointAtLength(len * t);
      if (!hits(p.x, p.y)) return { x: p.x, y: p.y };
    }
    const mid = pathEl.getPointAtLength(len / 2);
    return { x: mid.x, y: mid.y };
  }

  renderEdges() {
    this.edgesGroup.innerHTML = '';
    const nodeMap = new Map(this.state.nodes.map(n => [n.id, n]));
    // Obstacles for label placement: every node, plus labels as they get placed
    const obstacles = this.state.nodes.map(n => this.getNodeRect(n));
    const main = computeMainPath(this.state.nodes, this.state.edges);

    this.state.edges.forEach(edge => {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) return;

      const p1 = this.getPortCoordinates(fromNode, edge.fromPort || 'right');
      const p2 = this.getPortCoordinates(toNode, edge.toPort || 'left');
      
      const lineType = edge.lineType || 'orthogonal';
      const bend = this.bendPoint(edge, p1, p2);
      const d = this.createPathD(p1, p2, lineType, edge.fromPort, edge.toPort, this.branchMidRatio(fromNode, edge.fromPort), bend);

      const isSelected = this.state.selectedEdgeId === edge.id;

      // Determine branch styling
      let branchClass = '';
      let markerId = 'arrowhead';

      if (edge.label && (edge.label.toLowerCase().includes('yes') || edge.label.includes('성공') || edge.label.includes('승인') || edge.label.includes('통과'))) {
        branchClass = 'branch-yes';
        markerId = 'arrowhead-yes';
      } else if (edge.label && (edge.label.toLowerCase().includes('no') || edge.label.includes('실패') || edge.label.includes('반려') || edge.label.includes('취소') || edge.label.includes('오류'))) {
        branchClass = 'branch-no';
        markerId = 'arrowhead-no';
      }

      const isMain = main.edges.has(edge.id);
      if (isMain) markerId = 'arrowhead-main';
      if (isSelected) markerId = 'arrowhead-selected';

      // Group
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.dataset.edgeId = edge.id;

      // Invisible thick stroke for easy mouse click
      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitPath.setAttribute('d', d);
      hitPath.setAttribute('fill', 'none');
      hitPath.setAttribute('stroke', 'transparent');
      hitPath.setAttribute('class', 'edge-hit'); // grab area well beyond the visible line (canvas.css)
      hitPath.style.cursor = 'pointer';

      // Visible styled path
      const visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      visiblePath.setAttribute('d', d);
      visiblePath.setAttribute('class', `edge-path ${branchClass} ${isMain ? 'main-path' : ''} ${isSelected ? 'selected' : ''}`);
      visiblePath.setAttribute('marker-end', `url(#${markerId})`);

      g.appendChild(hitPath);
      g.appendChild(visiblePath);
      // Attach now so the path can be measured for label placement
      this.edgesGroup.appendChild(g);

      // Edge Label
      if (edge.label) {
        const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelGroup.setAttribute('class', `edge-label-group ${isMain ? 'main-path' : ''}`);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'edge-label-text');
        text.textContent = edge.label;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'edge-label-bg');
        labelGroup.appendChild(rect);
        labelGroup.appendChild(text);
        g.appendChild(labelGroup);

        let textWidth = 0;
        try { textWidth = text.getComputedTextLength(); } catch (e) { /* not rendered */ }
        const labelWidth = Math.max(36, (textWidth || edge.label.length * 8) + 16);
        const labelHeight = 22;
        const pos = this.placeLabel(visiblePath, labelWidth, labelHeight, obstacles)
          || { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        rect.setAttribute('x', pos.x - labelWidth / 2);
        rect.setAttribute('y', pos.y - labelHeight / 2);
        rect.setAttribute('width', labelWidth);
        rect.setAttribute('height', labelHeight);
        text.setAttribute('x', pos.x);
        text.setAttribute('y', pos.y);
        obstacles.push({ x: pos.x - labelWidth / 2, y: pos.y - labelHeight / 2, w: labelWidth, h: labelHeight });
      }

      // Selected edge: a handle to show it can be pulled into a new shape
      if (isSelected) {
        let hp = bend;
        if (!hp) { try { const len = visiblePath.getTotalLength(); hp = visiblePath.getPointAtLength(len / 2); } catch (err) { hp = null; } }
        if (hp) {
          const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          handle.setAttribute('class', 'edge-bend-handle');
          handle.setAttribute('cx', hp.x);
          handle.setAttribute('cy', hp.y);
          handle.setAttribute('r', 6);
          g.appendChild(handle);
        }
      }

      // Pressing on a line and dragging pulls it into a new shape
      g.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        this.bendDrag = { edgeId: edge.id, x: e.clientX, y: e.clientY, started: false };
      });

      // Edge Selection
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.suppressEdgeClick) { this.suppressEdgeClick = false; return; }
        if (isSecondClick('edge:' + edge.id)) {
          this.state.emit('quick:edge-label', edge.id);
          return;
        }
        this.state.selectEdge(edge.id);
      });
    });
  }

  // Interactive connection dragging
  startConnecting(nodeId, port, worldX, worldY) {
    this.isConnecting = true;
    this.dragStart = { nodeId, port, x: worldX, y: worldY };
    this.tempPath.style.display = 'block';
    this.tempPath.setAttribute('d', `M ${worldX} ${worldY} L ${worldX} ${worldY}`);
  }

  // snapNode: node the wire would connect to if dropped now (the preview snaps to its port)
  updateConnecting(worldX, worldY, snapNode = null) {
    if (!this.isConnecting || !this.dragStart) return;
    const fromPort = this.dragStart.port === 'newbranch' ? 'right' : this.dragStart.port;
    let end = { x: worldX, y: worldY };
    let toPort = fromPort === 'bottom' ? 'top' : 'left';
    if (snapNode && snapNode.id !== this.dragStart.nodeId) {
      toPort = this.pickTargetPort(this.dragStart, snapNode);
      end = this.getPortCoordinates(snapNode, toPort);
    }
    const d = this.createPathD({ x: this.dragStart.x, y: this.dragStart.y }, end, 'orthogonal', fromPort, toPort);
    this.tempPath.setAttribute('d', d);
    this.tempPath.setAttribute('marker-end', 'url(#arrowhead-selected)');
    document.querySelectorAll('.workflow-node.drop-target').forEach(el => { if (!snapNode || el.dataset.nodeId !== snapNode.id) el.classList.remove('drop-target'); });
    if (snapNode && snapNode.id !== this.dragStart.nodeId) document.querySelector(`[data-node-id="${snapNode.id}"]`)?.classList.add('drop-target');
  }

  // Which side of the target a new connection enters, from where the two nodes sit
  pickTargetPort(start, toNode) {
    const fromNode = start && this.state.nodes.find(n => n.id === start.nodeId);
    if (!fromNode) return 'left';
    const port = start.port === 'newbranch' || isBranchPort(start.port) ? 'right' : start.port;
    const p1 = this.getPortCoordinates(fromNode, port);
    const r = this.getNodeRect(toNode);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (port === 'bottom') {
      if (r.y > p1.y + 20) return 'top';                               // below: straight in from above
      if (cy > p1.y + 10) return r.x > p1.x ? 'left' : 'right';        // beside: turn into its side
      return 'bottom';                                                 // above: loop around underneath
    }
    if (port === 'top') {
      if (r.y + r.h < p1.y - 20) return 'bottom';
      if (cy < p1.y - 10) return r.x > p1.x ? 'left' : 'right';
      return 'top';
    }
    if (port === 'left') {
      if (r.x + r.w < p1.x - 20) return 'right';
      if (cx < p1.x - 10) return r.y > p1.y ? 'top' : 'bottom';
      return 'right';
    }
    // right
    if (r.x > p1.x + 20) return 'left';                                // ahead: into its left side
    if (cx > p1.x + 10) return r.y > p1.y ? 'top' : 'bottom';          // overlapping column: from above/below
    return 'left';                                                     // behind: loop back
  }

  endConnecting(targetNodeId = null, targetPort = 'left') {
    if (!this.isConnecting) return;
    // Dragged from the "new branch" +: add the branch, then connect it
    if (targetNodeId && targetNodeId !== this.dragStart.nodeId && this.dragStart.port === 'newbranch') {
      const fromNode = this.state.nodes.find(n => n.id === this.dragStart.nodeId);
      if (fromNode && Array.isArray(fromNode.branches)) {
        const id = newItemId('br');
        const label = `선택 ${fromNode.branches.length + 1}`;
        this.state.beginGesture();
        this.state.updateBranches(fromNode.id, [...fromNode.branches, { id, label }]);
        this.state.addEdge(fromNode.id, branchPort(id), targetNodeId, targetPort, label, 'orthogonal');
        this.state.endGesture();
        this.state.emit('canvas:change');
      }
      this.isConnecting = false;
      this.dragStart = null;
      this.tempPath.style.display = 'none';
      return;
    }
    if (targetNodeId && targetNodeId !== this.dragStart.nodeId) {
      const fromNode = this.state.nodes.find(n => n.id === this.dragStart.nodeId);
      let label = '';
      if (fromNode && isBranchPort(this.dragStart.port)) {
        const b = (fromNode.branches || []).find(x => x.id === branchIdOf(this.dragStart.port));
        label = b ? b.label : '';
      } else if (fromNode && fromNode.type === 'condition') {
        label = this.dragStart.port === 'right' ? 'Yes' : (this.dragStart.port === 'bottom' ? 'No' : '');
      }
      this.state.addEdge(this.dragStart.nodeId, this.dragStart.port, targetNodeId, targetPort, label, 'orthogonal');
    }
    this.isConnecting = false;
    this.dragStart = null;
    this.tempPath.style.display = 'none';
    document.querySelectorAll('.workflow-node.drop-target').forEach(el => el.classList.remove('drop-target'));
  }
}
