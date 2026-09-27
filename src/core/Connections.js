// Connections.js: Professional Flowchart Orthogonal Routing, Bezier Curves, and Port Geometry
export class Connections {
  constructor(state, svgElement, edgesGroup, tempPathElement) {
    this.state = state;
    this.svg = svgElement;
    this.edgesGroup = edgesGroup;
    this.tempPath = tempPathElement;

    this.isConnecting = false;
    this.dragStart = null;
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
  createOrthogonalPathD(p1, p2, fromPort = 'right', toPort = 'left') {
    const r = 8; // Corner radius

    // 1. Right to Left (Standard horizontal flow)
    if ((fromPort === 'right' && toPort === 'left') || (fromPort === 'left' && toPort === 'right')) {
      const isForward = p2.x > p1.x + 20;

      if (isForward) {
        const midX = (p1.x + p2.x) / 2;
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

  createPathD(p1, p2, lineType = 'orthogonal', fromPort = 'right', toPort = 'left') {
    if (lineType === 'straight') {
      return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    }
    if (lineType === 'bezier') {
      return this.createBezierPathD(p1, p2, fromPort, toPort);
    }
    // Default: Professional Orthogonal
    return this.createOrthogonalPathD(p1, p2, fromPort, toPort);
  }

  renderEdges() {
    this.edgesGroup.innerHTML = '';
    const nodeMap = new Map(this.state.nodes.map(n => [n.id, n]));

    this.state.edges.forEach(edge => {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) return;

      const p1 = this.getPortCoordinates(fromNode, edge.fromPort || 'right');
      const p2 = this.getPortCoordinates(toNode, edge.toPort || 'left');
      
      const lineType = edge.lineType || 'orthogonal';
      const d = this.createPathD(p1, p2, lineType, edge.fromPort, edge.toPort);

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

      if (isSelected) markerId = 'arrowhead-selected';

      // Group
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.dataset.edgeId = edge.id;

      // Invisible thick stroke for easy mouse click
      const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitPath.setAttribute('d', d);
      hitPath.setAttribute('fill', 'none');
      hitPath.setAttribute('stroke', 'transparent');
      hitPath.setAttribute('stroke-width', '20');
      hitPath.style.cursor = 'pointer';

      // Visible styled path
      const visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      visiblePath.setAttribute('d', d);
      visiblePath.setAttribute('class', `edge-path ${branchClass} ${isSelected ? 'selected' : ''}`);
      visiblePath.setAttribute('marker-end', `url(#${markerId})`);

      g.appendChild(hitPath);
      g.appendChild(visiblePath);

      // Edge Label
      if (edge.label) {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelGroup.setAttribute('class', 'edge-label-group');

        const labelWidth = Math.max(64, edge.label.length * 11 + 24);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', midX - labelWidth / 2);
        rect.setAttribute('y', midY - 14);
        rect.setAttribute('width', labelWidth);
        rect.setAttribute('height', 28);
        rect.setAttribute('class', 'edge-label-bg');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', midX);
        text.setAttribute('y', midY);
        text.setAttribute('class', 'edge-label-text');
        text.textContent = edge.label;

        labelGroup.appendChild(rect);
        labelGroup.appendChild(text);
        g.appendChild(labelGroup);
      }

      // Edge Selection
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        this.state.selectEdge(edge.id);
      });

      this.edgesGroup.appendChild(g);
    });
  }

  // Interactive connection dragging
  startConnecting(nodeId, port, worldX, worldY) {
    this.isConnecting = true;
    this.dragStart = { nodeId, port, x: worldX, y: worldY };
    this.tempPath.style.display = 'block';
    this.tempPath.setAttribute('d', `M ${worldX} ${worldY} L ${worldX} ${worldY}`);
  }

  updateConnecting(worldX, worldY) {
    if (!this.isConnecting || !this.dragStart) return;
    const d = this.createPathD(
      { x: this.dragStart.x, y: this.dragStart.y },
      { x: worldX, y: worldY },
      'orthogonal',
      this.dragStart.port,
      'left'
    );
    this.tempPath.setAttribute('d', d);
  }

  endConnecting(targetNodeId = null, targetPort = 'left') {
    if (!this.isConnecting) return;
    if (targetNodeId && targetNodeId !== this.dragStart.nodeId) {
      const fromNode = this.state.nodes.find(n => n.id === this.dragStart.nodeId);
      let label = '';
      if (fromNode && fromNode.type === 'condition') {
        label = this.dragStart.port === 'right' ? 'Yes' : (this.dragStart.port === 'bottom' ? 'No' : '');
      }
      this.state.addEdge(this.dragStart.nodeId, this.dragStart.port, targetNodeId, targetPort, label, 'orthogonal');
    }
    this.isConnecting = false;
    this.dragStart = null;
    this.tempPath.style.display = 'none';
  }
}
