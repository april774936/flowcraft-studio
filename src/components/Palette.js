// Palette.js: Left sidebar node library, categorized drag-and-drop items, and templates
import { getIcon } from '../utils/icons.js';
import { getNodeShape, SHAPE_PATHS } from './NodeRenderer.js';
import { isAdvanced } from '../utils/advanced.js';

// `advanced: true` categories only show when 고급 기능 is on
export const NodeLibrary = [
  {
    category: '기본 단계',
    items: [
      { type: 'start', category: 'start', title: '시작', desc: '흐름의 출발점 · 현재 위치', icon: 'start', color: '#10b981' },
      { type: 'action', category: 'action', title: '단계', desc: '하나의 할 일·개념·과정', icon: 'action', color: '#3b82f6' },
      {
        type: 'action', category: 'action', title: '체크리스트 단계', desc: '여러 확인 항목을 가진 단계',
        icon: 'check', color: '#10b981', checklist: ['확인 항목 1', '확인 항목 2', '확인 항목 3']
      },
      { type: 'milestone', category: 'milestone', title: '마일스톤', desc: '중간 목표 · 달성 지점', icon: 'flag', color: '#f59e0b' },
      { type: 'end', category: 'end', title: '목표 / 끝', desc: '최종 목표 · 흐름의 끝', icon: 'target', color: '#ec4899' }
    ]
  },
  {
    category: '분기',
    items: [
      { type: 'condition', category: 'condition', title: '예 / 아니오', desc: '두 갈래로 나뉘는 판단', icon: 'condition', color: '#8b5cf6' },
      {
        type: 'condition', category: 'condition', title: '여러 갈래 분기', desc: '선택지가 3개 이상인 판단',
        icon: 'condition', color: '#8b5cf6', branches: ['선택 A', '선택 B', '선택 C']
      }
    ]
  },
  {
    category: '자료 · 메모',
    items: [
      { type: 'document', category: 'document', title: '자료 / 문서', desc: '교재·자격증·참고 자료', icon: 'book', color: '#f59e0b' },
      { type: 'manual', category: 'manual', title: '직접 할 일', desc: '실습·상담·면접 등 사람이 하는 일', icon: 'user', color: '#f97316' },
      { type: 'action', category: 'action', shape: 'offpage', title: 'Off-page', desc: '다른 페이지로 이어짐 · 역오각형', icon: 'action', color: '#06b6d4' },
      { type: 'action', category: 'action', shape: 'onpage', title: 'On-page', desc: '같은 페이지 안 연결점 · 원', icon: 'action', color: '#06b6d4' },
      { type: 'action', category: 'action', shape: 'filing', title: 'Filing', desc: '문서 보관 · 역삼각형', icon: 'action', color: '#a78bfa' },
      { type: 'action', category: 'action', shape: 'invtrap', title: 'Decision', desc: '판단 · 역사다리꼴', icon: 'action', color: '#8b5cf6' },
      { type: 'note', category: 'note', title: '스티키 메모', desc: '캔버스에 자유 메모 추가', icon: 'stickyNote', color: '#facc15' }
    ]
  },
  {
    category: '자동화 (고급)',
    advanced: true,
    items: [
      { type: 'start', category: 'start', title: 'Webhook 수신', desc: '외부 HTTP Webhook 이벤트 수신', icon: 'webhook', color: '#10b981' },
      { type: 'start', category: 'start', title: '스케줄러 (Cron)', desc: '주기적인 타이머 반복 실행', icon: 'delay', color: '#10b981' },
      { type: 'action', category: 'action', title: '데이터 필터/변환', desc: 'JSON 데이터 가공 및 필터링', icon: 'transform', color: '#3b82f6' },
      { type: 'action', category: 'action', title: '시간 지연 (Delay)', desc: '지정 시간 동안 대기', icon: 'delay', color: '#3b82f6' },
      { type: 'action', category: 'integration', title: 'HTTP / API 호출', desc: 'REST API 요청 및 응답 처리', icon: 'api', color: '#10b981' },
      { type: 'action', category: 'integration', title: '이메일 발송', desc: 'SMTP / SendGrid 이메일 전송', icon: 'email', color: '#ec4899' },
      { type: 'action', category: 'integration', title: 'Slack / 메신저 알림', desc: '팀 채널에 메시지 통보', icon: 'message', color: '#f59e0b' },
      { type: 'action', category: 'integration', title: '데이터베이스 쿼리', desc: 'SQL / NoSQL 읽기/쓰기', icon: 'database', color: '#10b981' },
      { type: 'end', category: 'end', title: '실패 / 중단', desc: '오류 발생 시 종료', icon: 'end', color: '#ef4444' }
    ]
  }
];

export class Palette {
  constructor(state, contentArea, canvas) {
    this.state = state;
    this.contentArea = contentArea;
    this.canvas = canvas;
    this.activeTab = 'palette';
    this.searchQuery = '';

    this.render();
    this.setupDropTarget();
    window.addEventListener('advanced:change', () => this.render());
  }

  setTab(tabName) {
    this.activeTab = tabName;
    this.render();
  }

  setSearchQuery(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.render();
  }

  render() {
    this.contentArea.innerHTML = '';

    if (this.activeTab === 'palette') {
      this.renderPaletteItems();
    } else {
      this.renderTemplates();
    }
  }

  renderPaletteItems() {
    let hasMatch = false;

    NodeLibrary.forEach(cat => {
      if (cat.advanced && !isAdvanced()) return;
      const filteredItems = cat.items.filter(item => {
        if (!this.searchQuery) return true;
        return item.title.toLowerCase().includes(this.searchQuery) ||
               item.desc.toLowerCase().includes(this.searchQuery);
      });

      if (filteredItems.length === 0) return;
      hasMatch = true;

      const catEl = document.createElement('div');
      catEl.className = 'palette-category';
      catEl.innerHTML = `<div class="category-title">${cat.category}</div>`;

      const gridEl = document.createElement('div');
      gridEl.className = 'palette-items-grid';

      filteredItems.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'palette-item';
        itemEl.draggable = true;

        // Mini version of the node's flowchart shape, so the palette matches the canvas
        const shape = item.type === 'note' ? 'note' : getNodeShape(item);
        itemEl.innerHTML = `
          <div class="palette-item-icon shape-${shape}" style="--accent: ${item.color}; color: ${item.color};">
            ${SHAPE_PATHS[shape] ? `<svg class="palette-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${SHAPE_PATHS[shape]}</svg>` : ''}
            <span class="palette-glyph">${getIcon(item.icon, item.type)}</span>
          </div>
          <div class="palette-item-info">
            <div class="palette-item-name">${item.title}</div>
            <div class="palette-item-desc">${item.desc}</div>
          </div>
        `;

        // Drag start
        itemEl.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/json', JSON.stringify(item));
          e.dataTransfer.effectAllowed = 'copy';
        });

        // Click to add at center
        itemEl.addEventListener('click', () => {
          this.addItemAtCenter(item);
        });

        gridEl.appendChild(itemEl);
      });

      catEl.appendChild(gridEl);
      this.contentArea.appendChild(catEl);
    });

    if (!hasMatch) {
      this.contentArea.innerHTML = `
        <div style="text-align:center; padding: 30px 10px; color: var(--text-muted); font-size: 13px;">
          검색된 노드가 없습니다.
        </div>
      `;
    }
  }

  renderTemplates() {
    const templates = [
      { key: 'career', name: '🧭 커리어 로드맵', badge: '로드맵', desc: '현재 위치 → 역량 진단 → 단기 목표 → 경로 선택(3갈래) → 중기 · 장기 목표. 기간 · 진행 상태 포함' },
      { key: 'intlorg', name: '🌐 국제기구 진출 로드맵', badge: '로드맵', desc: '졸업(0년)에서 직행 / Big 4 / 석사로 분기 → 2 · 3년 시점 분기 → 기구별 조건 · 시간축 포함' },
      { key: 'study', name: '📚 공부 흐름도', badge: '공부', desc: '자료 → 핵심 개념 → 원리 → 예제 → 이해도 점검(3갈래) → 응용 · 복습 루프' },
      { key: 'exam', name: '📝 시험 준비 계획', badge: '공부', desc: 'D-120부터 범위 파악 · 1회독 · 기출 · 모의고사 → 점수별 대응 → 시험' },
      { key: 'realestate', name: '🏠 부동산 매매 절차', badge: '체크리스트', desc: '매물 확인 → 결과별 3갈래 분기 → 계약서 작성 → 잔금 · 등기' },
      { key: 'ecommerce', name: '🛍️ 이커머스 결제 자동화', badge: '자동화', desc: '주문 · 재고 · 결제 · 알림 자동화 예시', advanced: true },
      { key: 'cicd', name: '🚀 CI/CD 배포 파이프라인', badge: '자동화', desc: '빌드 · 테스트 · 배포 자동화 예시', advanced: true }
    ].filter(t => !t.advanced || isAdvanced());

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';

    const hint = document.createElement('div');
    hint.className = 'template-hint';
    hint.textContent = '템플릿을 누르면 새 프로젝트로 만들어져요. 지금 프로젝트는 그대로 남아요.';
    container.appendChild(hint);

    templates.forEach(tpl => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <span class="template-badge">${tpl.badge}</span>
        <div class="template-name">${tpl.name}</div>
        <div class="template-desc">${tpl.desc}</div>
      `;

      card.addEventListener('click', () => {
        const name = tpl.name.replace(/^\S+\s/, '');
        if (!confirm(`'${name}' 템플릿으로 새 프로젝트를 만들까요?`)) return;
        const pm = this.state.projectManager;
        pm.createProject(name, tpl.key);
        this.state.loadActiveProject();
      });

      container.appendChild(card);
    });

    this.contentArea.appendChild(container);
  }

  // The palette description is a hint, not content: new nodes start with an empty
  // description and the title selected, so typing replaces it.
  createNode(item, x, y, avoidOverlap) {
    const pos = avoidOverlap ? this.state.freeSpot(x, y, 260, 90) : { x: Math.round(x), y: Math.round(y) };
    const node = this.state.addNode({ ...item, desc: '', ...pos });
    this.state.emit('quick:edit-title', node.id);
  }

  addItemAtCenter(item) {
    const container = this.canvas.container.getBoundingClientRect();
    const centerWorld = this.canvas.screenToWorld(
      container.left + container.width / 2,
      container.top + container.height / 2
    );

    if (item.type === 'note') {
      this.state.addNote({
        x: Math.round(centerWorld.x - 100),
        y: Math.round(centerWorld.y - 70),
        color: 'yellow'
      });
    } else {
      this.createNode(item, centerWorld.x - 130, centerWorld.y - 45, true);
    }
  }

  setupDropTarget() {
    const target = this.canvas.container;

    target.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    target.addEventListener('drop', (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;

      try {
        const item = JSON.parse(raw);
        const worldPos = this.canvas.screenToWorld(e.clientX, e.clientY);

        if (item.type === 'note') {
          this.state.addNote({
            x: Math.round(worldPos.x - 100),
            y: Math.round(worldPos.y - 70),
            color: 'yellow'
          });
        } else {
          this.createNode(item, worldPos.x - 130, worldPos.y - 45, false);
        }
      } catch (err) {
        console.error('Failed to drop item onto canvas', err);
      }
    });
  }
}
