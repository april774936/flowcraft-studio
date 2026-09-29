// QuickEdit.js: keyboard-first editing, mind-map style
//   Tab            → add the next step to the right of the selected node (decision: a new branch)
//   Enter          → add a step at the same level (sibling under the same parent)
//   F2 / dblclick  → edit the node title in place
//   Ctrl/⌘+Enter   → mark selected nodes done / not done
//   dblclick empty canvas → new step there;  dblclick an edge → edit its label in place
import { branchPort, legacyBranchesFor, newItemId } from './Branches.js';

const GAP_X = 150;
const GAP_Y = 40;

export class QuickEdit {
  constructor(state, canvas, connections, nodeRenderer) {
    this.state = state;
    this.canvas = canvas;
    this.connections = connections;
    this.nodes = nodeRenderer;
    this.labelInput = null;

    this.state.on('quick:child', (id) => this.addChild(id));
    this.state.on('quick:edge-label', (id) => this.editEdgeLabel(id));
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    this.canvas.container.addEventListener('dblclick', (e) => this.onCanvasDblClick(e));
  }

  size(node) {
    return (this.state.measureNode && this.state.measureNode(node)) || { width: 240, height: 80 };
  }

  onKeyDown(e) {
    const t = e.target;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName) || t.isContentEditable || e.isComposing) return;
    if (document.querySelector('.modal-overlay.active, .home-dashboard-overlay.active')) return;
    const node = this.state.getSelectedNode();
    const cmd = e.metaKey || e.ctrlKey;

    if (cmd && e.key === 'Enter') {
      const ids = Array.from(this.state.selectedNodeIds);
      if (!ids.length) return;
      e.preventDefault();
      const allDone = ids.every(id => (this.state.nodes.find(n => n.id === id) || {}).progress === 'done');
      this.batch(() => ids.forEach(id => this.state.updateNode(id, { progress: allDone ? undefined : 'done' })));
      return;
    }
    if (!node) return;
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); this.addChild(node.id); }
    else if (e.key === 'Enter' && !cmd) { e.preventDefault(); this.addSibling(node.id); }
    else if (e.key === 'F2') { e.preventDefault(); this.nodes.editTitle(node.id); }
  }

  // Several state mutations → one undo step and one save
  batch(fn) {
    this.state.beginGesture();
    try { fn(); } finally { this.state.endGesture(); }
    this.state.emit('canvas:change');
  }

  // Create a node, connect it, select it and start editing its title
  createAndEdit(data, connect) {
    let created = null;
    this.batch(() => {
      created = this.state.addNode(data);
      if (connect) this.state.addEdge(connect.from, connect.fromPort, created.id, connect.toPort || 'left', connect.label || '', 'orthogonal');
      this.state.selectNode(created.id, false);
    });
    requestAnimationFrame(() => this.nodes.editTitle(created.id));
    return created;
  }

  stepDefaults(parent) {
    const inherit = parent && ['action', 'milestone', 'document', 'manual'].includes(parent.type);
    return { title: '새 단계', type: 'action', category: 'action', icon: 'action', color: inherit ? parent.color : '#3b82f6' };
  }

  // Lowest bottom edge among the nodes an edge list points at
  bottomOfTargets(edges) {
    let bottom = -Infinity;
    edges.forEach(e => {
      const t = this.state.nodes.find(n => n.id === e.to);
      if (t) bottom = Math.max(bottom, t.y + this.size(t).height);
    });
    return bottom;
  }

  addChild(nodeId) {
    const node = this.state.nodes.find(n => n.id === nodeId);
    if (!node || node.type === 'end') return;
    const { width, height } = this.size(node);
    const x = Math.round(node.x + width + GAP_X);

    if (node.type === 'condition') {
      // Tab on a decision adds another branch with its own step
      const branches = Array.isArray(node.branches) ? node.branches.map(b => ({ ...b })) : legacyBranchesFor(node, this.state.edges);
      const id = newItemId('br');
      const label = `선택 ${branches.length + 1}`;
      let created = null;
      this.batch(() => {
        this.state.updateBranches(node.id, [...branches, { id, label }]);
        const out = this.state.edges.filter(e => e.from === node.id);
        const y = out.length ? this.bottomOfTargets(out) + GAP_Y : node.y;
        created = this.state.addNode({ ...this.stepDefaults(null), x, y });
        this.state.addEdge(node.id, branchPort(id), created.id, 'left', label, 'orthogonal');
        this.state.selectNode(created.id, false);
      });
      requestAnimationFrame(() => this.nodes.editTitle(created.id));
      return;
    }

    const out = this.state.edges.filter(e => e.from === node.id);
    const y = out.length ? this.bottomOfTargets(out) + GAP_Y : Math.round(node.y + height / 2 - 40);
    this.createAndEdit({ ...this.stepDefaults(node), x, y }, { from: node.id, fromPort: 'right' });
  }

  addSibling(nodeId) {
    const node = this.state.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const incoming = this.state.edges.find(e => e.to === node.id);
    const parent = incoming && this.state.nodes.find(n => n.id === incoming.from);
    const { height } = this.size(node);

    if (!parent) {
      this.createAndEdit({ ...this.stepDefaults(node), x: node.x, y: Math.round(node.y + height + GAP_Y) }, null);
      return;
    }
    if (parent.type === 'condition') {
      this.addChild(parent.id); // a sibling under a decision is a new branch
      return;
    }
    const siblings = this.state.edges.filter(e => e.from === parent.id && e.fromPort === incoming.fromPort);
    const y = Math.round(this.bottomOfTargets(siblings) + GAP_Y);
    this.createAndEdit({ ...this.stepDefaults(parent), x: node.x, y },
      { from: parent.id, fromPort: incoming.fromPort, toPort: incoming.toPort });
  }

  onCanvasDblClick(e) {
    if (e.target.closest('g[data-edge-id]')) return; // edges handle their own double-click
    if (e.target.closest('.workflow-node, .canvas-note, .minimap-container, .simulator-drawer, .canvas-floating-dock, .sidebar-collapse-toggle, .inspector-collapse-toggle, .edge-label-input')) return;
    const w = this.canvas.screenToWorld(e.clientX, e.clientY);
    this.createAndEdit({ ...this.stepDefaults(null), x: Math.round(w.x - 120), y: Math.round(w.y - 30) }, null);
  }

  // Inline editor over the edge label (or the middle of the edge)
  editEdgeLabel(edgeId) {
    const edge = this.state.edges.find(x => x.id === edgeId);
    if (!edge) return;
    this.closeLabelEditor(false);
    const g = document.querySelector(`g[data-edge-id="${edgeId}"]`);
    let cx = 0, cy = 0;
    const bg = g && g.querySelector('.edge-label-bg');
    if (bg) {
      cx = +bg.getAttribute('x') + +bg.getAttribute('width') / 2;
      cy = +bg.getAttribute('y') + +bg.getAttribute('height') / 2;
    } else {
      const path = g && g.querySelector('.edge-path');
      if (!path) return;
      const p = path.getPointAtLength(path.getTotalLength() / 2);
      cx = p.x; cy = p.y;
    }
    const input = document.createElement('input');
    input.className = 'edge-label-input';
    input.value = edge.label || '';
    input.placeholder = '라벨 입력';
    input.maxLength = 60;
    input.style.left = `${cx}px`;
    input.style.top = `${cy}px`;
    this.canvas.world.appendChild(input);
    this.labelInput = { input, edgeId };
    input.focus();
    input.select();
    input.addEventListener('keydown', (ev) => {
      if (ev.isComposing) return;
      if (ev.key === 'Enter') { ev.preventDefault(); this.closeLabelEditor(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); this.closeLabelEditor(false); }
    });
    input.addEventListener('blur', () => this.closeLabelEditor(true));
    input.addEventListener('mousedown', (ev) => ev.stopPropagation());
  }

  closeLabelEditor(commit) {
    if (!this.labelInput) return;
    const { input, edgeId } = this.labelInput;
    this.labelInput = null;
    const label = input.value.trim();
    input.remove();
    if (!commit) return;
    this.state.setEdgeLabel(edgeId, label);
  }
}
