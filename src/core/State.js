// State.js: Central reactive state manager with history & event emitter
import { normalizeChecklist, normalizeBranches, isBranchPort, branchIdOf, branchPort } from './Branches.js';

export class State {
  constructor(projectManager) {
    this.projectManager = projectManager;
    this.listeners = new Map();

    // Data
    this.nodes = [];
    this.edges = [];
    this.notes = [];
    this.viewport = { x: 80, y: 80, zoom: 1 };

    // Selection
    this.selectedNodeIds = new Set();
    this.selectedEdgeId = null;
    this.selectedNoteId = null;

    // Undo / Redo history
    this.historyStack = [];
    this.redoStack = [];
    this.isApplyingHistory = false;
    // Snapshot taken when a drag/resize gesture starts; while set, per-move
    // updates skip history and saving until endGesture() commits them once.
    this.gestureSnapshot = null;
    this.viewportSaveTimer = null;

    // Load active project on init
    this.loadActiveProject();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => cb(data));
    }
  }

  loadActiveProject() {
    const proj = this.projectManager.getActiveProject();
    if (!proj) return;

    this.nodes = JSON.parse(JSON.stringify(proj.nodes || []));
    this.edges = JSON.parse(JSON.stringify(proj.edges || []));
    this.notes = JSON.parse(JSON.stringify(proj.notes || []));
    this.viewport = proj.viewport ? { ...proj.viewport } : { x: 80, y: 80, zoom: 1 };

    this.selectedNodeIds.clear();
    this.selectedEdgeId = null;
    this.selectedNoteId = null;
    this.historyStack = [];
    this.redoStack = [];
    this.gestureSnapshot = null;

    this.emit('project:loaded', proj);
    this.emit('canvas:change');
  }

  save() {
    if (this.isApplyingHistory || this.gestureSnapshot) return;
    this.projectManager.updateActiveProjectData({
      nodes: this.nodes,
      edges: this.edges,
      notes: this.notes,
      viewport: this.viewport
    });
  }

  snapshot() {
    return JSON.stringify({
      nodes: this.nodes,
      edges: this.edges,
      notes: this.notes
    });
  }

  pushHistory() {
    if (this.isApplyingHistory || this.gestureSnapshot) return;
    this.recordHistory(this.snapshot());
    this.save();
  }

  recordHistory(snapshot) {
    // Don't push identical states
    if (this.historyStack.length > 0 && this.historyStack[this.historyStack.length - 1] === snapshot) {
      return;
    }
    this.historyStack.push(snapshot);
    if (this.historyStack.length > 50) this.historyStack.shift();
    this.redoStack = []; // Clear redo stack on new action
    this.emit('history:change');
  }

  // Drag/resize: one undo step and one save per gesture instead of per mousemove
  beginGesture() {
    if (this.gestureSnapshot) this.endGesture();
    this.gestureSnapshot = this.snapshot();
  }

  endGesture() {
    const before = this.gestureSnapshot;
    if (!before) return;
    this.gestureSnapshot = null;
    if (before === this.snapshot()) return;
    this.recordHistory(before);
    this.save();
  }

  undo() {
    if (this.historyStack.length === 0) return;
    this.isApplyingHistory = true;

    const current = JSON.stringify({
      nodes: this.nodes,
      edges: this.edges,
      notes: this.notes
    });
    this.redoStack.push(current);

    const prev = JSON.parse(this.historyStack.pop());
    this.nodes = prev.nodes;
    this.edges = prev.edges;
    this.notes = prev.notes;

    this.selectedNodeIds.clear();
    this.selectedEdgeId = null;
    this.selectedNoteId = null;

    this.isApplyingHistory = false;
    this.save();
    this.emit('canvas:change');
    this.emit('history:change');
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.isApplyingHistory = true;

    const current = JSON.stringify({
      nodes: this.nodes,
      edges: this.edges,
      notes: this.notes
    });
    this.historyStack.push(current);

    const next = JSON.parse(this.redoStack.pop());
    this.nodes = next.nodes;
    this.edges = next.edges;
    this.notes = next.notes;

    this.isApplyingHistory = false;
    this.save();
    this.emit('canvas:change');
    this.emit('history:change');
  }

  canUndo() {
    return this.historyStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  // Node operations
  addNode(nodeData) {
    this.pushHistory();
    const id = nodeData.id || 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const node = {
      id,
      type: nodeData.type || 'action',
      category: nodeData.category || 'action',
      title: nodeData.title || '새 작업',
      desc: nodeData.desc || '',
      icon: nodeData.icon || 'action',
      color: nodeData.color || '#3b82f6',
      x: Math.round(nodeData.x || 200),
      y: Math.round(nodeData.y || 200),
      status: 'idle',
      memo: nodeData.memo || ''
    };
    if (nodeData.period) node.period = nodeData.period;
    if (nodeData.progress) node.progress = nodeData.progress;
    const checklist = normalizeChecklist(nodeData.checklist);
    if (checklist.length) node.checklist = checklist;
    const branches = normalizeBranches(nodeData.branches);
    if (branches && branches.length) node.branches = branches;
    this.nodes.push(node);
    this.selectNode(id, false);
    this.save();
    this.emit('node:added', node);
    this.emit('canvas:change');
    return node;
  }

  updateNode(id, patch) {
    const node = this.nodes.find(n => n.id === id);
    if (node) {
      this.pushHistory();
      Object.assign(node, patch);
      this.save();
      this.emit('node:updated', node);
      this.emit('canvas:change');
    }
  }

  // Replace a decision node's branch list in one undo step. Edges keep following
  // their branch (labels are renamed), edges of removed branches are deleted, and a
  // legacy Yes/No node's right/bottom edges are migrated to the 'yes'/'no' branches.
  updateBranches(nodeId, branches) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    this.pushHistory();
    const wasLegacy = !Array.isArray(node.branches);
    node.branches = branches.map(b => ({ id: b.id, label: b.label }));
    const byId = new Map(node.branches.map(b => [b.id, b]));
    this.edges = this.edges.filter(e => {
      if (e.from !== nodeId) return true;
      if (wasLegacy && (e.fromPort === 'right' || e.fromPort === 'bottom')) {
        const legacyId = e.fromPort === 'right' ? 'yes' : 'no';
        if (!byId.has(legacyId)) return false;
        e.fromPort = branchPort(legacyId);
      }
      if (isBranchPort(e.fromPort)) {
        const b = byId.get(branchIdOf(e.fromPort));
        if (!b) return false;
        e.label = b.label;
      }
      return true;
    });
    this.save();
    this.emit('node:updated', node);
    this.emit('canvas:change');
  }

  removeNode(id) {
    this.pushHistory();
    this.nodes = this.nodes.filter(n => n.id !== id);
    // Remove attached edges
    this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
    this.selectedNodeIds.delete(id);
    this.save();
    this.emit('node:removed', id);
    this.emit('canvas:change');
  }

  removeNodes(ids) {
    if (!ids || ids.length === 0) return;
    this.pushHistory();
    const idSet = new Set(ids);
    this.nodes = this.nodes.filter(n => !idSet.has(n.id));
    this.edges = this.edges.filter(e => !idSet.has(e.from) && !idSet.has(e.to));
    ids.forEach(id => this.selectedNodeIds.delete(id));
    this.save();
    this.emit('canvas:change');
  }

  duplicateSelectedNodes() {
    if (this.selectedNodeIds.size === 0) return;
    this.pushHistory();
    const newSelectedIds = new Set();

    this.selectedNodeIds.forEach(id => {
      const node = this.nodes.find(n => n.id === id);
      if (node) {
        const copy = {
          ...JSON.parse(JSON.stringify(node)),
          id: 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          title: `${node.title} (복사본)`,
          x: node.x + 40,
          y: node.y + 40
        };
        this.nodes.push(copy);
        newSelectedIds.add(copy.id);
      }
    });

    this.selectedNodeIds = newSelectedIds;
    this.save();
    this.emit('canvas:change');
  }

  // Edge operations
  addEdge(fromNodeId, fromPort, toNodeId, toPort, label = '', lineType = 'orthogonal') {
    // Prevent duplicate edges between same nodes
    const exists = this.edges.some(e => e.from === fromNodeId && e.to === toNodeId);
    if (exists || fromNodeId === toNodeId) return null;

    this.pushHistory();
    const edge = {
      id: 'e_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      from: fromNodeId,
      fromPort: fromPort || 'right',
      to: toNodeId,
      toPort: toPort || 'left',
      label: label || '',
      lineType: lineType || 'orthogonal'
    };
    this.edges.push(edge);
    this.save();
    this.emit('edge:added', edge);
    this.emit('canvas:change');
    return edge;
  }

  updateEdge(id, patch) {
    const edge = this.edges.find(e => e.id === id);
    if (edge) {
      this.pushHistory();
      Object.assign(edge, patch);
      this.save();
      this.emit('edge:updated', edge);
      this.emit('canvas:change');
    }
  }

  // Edge label; for an edge leaving an N-way decision the label is the branch name,
  // so the branch is renamed (keeps every edge of that branch in sync)
  setEdgeLabel(id, label) {
    const edge = this.edges.find(e => e.id === id);
    if (!edge || label === (edge.label || '')) return;
    const from = this.nodes.find(n => n.id === edge.from);
    if (from && isBranchPort(edge.fromPort) && Array.isArray(from.branches) && label) {
      const bid = branchIdOf(edge.fromPort);
      this.updateBranches(from.id, from.branches.map(b => (b.id === bid ? { ...b, label } : b)));
    } else {
      this.updateEdge(id, { label });
    }
  }

  removeEdge(id) {
    this.pushHistory();
    this.edges = this.edges.filter(e => e.id !== id);
    if (this.selectedEdgeId === id) this.selectedEdgeId = null;
    this.save();
    this.emit('edge:removed', id);
    this.emit('canvas:change');
  }

  // Sticky Note operations
  addNote(noteData = {}) {
    this.pushHistory();
    const note = {
      id: 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      x: Math.round(noteData.x || 300),
      y: Math.round(noteData.y || 150),
      width: noteData.width || 200,
      height: noteData.height || 140,
      color: noteData.color || 'yellow',
      text: noteData.text || ''
    };
    this.notes.push(note);
    this.selectNote(note.id);
    this.save();
    this.emit('note:added', note);
    this.emit('canvas:change');
    return note;
  }

  updateNote(id, patch) {
    const note = this.notes.find(n => n.id === id);
    if (note) {
      this.pushHistory();
      Object.assign(note, patch);
      this.save();
      this.emit('note:updated', note);
      this.emit('canvas:change');
    }
  }

  removeNote(id) {
    this.pushHistory();
    this.notes = this.notes.filter(n => n.id !== id);
    if (this.selectedNoteId === id) this.selectedNoteId = null;
    this.save();
    this.emit('note:removed', id);
    this.emit('canvas:change');
  }

  // Selection
  selectNode(id, isMulti = false) {
    if (!isMulti) {
      this.selectedNodeIds.clear();
      this.selectedEdgeId = null;
      this.selectedNoteId = null;
    }
    if (id) {
      this.selectedNodeIds.add(id);
    }
    this.emit('selection:change', {
      type: 'node',
      nodes: Array.from(this.selectedNodeIds).map(nid => this.nodes.find(n => n.id === nid)).filter(Boolean)
    });
    this.emit('canvas:change');
  }

  selectEdge(id) {
    this.selectedNodeIds.clear();
    this.selectedNoteId = null;
    this.selectedEdgeId = id;
    const edge = this.edges.find(e => e.id === id);
    this.emit('selection:change', { type: 'edge', edge });
    this.emit('canvas:change');
  }

  selectNote(id) {
    this.selectedNodeIds.clear();
    this.selectedEdgeId = null;
    this.selectedNoteId = id;
    const note = this.notes.find(n => n.id === id);
    this.emit('selection:change', { type: 'note', note });
    this.emit('canvas:change');
  }

  clearSelection() {
    this.selectedNodeIds.clear();
    this.selectedEdgeId = null;
    this.selectedNoteId = null;
    this.emit('selection:change', { type: 'none' });
    this.emit('canvas:change');
  }

  getSelectedNode() {
    if (this.selectedNodeIds.size === 1) {
      const id = Array.from(this.selectedNodeIds)[0];
      return this.nodes.find(n => n.id === id) || null;
    }
    return null;
  }

  getSelectedEdge() {
    return this.edges.find(e => e.id === this.selectedEdgeId) || null;
  }

  getSelectedNote() {
    return this.notes.find(n => n.id === this.selectedNoteId) || null;
  }

  // Viewport
  setViewport(x, y, zoom) {
    this.viewport.x = Math.round(x);
    this.viewport.y = Math.round(y);
    this.viewport.zoom = Math.min(Math.max(zoom, 0.25), 2.5);
    this.emit('viewport:change', this.viewport);
    this.scheduleViewportSave();
  }

  // Pan/zoom fire on every mouse/wheel event: persist the viewport lazily and
  // without bumping the project's updatedAt (so it doesn't count as an edit for sync)
  scheduleViewportSave() {
    const projectId = this.projectManager.activeProjectId;
    const viewport = { ...this.viewport };
    clearTimeout(this.viewportSaveTimer);
    this.viewportSaveTimer = setTimeout(() => {
      this.projectManager.updateProjectViewport(projectId, viewport);
    }, 400);
  }

  zoomBy(delta, centerX, centerY) {
    const oldZoom = this.viewport.zoom;
    const newZoom = Math.min(Math.max(oldZoom + delta, 0.25), 2.5);
    if (oldZoom === newZoom) return;

    // Zoom centered on given coordinates
    const scale = newZoom / oldZoom;
    const newX = centerX - (centerX - this.viewport.x) * scale;
    const newY = centerY - (centerY - this.viewport.y) * scale;

    this.setViewport(newX, newY, newZoom);
  }

  fitToContent(containerWidth, containerHeight) {
    if (this.nodes.length === 0 && this.notes.length === 0) {
      this.setViewport(80, 80, 1);
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.nodes.forEach(n => {
      const size = (this.measureNode && this.measureNode(n)) || { width: 240, height: 90 };
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + size.width);
      maxY = Math.max(maxY, n.y + size.height);
    });
    this.notes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    });

    const contentWidth = maxX - minX + 120;
    const contentHeight = maxY - minY + 200; // room for the bottom dock
    const scaleX = containerWidth / contentWidth;
    const scaleY = containerHeight / contentHeight;
    // Never shrink below a readable size; large flows start left-aligned and can be panned
    const zoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.7), 1);

    const fitsX = (maxX - minX) * zoom + 120 <= containerWidth;
    const x = fitsX
      ? (containerWidth - (maxX - minX) * zoom) / 2 - minX * zoom
      : 60 - minX * zoom;
    const y = Math.max((containerHeight - 80 - (maxY - minY) * zoom) / 2, 40) - minY * zoom;

    this.setViewport(x, y, zoom);
  }
}
