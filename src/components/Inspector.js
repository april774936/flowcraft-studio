// Inspector.js: Right drawer properties editor and node-level documentation memo tab
import { Icons, getIcon } from '../utils/icons.js';

export class Inspector {
  constructor(state, contentArea, headerTitleEl, headerIconEl, aiEngine) {
    this.state = state;
    this.contentArea = contentArea;
    this.headerTitle = headerTitleEl;
    this.headerIcon = headerIconEl;
    this.aiEngine = aiEngine;
    this.activeTab = 'properties'; // 'properties' | 'memo'

    this.render();

    this.state.on('selection:change', () => this.render());
    this.state.on('canvas:change', () => this.render());
  }

  setTab(tab) {
    this.activeTab = tab;
    this.render();
  }

  render() {
    const selectedNode = this.state.getSelectedNode();
    const selectedEdge = this.state.getSelectedEdge();
    const selectedNote = this.state.getSelectedNote();

    if (selectedNode) {
      this.headerTitle.textContent = selectedNode.title || '노드 속성';
      this.headerIcon.innerHTML = getIcon(selectedNode.icon, selectedNode.type);
      if (this.activeTab === 'properties') {
        this.renderNodeProperties(selectedNode);
      } else {
        this.renderNodeMemo(selectedNode);
      }
    } else if (selectedEdge) {
      this.headerTitle.textContent = '연결선 속성';
      this.headerIcon.innerHTML = Icons.workflow;
      this.renderEdgeProperties(selectedEdge);
    } else if (selectedNote) {
      this.headerTitle.textContent = '스티키 메모';
      this.headerIcon.innerHTML = Icons.stickyNote;
      this.renderNoteProperties(selectedNote);
    } else {
      this.headerTitle.textContent = '속성 인스펙터';
      this.headerIcon.innerHTML = Icons.settings;
      this.renderEmptyState();
    }
  }

  renderNodeProperties(node) {
    this.contentArea.innerHTML = `
      <div class="inspector-section" style="background: rgba(168,85,247,0.1); border: 1px solid rgba(168,85,247,0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <label class="inspector-label" style="color: #c084fc; margin-bottom: 8px;">✨ AI Copilot 추천 액션</label>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button class="btn-secondary" id="insp-ai-next" style="justify-content: flex-start; background: var(--bg-surface); border-color: rgba(168,85,247,0.2);">
            ${Icons.sparkles} 다음 단계 추천받기
          </button>
          <button class="btn-secondary" id="insp-ai-error" style="justify-content: flex-start; background: var(--bg-surface); border-color: rgba(168,85,247,0.2);">
            ${Icons.shield || Icons.workflow} 예외/오류 처리 연결
          </button>
        </div>
      </div>

      <div class="inspector-section">
        <label class="inspector-label">노드 제목</label>
        <input type="text" class="inspector-input" id="inp-node-title" value="${this.escapeHtml(node.title)}" />
      </div>

      <div class="inspector-section">
        <label class="inspector-label">상세 설명</label>
        <textarea class="inspector-textarea" id="inp-node-desc" placeholder="이 노드가 수행하는 작업에 대한 상세 설명">${this.escapeHtml(node.desc || '')}</textarea>
      </div>

      <div class="inspector-section">
        <label class="inspector-label">포인트 색상 (Accent)</label>
        <div class="inspector-color-grid">
          ${['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'].map(color => `
            <div class="inspector-color-btn ${node.color === color ? 'selected' : ''}" data-color="${color}" style="background-color: ${color};"></div>
          `).join('')}
        </div>
      </div>

      <div class="inspector-section">
        <label class="inspector-label">노드 타입</label>
        <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; color: var(--primary-light);">
          ${node.type} (${node.category})
        </div>
      </div>

      <div class="inspector-section" style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="btn-secondary" id="btn-duplicate-node" style="flex: 1;">
          ${Icons.copy} 복제하기
        </button>
        <button class="btn-secondary" id="btn-delete-node" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
          ${Icons.trash} 삭제
        </button>
      </div>
    `;

    // AI Copilot Actions
    this.contentArea.querySelector('#insp-ai-next')?.addEventListener('click', () => {
      if (this.aiEngine && this.aiEngine.suggestNextStep) {
        this.aiEngine.suggestNextStep(node.id);
      }
    });

    this.contentArea.querySelector('#insp-ai-error')?.addEventListener('click', () => {
      if (this.aiEngine && this.aiEngine.addErrorHandling) {
        // addErrorHandling relies on the node being selected in the state
        this.aiEngine.addErrorHandling();
      }
    });

    // Event listeners
    const titleInp = this.contentArea.querySelector('#inp-node-title');
    titleInp.addEventListener('change', () => {
      this.state.updateNode(node.id, { title: titleInp.value.trim() });
    });

    const descInp = this.contentArea.querySelector('#inp-node-desc');
    descInp.addEventListener('change', () => {
      this.state.updateNode(node.id, { desc: descInp.value.trim() });
    });

    this.contentArea.querySelectorAll('.inspector-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.updateNode(node.id, { color: btn.dataset.color });
      });
    });

    this.contentArea.querySelector('#btn-duplicate-node').addEventListener('click', () => {
      this.state.duplicateSelectedNodes();
    });

    this.contentArea.querySelector('#btn-delete-node').addEventListener('click', () => {
      this.state.removeNode(node.id);
    });
  }

  // Node-level documentation memo tab
  renderNodeMemo(node) {
    this.contentArea.innerHTML = `
      <div class="node-memo-container">
        <div class="node-memo-hint">
          📌 이 노드에 연결된 내부 개발 메모, API 스펙, 비즈니스 룰 또는 담당자 정보를 자유롭게 기록하세요.
        </div>
        <textarea class="node-memo-textarea" id="node-memo-input" placeholder="예: [담당자: 홍길동]&#10;- 승인 조건: 총 주문금액 5만원 미만&#10;- 실패 시 슬랙 #alert 채널로 자동 알림">${this.escapeHtml(node.memo || '')}</textarea>
      </div>
    `;

    const memoInp = this.contentArea.querySelector('#node-memo-input');
    memoInp.addEventListener('blur', () => {
      if (memoInp.value !== node.memo) {
        this.state.updateNode(node.id, { memo: memoInp.value });
      }
    });
  }

  renderEdgeProperties(edge) {
    this.contentArea.innerHTML = `
      <div class="inspector-section">
        <label class="inspector-label">연결선 라벨 텍스트</label>
        <input type="text" class="inspector-input" id="inp-edge-label" placeholder="예: Yes, No, 성공, 실패" value="${this.escapeHtml(edge.label || '')}" />
      </div>

      <div class="inspector-section">
        <label class="inspector-label">곡선 형태 (Line Type)</label>
        <div style="display: flex; gap: 6px;">
          <button class="btn-secondary ${edge.lineType === 'orthogonal' || !edge.lineType ? 'btn-primary' : ''}" id="btn-line-orthogonal" style="flex: 1; font-size: 11px;">
            직교선 (90°)
          </button>
          <button class="btn-secondary ${edge.lineType === 'bezier' ? 'btn-primary' : ''}" id="btn-line-bezier" style="flex: 1; font-size: 11px;">
            부드러운 곡선
          </button>
          <button class="btn-secondary ${edge.lineType === 'straight' ? 'btn-primary' : ''}" id="btn-line-straight" style="flex: 1; font-size: 11px;">
            직선
          </button>
        </div>
      </div>

      <div class="inspector-section" style="margin-top: 16px;">
        <button class="btn-secondary" id="btn-delete-edge" style="width: 100%; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
          ${Icons.trash} 연결선 삭제
        </button>
      </div>
    `;

    const labelInp = this.contentArea.querySelector('#inp-edge-label');
    labelInp.addEventListener('change', () => {
      this.state.updateEdge(edge.id, { label: labelInp.value.trim() });
    });

    this.contentArea.querySelector('#btn-line-bezier').addEventListener('click', () => {
      this.state.updateEdge(edge.id, { lineType: 'bezier' });
    });
    this.contentArea.querySelector('#btn-line-step').addEventListener('click', () => {
      this.state.updateEdge(edge.id, { lineType: 'step' });
    });
    this.contentArea.querySelector('#btn-line-straight').addEventListener('click', () => {
      this.state.updateEdge(edge.id, { lineType: 'straight' });
    });

    this.contentArea.querySelector('#btn-delete-edge').addEventListener('click', () => {
      this.state.removeEdge(edge.id);
    });
  }

  renderNoteProperties(note) {
    this.contentArea.innerHTML = `
      <div class="inspector-section">
        <label class="inspector-label">스티키 메모 색상</label>
        <div class="inspector-color-grid">
          ${['yellow', 'green', 'blue', 'pink', 'purple'].map(c => `
            <div class="color-dot ${c}" data-color="${c}" style="width: 24px; height: 24px;"></div>
          `).join('')}
        </div>
      </div>

      <div class="inspector-section" style="margin-top: 16px;">
        <button class="btn-secondary" id="btn-delete-note" style="width: 100%; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
          ${Icons.trash} 메모 삭제
        </button>
      </div>
    `;

    this.contentArea.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        this.state.updateNote(note.id, { color: dot.dataset.color });
      });
    });

    this.contentArea.querySelector('#btn-delete-note').addEventListener('click', () => {
      this.state.removeNote(note.id);
    });
  }

  renderEmptyState() {
    this.contentArea.innerHTML = `
      <div class="inspector-empty">
        <div class="inspector-empty-icon">${Icons.layout}</div>
        <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">선택된 항목 없음</div>
        <div style="font-size: 12px; line-height: 1.5;">
          캔버스에서 노드, 연결선, 또는 스티키 메모를 클릭하면 세부 속성을 변경할 수 있습니다.
        </div>
      </div>
    `;
  }

  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
