// State.js: Central reactive state manager with history & event emitter
import { normalizeChecklist, normalizeBranches, isBranchPort, branchIdOf, branchPort } from './Branches.js';
import { defaultTimeline } from './Timeline.js';

// Hint texts that older versions saved as a node's real description
const PLACEHOLDER_DESCS = new Set([
  '단계 세부 정보 입력', '흐름의 출발점 · 현재 위치', '하나의 할 일·개념·과정', '여러 확인 항목을 가진 단계',
  '중간 목표 · 달성 지점', '최종 목표 · 흐름의 끝', '두 갈래로 나뉘는 판단', '선택지가 3개 이상인 판단',
  '교재·자격증·참고 자료', '실습·상담·면접 등 사람이 하는 일'
]);

export class State {
  constructor(projectManager) {
    this.projectManager = projectManager;
    this.listeners = new Map();

    // Data
    this.nodes = [];
    this.edges = [];
    this.notes = [];
    this.timeline = null; // time axis of a timeline board (see Timeline.js)
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
    // Older versions stored hint text as the real description; show those as empty
    this.nodes.forEach(n => { if (PLACEHOLDER_DESCS.has(n.desc)) n.desc = ''; });
    this.edges = JSON.parse(JSON.stringify(proj.edges || []));
    this.notes = JSON.parse(JSON.stringify(proj.notes || []));
    // Time axis (timeline board): only when the project is in timeline mode
    this.timeline = proj.mode === 'timeline' ? JSON.parse(JSON.stringify(proj.timeline || defaultTimeline(this.nodes))) : null;
    this.viewport = proj.viewport ? { ...proj.viewport } : { x: 80, y: 80, zoom: 1 };

    this.selectedNodeIds.clear();
    this.selectedEdgeId = null;
    this.selectedNoteId = null;
    this.historyStack = [];
    this.redoStack = [];
    this.gestureSnapshot = null;

    this.emit('project:loaded', proj);
    this.emit('timeline:change', this.timeline);
    this.emit('canvas:change');
  }

  // Replace the time axis (null turns the timeline board off) — one undo step
  setTimeline(timeline) {
    this.pushHistory();
    this.timeline = timeline ? JSON.parse(JSON.stringify(timeline)) : null;
    this.save();
    this.emit('timeline:change', this.timeline);
    this.emit('canvas:change');
  }

  enableTimeline() {
    if (this.timeline) return;
    this.setTimeline(defaultTimeline(this.nodes));
  }

  // Column label at world x (for showing it on nodes)
  timelineLabelAt(x) {
    const tl = this.timeline;
    if (!tl) return '';
    let left = tl.originX;
    for (const c of tl.cols) {
      if (x >= left && x < left + c.w) return c.label;
      left += c.w;
    }
    return '';
  }

  save() {
    if (this.isApplyingHistory || this.gestureSnapshot) return;
    this.projectManager.updateActiveProjectData({
      nodes: this.nodes,
      edges: this.edges,
      notes: this.notes,
      viewport: this.viewport,
      mode: this.timeline ? 'timeline' : 'flowchart',
      timeline: this.timeline || undefined
    });
  }

  snapshot() {
    return JSON.stringify({
      nodes: this.nodes,
      edges: this.edges,
      notes: this.notes,
      timeline: this.timeline
    });
  }

  applySnapshot(json) {
    const data = JSON.parse(json);
    this.nodes = data.nodes;
    this.edges = data.edges;
    this.notes = data.notes;
    this.timeline = data.timeline || null;
    this.emit('timeline:change', this.timeline);
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

    this.redoStack.push(this.snapshot());
    this.applySnapshot(this.historyStack.pop());

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

    this.historyStack.push(this.snapshot());
    this.applySnapshot(this.redoStack.pop());

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
    if (nodeData.shape) node.shape = nodeData.shape;
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

  // Copy the selected nodes and the connections between them
  copySelection() {
    const ids = this.selectedNodeIds;
    if (!ids.size) return null;
    const nodes = this.nodes.filter(n => ids.has(n.id));
    const edges = this.edges.filter(e => ids.has(e.from) && ids.has(e.to));
    return JSON.parse(JSON.stringify({ nodes, edges }));
  }

  // Paste a copied group with fresh ids. `at` (world point) puts the group's top-left
  // there; otherwise it is offset from the originals. The pasted nodes become the selection.
  pasteNodes(clip, at = null, offset = 40) {
    if (!clip || !Array.isArray(clip.nodes) || !clip.nodes.length) return [];
    this.pushHistory();
    const minX = Math.min(...clip.nodes.map(n => n.x));
    const minY = Math.min(...clip.nodes.map(n => n.y));
    const dx = at ? Math.round(at.x - minX) : offset;
    const dy = at ? Math.round(at.y - minY) : offset;
    const idMap = new Map();
    const stamp = Date.now().toString(36);
    clip.nodes.forEach((n, i) => {
      const id = `node_${stamp}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      idMap.set(n.id, id);
      const copy = JSON.parse(JSON.stringify(n));
      copy.id = id;
      copy.x = n.x + dx;
      copy.y = n.y + dy;
      copy.status = 'idle';
      this.nodes.push(copy);
    });
    (clip.edges || []).forEach((e, i) => {
      if (!idMap.has(e.from) || !idMap.has(e.to)) return;
      this.edges.push({ ...JSON.parse(JSON.stringify(e)), id: `e_${stamp}_${i}_${Math.random().toString(36).slice(2, 6)}`, from: idMap.get(e.from), to: idMap.get(e.to) });
    });
    this.selectedNodeIds = new Set(idMap.values());
    this.selectedEdgeId = null;
    this.selectedNoteId = null;
    this.save();
    this.emit('selection:change', { type: 'node', nodes: this.nodes.filter(n => this.selectedNodeIds.has(n.id)) });
    this.emit('canvas:change');
    return [...idMap.values()];
  }

  duplicateSelectedNodes() {
    this.pasteNodes(this.copySelection());
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

  // Set / clear the "main route" flag on several edges as one undo step
  setMainEdges(ids, on) {
    const targets = this.edges.filter(e => ids.includes(e.id) && !!e.main !== on);
    if (!targets.length) return;
    this.pushHistory();
    targets.forEach(e => { if (on) e.main = true; else delete e.main; });
    this.save();
    this.emit('canvas:change');
  }

  // First spot at or below (x, y) where a w×h box overlaps no node
  freeSpot(x, y, w, h, gap = 40) {
    const rects = this.nodes.map(n => {
      const s = (this.measureNode && this.measureNode(n)) || { width: 260, height: 90 };
      return { x: n.x, y: n.y, w: s.width, h: s.height };
    });
    for (let i = 0; i < 50; i++) {
      const hit = rects.find(r => x < r.x + r.w + gap && x + w + gap > r.x && y < r.y + r.h + gap && y + h + gap > r.y);
      if (!hit) break;
      y = hit.y + hit.h + gap;
    }
    return { x: Math.round(x), y: Math.round(y) };
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
