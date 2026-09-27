// NodeRenderer.js: Flowchart ISO shape rendering, magnetic ports, and Whimsical-style [+] quick connectors
import { Icons, getIcon } from '../utils/icons.js';
import { soundFx } from '../utils/audio.js';

// Node shape = flowchart symbol, so node kinds are told apart by outline, not color.
// Shapes drawn with SVG are stretched to the node box (non-scaling stroke keeps lines crisp);
// 'terminal' and 'process' are plain CSS boxes.
const SHAPE_PATHS = {
  decision: '<path d="M50 1 L99 50 L50 99 L1 50 Z"/>',
  manual: '<path d="M1 1 H99 L91 99 H9 Z"/>',
  document: '<path d="M1 1 H99 V84 C80 76 66 104 42 94 C26 88 12 86 1 92 Z"/>',
  database: '<path d="M1 11 C1 -3 99 -3 99 11 V89 C99 103 1 103 1 89 Z"/><path class="shape-detail" d="M1 11 C1 25 99 25 99 11"/>',
  subprocess: '<path d="M1 1 H99 V99 H1 Z"/><path class="shape-detail" d="M7 1 V99 M93 1 V99"/>',
  io: '<path d="M9 1 H99 L91 99 H1 Z"/>',
  delay: '<path d="M1 1 H76 C104 1 104 99 76 99 H1 Z"/>'
};

export function getNodeShape(node) {
  if (node.type === 'start' || node.type === 'end') return 'terminal';
  if (node.type === 'condition') return 'decision';
  if (node.type === 'manual' || node.type === 'document') return node.type;
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
      const ports = ['top', 'right', 'bottom', 'left']
        .map(p => `<div class="node-port node-port-${p}" data-port="${p}"></div>`)
        .join('');
      const quickAdds = shape === 'terminal' && node.type === 'end'
        ? ''
        : `<div class="node-quick-add add-right" data-direction="right" title="${node.type === 'condition' ? 'Yes 분기 다음 단계 추가' : '우측에 다음 단계 추가'}">+</div>` +
          (shape === 'terminal' ? '' : `<div class="node-quick-add add-bottom" data-direction="bottom" title="${node.type === 'condition' ? 'No 분기 다음 단계 추가' : '하단에 다음 단계 추가'}">+</div>`);

      el.innerHTML = `
        ${SHAPE_PATHS[shape] ? `<svg class="node-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${SHAPE_PATHS[shape]}</svg>` : ''}
        <div class="node-body">
          <div class="node-header">
            <div class="node-icon" style="color: ${accentColor};">${getIcon(node.icon, node.type)}</div>
            <div class="node-title" contenteditable="true" spellcheck="false" title="클릭하여 이름 변경">${this.escapeHtml(node.title)}</div>
          </div>
          ${node.desc && shape !== 'terminal' && shape !== 'decision' ? `<div class="node-desc">${this.escapeHtml(node.desc)}</div>` : ''}
          ${node.memo && shape !== 'terminal' && shape !== 'decision' ? `<div class="node-memo" title="${this.escapeHtml(node.memo)}">${Icons.stickyNote}<span>${this.escapeHtml(node.memo)}</span></div>` : ''}
        </div>
        ${node.memo && (shape === 'terminal' || shape === 'decision') ? `<div class="node-memo-dot" title="메모: ${this.escapeHtml(node.memo)}">${Icons.stickyNote}</div>` : ''}
        ${isRunState ? `<div class="node-run-status"><span class="status-dot"></span>${this.getStatusLabel(node.status)}</div>` : ''}
        ${ports}
        ${quickAdds}
      `;

      // Selection & Drag initiation
      el.addEventListener('mousedown', (e) => {
        if (e.target.closest('.node-port') || e.target.closest('.node-quick-add')) return;

        e.stopPropagation();

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
          if (e.key === 'Enter') {
            e.preventDefault();
            titleEl.blur();
          }
        });
      }

      // Port Drag Connection Start
      el.querySelectorAll('.node-port').forEach(portEl => {
        portEl.addEventListener('mousedown', (e) => {
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
