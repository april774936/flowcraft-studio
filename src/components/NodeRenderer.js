// NodeRenderer.js: Flowchart ISO shape rendering, magnetic ports, and Whimsical-style [+] quick connectors
import { Icons } from '../utils/icons.js';
import { soundFx } from '../utils/audio.js';
import { branchPort, branchPortPoint, newItemId } from '../core/Branches.js';
import { isSecondClick } from '../utils/doubleClick.js';

const MAX_VISIBLE_CHECKS = 8;

// Node shape = flowchart symbol, so node kinds are told apart by outline, not color.
// Shapes drawn with SVG are stretched to the node box (non-scaling stroke keeps lines crisp);
// 'terminal' and 'process' are plain CSS boxes.
export const SHAPE_PATHS = {
  decision: '<path d="M50 1 L99 50 L50 99 L1 50 Z"/>',
  manual: '<path d="M1 1 H99 L91 99 H9 Z"/>',
  document: '<path d="M1 1 H99 V84 C80 76 66 104 42 94 C26 88 12 86 1 92 Z"/>',
  database: '<path d="M1 11 C1 -3 99 -3 99 11 V89 C99 103 1 103 1 89 Z"/><path class="shape-detail" d="M1 11 C1 25 99 25 99 11"/>',
  subprocess: '<path d="M1 1 H99 V99 H1 Z"/><path class="shape-detail" d="M7 1 V99 M93 1 V99"/>',
  io: '<path d="M9 1 H99 L91 99 H1 Z"/>',
  delay: '<path d="M1 1 H76 C104 1 104 99 76 99 H1 Z"/>',
  milestone: '<path d="M7 1 H93 L99 50 L93 99 H7 L1 50 Z"/>'
};

// Roadmap status shown on nodes (independent of the run-simulation status)
export const PROGRESS_STATES = [
  { key: 'planned', label: '예정' },
  { key: 'active', label: '진행 중' },
  { key: 'done', label: '완료' }
];

export function getNodeShape(node) {
  if (node.type === 'start' || node.type === 'end') return 'terminal';
  if (node.type === 'condition') return 'decision';
  if (node.type === 'manual' || node.type === 'document') return node.type;
  if (node.type === 'milestone') return 'milestone';
  switch (node.icon) {
    case 'database': return 'database';
    case 'api': return 'subprocess';
    case 'email':
    case 'message': return 'io';
    case 'delay': return 'delay';
    case 'user': return 'manual';
    default: return 'process';
  }
}

export class NodeRenderer {
  constructor(state, nodesLayer, connections, canvas, timelineRuler) {
    this.state = state;
    this.layer = nodesLayer;
    this.connections = connections;
    this.canvas = canvas;
    this.timelineRuler = timelineRuler;

    this.dragNodesState = null;

    this.state.measureNode = (node) => {
      const el = this.layer.querySelector(`[data-node-id="${node.id}"]`);
      return el && el.offsetWidth ? { width: el.offsetWidth, height: el.offsetHeight } : null;
    };

    this.initWindowEvents();
    this.render();

    this.state.on('canvas:change', () => this.render());
  }

  render() {
    this.layer.innerHTML = '';

    this.state.nodes.forEach(node => {
      const isSelected = this.state.selectedNodeIds.has(node.id);
      const el = document.createElement('div');
      el.className = `workflow-node type-${node.type} status-${node.status || 'idle'} ${isSelected ? 'selected' : ''}`;
      el.dataset.nodeId = node.id;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;

      const accentColor = node.color || '#3b82f6';
      const shape = getNodeShape(node);
      el.classList.add(`shape-${shape}`);
      el.style.setProperty('--node-accent', accentColor);

      const isRunState = node.status && node.status !== 'idle';
      const branches = shape === 'decision' && Array.isArray(node.branches) ? node.branches : null;
      // N-way decision: inputs on top/left/bottom, one output port per branch (positioned after layout)
      const ports = (branches ? ['top', 'bottom', 'left'] : ['top', 'right', 'bottom', 'left'])
        .map(p => `<div class="node-port node-port-${p}" data-port="${p}"></div>`)
        .join('') +
        (branches ? branches.map(b => `
          <div class="node-port node-port-branch" data-port="${branchPort(b.id)}" data-branch="${this.escapeHtml(b.id)}" title="${this.escapeHtml(b.label)} 분기">
            <span class="branch-tag">${this.escapeHtml(b.label)}</span>
          </div>`).join('') : '');
      const quickAdds = shape === 'terminal' && node.type === 'end'
        ? ''
        : branches
          ? `<div class="node-quick-add add-right" data-direction="branch" title="새 분기 + 다음 단계 추가">+</div>`
          : `<div class="node-quick-add add-right" data-direction="right" title="${node.type === 'condition' ? 'Yes 분기 다음 단계 추가' : '우측에 다음 단계 추가'}">+</div>` +
            (shape === 'terminal' ? '' : `<div class="node-quick-add add-bottom" data-direction="bottom" title="${node.type === 'condition' ? 'No 분기 다음 단계 추가' : '하단에 다음 단계 추가'}">+</div>`);

      // Checklist (sub-steps) on regular nodes; ticked directly on the canvas
      const checklist = shape !== 'terminal' && shape !== 'decision' && Array.isArray(node.checklist) ? node.checklist : [];
      const doneCount = checklist.filter(c => c.done).length;
      const checklistHtml = checklist.length ? `
        <div class="node-checklist">
          ${checklist.slice(0, MAX_VISIBLE_CHECKS).map((c, i) => `
            <div class="node-check ${c.done ? 'done' : ''}" data-check-idx="${i}" role="checkbox" aria-checked="${c.done}">
              <span class="node-checkbox"></span><span class="node-check-text">${this.escapeHtml(c.text)}</span>
            </div>`).join('')}
          ${checklist.length > MAX_VISIBLE_CHECKS ? `<div class="node-check-more">+${checklist.length - MAX_VISIBLE_CHECKS}개 더 (속성 패널에서 보기)</div>` : ''}
        </div>` : '';
      const progressHtml = checklist.length
        ? `<span class="node-progress ${doneCount === checklist.length ? 'complete' : ''}">${doneCount}/${checklist.length}</span>`
        : '';
      if (checklist.length) el.classList.add('has-checklist');

      // Roadmap info: period chip + status pill; finished steps are dimmed
      const progress = PROGRESS_STATES.find(p => p.key === node.progress);
      if (progress) el.classList.add(`progress-${progress.key}`);
      const metaHtml = (node.period || progress) && shape !== 'decision' ? `
        <div class="node-meta">
          ${node.period ? `<span class="node-period">${this.escapeHtml(node.period)}</span>` : ''}
          ${progress ? `<span class="node-progress-pill p-${progress.key}">${progress.key === 'done' ? '✓ ' : ''}${progress.label}</span>` : ''}
        </div>` : '';

      el.innerHTML = `
        ${SHAPE_PATHS[shape] ? `<svg class="node-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${SHAPE_PATHS[shape]}</svg>` : ''}
        <div class="node-body">
          ${metaHtml}
          <div class="node-header">
            <div class="node-title" contenteditable="true" spellcheck="false" title="클릭하여 이름 변경">${this.escapeHtml(node.title)}</div>
            ${progressHtml}
          </div>
          ${node.desc && shape !== 'terminal' && shape !== 'decision' ? `<div class="node-desc">${this.escapeHtml(node.desc)}</div>` : ''}
          ${checklistHtml}
          ${node.memo && shape !== 'terminal' && shape !== 'decision' ? `<div class="node-memo" title="${this.escapeHtml(node.memo)}">${Icons.stickyNote}<span>${this.escapeHtml(node.memo)}</span></div>` : ''}
        </div>
        ${node.memo && (shape === 'terminal' || shape === 'decision') ? `<div class="node-memo-dot" title="메모: ${this.escapeHtml(node.memo)}">${Icons.stickyNote}</div>` : ''}
        ${isRunState ? `<div class="node-run-status"><span class="status-dot"></span>${this.getStatusLabel(node.status)}</div>` : ''}
        ${ports}
        ${quickAdds}
      `;

      // Dropping a connection anywhere on a node connects to it (ports handle their own drop)
      el.addEventListener('mouseup', (e) => {
        if (!this.connections.isConnecting || e.target.closest('.node-port')) return;
        e.stopPropagation();
        this.connections.endConnecting(node.id, 'left');
        this.canvas.container.classList.remove('connecting');
        soundFx.playSnap();
      });

      // Toggle a checklist item straight from the canvas
      el.querySelectorAll('.node-check').forEach(item => {
        item.addEventListener('mousedown', (e) => { if (e.button === 0) e.stopPropagation(); });
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = Number(item.dataset.checkIdx);
          const next = node.checklist.map((c, i) => (i === idx ? { ...c, done: !c.done } : c));
          this.state.updateNode(node.id, { checklist: next });
          soundFx.playSnap();
        });
      });

      // Selection & Drag initiation
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // right/middle drag pans the canvas
        if (e.target.closest('.node-port') || e.target.closest('.node-quick-add')) return;

        e.stopPropagation();

        // Second click on the same node → edit its title (works across re-renders)
        if (!e.target.closest('.node-check') && isSecondClick('node:' + node.id) && !e.target.isContentEditable) {
          e.preventDefault();
          requestAnimationFrame(() => this.editTitle(node.id));
          return;
        }

        const isMulti = e.metaKey || e.ctrlKey || e.shiftKey;
        if (!this.state.selectedNodeIds.has(node.id) || isMulti) {
          this.state.selectNode(node.id, isMulti);
        }

        if (e.target.classList.contains('node-title')) {
          return;
        }

        const worldPos = this.canvas.screenToWorld(e.clientX, e.clientY);
        const selectedNodes = this.state.nodes.filter(n => this.state.selectedNodeIds.has(n.id));

        this.state.beginGesture();
        this.dragNodesState = {
          startWorldX: worldPos.x,
          startWorldY: worldPos.y,
          nodes: selectedNodes.map(n => {
            const domEl = document.getElementById(`node-${n.id}`);
            if (domEl) domEl.classList.add('dragging');
            return {
              id: n.id,
              origX: n.x,
              origY: n.y
            };
          })
        };
      });

      // Inline Title Edit
      const titleEl = el.querySelector('.node-title');
      if (titleEl) {
        titleEl.addEventListener('blur', () => {
          const text = titleEl.innerText.trim();
          if (text && text !== node.title) {
            this.state.updateNode(node.id, { title: text });
          }
        });
        titleEl.addEventListener('keydown', (e) => {
          if (e.isComposing) return; // Korean IME: let the composition finish first
          if (e.key === 'Enter') {
            e.preventDefault();
            titleEl.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            titleEl.innerText = node.title;
            titleEl.blur();
          } else if (e.key === 'Tab') {
            // Commit and continue with the next step (quick input)
            e.preventDefault();
            titleEl.blur();
            this.state.emit('quick:child', node.id);
          }
        });
      }

      // Port Drag Connection Start
      el.querySelectorAll('.node-port').forEach(portEl => {
        portEl.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          const port = portEl.dataset.port;
          const coords = this.connections.getPortCoordinates(node, port);
          this.connections.startConnecting(node.id, port, coords.x, coords.y);
          this.canvas.container.classList.add('connecting');
          soundFx.playSnap();
        });

        // Port Drop Target
        portEl.addEventListener('mouseup', (e) => {
          if (this.connections.isConnecting) {
            e.stopPropagation();
            const targetPort = portEl.dataset.port;
            this.connections.endConnecting(node.id, targetPort);
            this.canvas.container.classList.remove('connecting');
            soundFx.playSnap();
          }
        });
      });

      // Whimsical / Miro Style Quick Add [+] Buttons
      el.querySelectorAll('.node-quick-add').forEach(quickBtn => {
        quickBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const dir = quickBtn.dataset.direction;

          // N-way decision: add a new branch and a step connected to it
          if (dir === 'branch') {
            const label = `분기 ${node.branches.length + 1}`;
            const id = newItemId('br');
            this.state.updateBranches(node.id, [...node.branches, { id, label }]);
            const count = node.branches.length;
            const newNode = this.state.addNode({
              title: `${label} 처리`, desc: '', type: 'action', category: 'action',
              x: node.x + 320, y: node.y + (count - 2) * 140,
              color: '#3b82f6'
            });
            this.state.addEdge(node.id, branchPort(id), newNode.id, 'left', label, 'orthogonal');
            this.state.selectNode(newNode.id, false);
            soundFx.playPop();
            return;
          }

          const isRight = dir === 'right';

          const newX = isRight ? node.x + 280 : node.x;
          const newY = isRight ? node.y : node.y + 160;

          let nextType = 'action';
          let nextTitle = '새로운 처리 단계';
          let label = '';

          if (node.type === 'condition') {
            label = isRight ? 'Yes' : 'No';
            nextTitle = isRight ? '승인/실행 단계' : '반려/재시도 단계';
          } else if (node.type === 'start') {
            nextTitle = '데이터 검증 및 처리';
          }

          const newNode = this.state.addNode({
            title: nextTitle,
            desc: '단계 세부 정보 입력',
            type: nextType,
            category: nextType,
            x: newX,
            y: newY,
            color: isRight ? '#3b82f6' : '#f59e0b'
          });

          const fromPort = isRight ? 'right' : 'bottom';
          const toPort = isRight ? 'left' : 'top';
          this.state.addEdge(node.id, fromPort, newNode.id, toPort, label, 'orthogonal');
          this.state.selectNode(newNode.id, false);
          soundFx.playPop();
        });
      });

      this.layer.appendChild(el);

      // Branch ports sit on the diamond outline, which needs the rendered size
      if (branches) {
        const w = el.offsetWidth, h = el.offsetHeight;
        el.querySelectorAll('.node-port-branch').forEach((portEl, i) => {
          const p = branchPortPoint(i, branches.length, w, h);
          portEl.style.left = `${p.x - 6}px`;
          portEl.style.top = `${p.y - 6}px`;
        });
      }
    });
  }

  initWindowEvents() {
    window.addEventListener('mousemove', (e) => {
      // 1. Moving selected nodes with alignment snapping
      if (this.dragNodesState) {
        const currentWorld = this.canvas.screenToWorld(e.clientX, e.clientY);
        const dx = currentWorld.x - this.dragNodesState.startWorldX;
        const dy = currentWorld.y - this.dragNodesState.startWorldY;

        const proj = this.state.getActiveProject ? this.state.getActiveProject() : null;
        const isTimeline = proj && proj.mode === 'timeline';

        let guideSnappedX = false;
        let guideSnappedY = false;

        this.dragNodesState.nodes.forEach(item => {
          const node = this.state.nodes.find(n => n.id === item.id);
          if (node) {
            let targetX = Math.round(item.origX + dx);
            let targetY = Math.round(item.origY + dy);

            // Snap logic in timeline mode
            if (isTimeline && this.timelineRuler) {
              const absoluteX = item.origX + dx;
              const snappedX = this.timelineRuler.snapToColumn(absoluteX);
              targetX = Math.round(snappedX);
            }

            // Alignment Snapping with other nodes (threshold: 6px)
            const snapThreshold = 6;
            this.state.nodes.forEach(other => {
              if (other.id !== node.id && !this.state.selectedNodeIds.has(other.id)) {
                if (Math.abs(other.x - targetX) < snapThreshold) {
                  targetX = other.x;
                  this.canvas.showGuide('y', targetX);
                  guideSnappedY = true;
                }
                if (Math.abs(other.y - targetY) < snapThreshold) {
                  targetY = other.y;
                  this.canvas.showGuide('x', targetY);
                  guideSnappedX = true;
                }
              }
            });

            node.x = targetX;
            node.y = targetY;
          }
        });

        if (!guideSnappedX && this.canvas.guideX) this.canvas.guideX.style.display = 'none';
        if (!guideSnappedY && this.canvas.guideY) this.canvas.guideY.style.display = 'none';

        this.updateNodePositionsInDOM();
        this.connections.renderEdges();
      }

      // 2. Dragging connection wire
      if (this.connections.isConnecting) {
        const worldPos = this.canvas.screenToWorld(e.clientX, e.clientY);
        this.connections.updateConnecting(worldPos.x, worldPos.y);
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.dragNodesState) {
        this.dragNodesState.nodes.forEach(n => {
          const domEl = document.getElementById(`node-${n.id}`);
          if (domEl) domEl.classList.remove('dragging');
        });
        this.dragNodesState = null;
        this.canvas.hideGuides();
        this.state.endGesture();
        this.state.emit('canvas:change');
      }

      if (this.connections.isConnecting) {
        this.connections.endConnecting(null);
        this.canvas.container.classList.remove('connecting');
      }
    });
  }

  // Put the caret in a node's title with the text selected (typing replaces it)
  editTitle(nodeId) {
    const titleEl = this.layer.querySelector(`[data-node-id="${nodeId}"] .node-title`);
    if (!titleEl) return;
    titleEl.focus();
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  updateNodePositionsInDOM() {
    this.state.nodes.forEach(node => {
      const el = this.layer.querySelector(`[data-node-id="${node.id}"]`);
      if (el) {
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
      }
    });
  }

  getStatusLabel(status) {
    switch (status) {
      case 'running': return '실행 중...';
      case 'success': return '정상 완료';
      case 'error': return '오류 발생';
      default: return '대기 중';
    }
  }

  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
