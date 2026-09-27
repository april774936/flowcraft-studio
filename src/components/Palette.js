// Palette.js: Left sidebar node library, categorized drag-and-drop items, and templates
import { getIcon } from '../utils/icons.js';
import { getNodeShape, SHAPE_PATHS } from './NodeRenderer.js';

export const NodeLibrary = [
  {
    category: '트리거 (Triggers)',
    items: [
      {
        type: 'start',
        category: 'start',
        title: '시작 이벤트',
        desc: '워크플로우의 진입점',
        icon: 'start',
        color: '#10b981'
      },
      {
        type: 'start',
        category: 'start',
        title: 'Webhook 수신',
        desc: '외부 HTTP Webhook 이벤트 수신',
        icon: 'webhook',
        color: '#10b981'
      },
      {
        type: 'start',
        category: 'start',
        title: '스케줄러 (Cron)',
        desc: '주기적인 타이머 반복 실행',
        icon: 'delay',
        color: '#10b981'
      }
    ]
  },
  {
    category: '프로세스 및 로직 (Logic)',
    items: [
      {
        type: 'action',
        category: 'action',
        title: '태스크 실행',
        desc: '일반적인 비즈니스 로직 처리',
        icon: 'action',
        color: '#3b82f6'
      },
      {
        type: 'condition',
        category: 'condition',
        title: '조건 분기 (If-Else)',
        desc: '참/거짓 조건에 따른 분기',
        icon: 'condition',
        color: '#8b5cf6'
      },
      {
        type: 'action',
        category: 'action',
        title: '데이터 필터/변환',
        desc: 'JSON 데이터 가공 및 필터링',
        icon: 'transform',
        color: '#3b82f6'
      },
      {
        type: 'action',
        category: 'action',
        title: '시간 지연 (Delay)',
        desc: '지정 시간 동안 대기',
        icon: 'delay',
        color: '#3b82f6'
      }
    ]
  },
  {
    category: '외부 서비스 연동 (Integrations)',
    items: [
      {
        type: 'action',
        category: 'integration',
        title: 'HTTP / API 호출',
        desc: 'REST API 요청 및 응답 처리',
        icon: 'api',
        color: '#10b981'
      },
      {
        type: 'action',
        category: 'integration',
        title: '이메일 발송',
        desc: 'SMTP / SendGrid 이메일 전송',
        icon: 'email',
        color: '#10b981'
      },
      {
        type: 'action',
        category: 'integration',
        title: 'Slack / 메신저 알림',
        desc: '팀 채널에 메시지 통보',
        icon: 'message',
        color: '#f59e0b'
      },
      {
        type: 'action',
        category: 'integration',
        title: '데이터베이스 쿼리',
        desc: 'SQL / NoSQL 읽기/쓰기',
        icon: 'database',
        color: '#10b981'
      }
    ]
  },
  {
    category: '종료 (Outcomes)',
    items: [
      {
        type: 'end',
        category: 'end',
        title: '성공 완료',
        desc: '정상 프로세스 마감',
        icon: 'end',
        color: '#ec4899'
      },
      {
        type: 'end',
        category: 'end',
        title: '실패 / 중단',
        desc: '오류 처리 후 비정상 마감',
        icon: 'end',
        color: '#ef4444'
      }
    ]
  },
  {
    category: '주석 및 메모 (Annotations)',
    items: [
      {
        type: 'note',
        category: 'note',
        title: '스티키 메모 (노랑)',
        desc: '캔버스에 자유 메모 추가',
        icon: 'stickyNote',
        color: '#facc15'
      }
    ]
  },
  {
    category: '보안 및 감사 (Auditing)',
    items: [
      {
        type: 'manual',
        category: 'manual',
        title: '수동 작업 (Manual Operation)',
        desc: '수기 기록, 육안 검토 등 사람의 작업',
        icon: 'edit',
        color: '#10b981' // Greenish as in the image
      },
      {
        type: 'document',
        category: 'document',
        title: '문서 (Document)',
        desc: '출력물, 기록 문서, 보고서',
        icon: 'fileText',
        color: '#f59e0b' // Yellowish/Orange
      },
      {
        type: 'action',
        category: 'action',
        title: '시스템 처리 (Process)',
        desc: '전산 처리 및 계산',
        icon: 'settings',
        color: '#f59e0b' // Red/Orange for system processes in their diagram
      }
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
      {
        key: 'ecommerce',
        name: '🛍️ 이커머스 결제 & 자동 배포',
        badge: '쇼핑몰/주문',
        desc: '주문 접수, 재고 확인, 분기 처리 및 카카오 알림톡 발송까지 포함된 완전한 결제 플로우'
      },
      {
        key: 'cicd',
        name: '🚀 DevOps CI/CD 배포 파이프라인',
        badge: '클라우드/빌드',
        desc: 'Git Push 감지, 자동 린트/테스트, Docker 빌드, K8s 배포 및 Slack 알림 연동'
      }
    ];

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';

    templates.forEach(tpl => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <span class="template-badge">${tpl.badge}</span>
        <div class="template-name">${tpl.name}</div>
        <div class="template-desc">${tpl.desc}</div>
      `;

      card.addEventListener('click', () => {
        if (confirm(`'${tpl.name}' 템플릿을 불러오시겠습니까? 현재 프로젝트의 내용이 템플릿으로 대체됩니다.`)) {
          const tplData = this.state.projectManager.getTemplateByKey(tpl.key);
          if (tplData) {
            this.state.pushHistory();
            this.state.nodes = JSON.parse(JSON.stringify(tplData.nodes));
            this.state.edges = JSON.parse(JSON.stringify(tplData.edges));
            this.state.notes = JSON.parse(JSON.stringify(tplData.notes || []));
            this.state.viewport = { ...tplData.viewport };
            this.state.save();
            this.state.emit('canvas:change');
          }
        }
      });

      container.appendChild(card);
    });

    this.contentArea.appendChild(container);
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
      this.state.addNode({
        ...item,
        x: Math.round(centerWorld.x - 110),
        y: Math.round(centerWorld.y - 45)
      });
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
          this.state.addNode({
            ...item,
            x: Math.round(worldPos.x - 110),
            y: Math.round(worldPos.y - 45)
          });
        }
      } catch (err) {
        console.error('Failed to drop item onto canvas', err);
      }
    });
  }
}
