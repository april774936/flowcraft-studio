// HomeDashboard.js: Full-screen dashboard overlay for managing projects
import { Icons } from '../utils/icons.js';
import { Exporter } from '../utils/exporter.js';

export class HomeDashboard {
  constructor(state, projectManager, container) {
    this.state = state;
    this.pm = projectManager;
    this.container = container;
    
    this.selectedMode = 'flowchart';
    this.searchQuery = '';

    this.render();
    this.initEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="dashboard-header">
        <div class="dashboard-logo">
          ${Icons.workflow}
          FlowCraft Studio
        </div>
      </div>
      
      <div class="dashboard-layout">
        <!-- Sidebar Navigation -->
        <aside class="dashboard-sidebar">
          <div class="sidebar-menu-item active" data-view="projects">
            <span class="sidebar-menu-icon">🗂️</span> 내 프로젝트
          </div>
          <div class="sidebar-menu-item" data-view="memory">
            <span class="sidebar-menu-icon">🧠</span> 메모리(에셋)
          </div>
          <div class="sidebar-menu-item" data-view="trash">
            <span class="sidebar-menu-icon">🗑️</span> 휴지통
          </div>
          <div style="flex: 1;"></div>
          <div class="sidebar-menu-item" data-view="settings">
            <span class="sidebar-menu-icon">⚙️</span> 환경설정
          </div>
        </aside>

        <!-- Main Body -->
        <div class="dashboard-body">
          <!-- 1. Projects View -->
          <div class="dashboard-view active" id="view-projects">
            <div class="dashboard-section-title">내 프로젝트</div>
            <div class="project-grid" id="dash-project-grid">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- 2. Memory View -->
          <div class="dashboard-view" id="view-memory">
            <div class="dashboard-section-title">메모리 (에셋 보관함)</div>
            <p style="color: var(--text-muted);">자주 사용하는 워크플로우 템플릿이나 텍스트 메모를 저장하고 꺼내 쓸 수 있는 공간입니다.</p>
            <div class="project-grid" style="margin-top:24px;">
              <div class="dash-card create-new">
                <div>+ 새 에셋 추가 (준비중)</div>
              </div>
            </div>
          </div>

          <!-- 3. Trash View -->
          <div class="dashboard-view" id="view-trash">
            <div class="dashboard-section-title">휴지통</div>
            <p style="color: var(--text-muted); margin-bottom: 24px;">삭제된 프로젝트는 이곳에 보관됩니다. 영구 삭제 시 복구할 수 없습니다.</p>
            <div class="project-grid" id="dash-trash-grid">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- 4. Settings View -->
          <div class="dashboard-view" id="view-settings">
            <div class="dashboard-section-title">환경설정</div>
            <div style="background: var(--bg-surface); padding: 24px; border-radius: 12px; border: 1px solid var(--border-medium);">
              <h3 style="margin-bottom: 16px;">앱 테마 설정</h3>
              <div style="display: flex; gap: 12px;">
                <button class="btn-secondary" id="dash-btn-theme-dark">다크 모드</button>
                <button class="btn-secondary" id="dash-btn-theme-light">라이트 모드</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Context Menu -->
      <div class="dash-context-menu" id="dash-context-menu">
        <div class="dash-context-item" id="ctx-rename">✏️ 이름 변경</div>
        <div class="dash-context-item" id="ctx-duplicate">📋 복제하기</div>
        <div class="dash-context-item danger" id="ctx-delete">🗑️ 휴지통으로 이동</div>
      </div>

      <!-- Create Project Modal -->
      <div class="dash-create-modal" id="dash-create-modal">
        <div class="dash-create-content">
          <div class="dashboard-section-title">새 프로젝트 만들기</div>
          
          <div class="form-group" style="margin-bottom: 24px;">
            <label class="form-label">프로젝트 이름</label>
            <input type="text" id="dash-new-name" class="form-input" placeholder="새 프로젝트" />
          </div>

          <label class="form-label">보드 종류 선택</label>
          <div class="mode-selector">
            <div class="mode-card selected" id="mode-flowchart" data-mode="flowchart">
              <div class="mode-card-icon">🔀</div>
              <div style="font-weight: 600; margin-bottom: 4px;">자유 배치 보드</div>
              <div style="font-size: 12px; color: var(--text-muted);">플로우차트, 순서도 및 자유로운 다이어그램 작성에 적합합니다.</div>
            </div>
            <div class="mode-card" id="mode-timeline" data-mode="timeline">
              <div class="mode-card-icon">⏱️</div>
              <div style="font-weight: 600; margin-bottom: 4px;">타임라인 보드</div>
              <div style="font-size: 12px; color: var(--text-muted);">가로형 시간축을 바탕으로 진행되는 로드맵이나 일정 관리에 적합합니다.</div>
            </div>
          </div>
          
          <div style="display:flex; justify-content: flex-end; gap: 8px; margin-top: 32px;">
            <button class="btn-secondary" id="btn-dash-cancel">취소</button>
            <button class="btn-primary" id="btn-dash-create">생성하기</button>
          </div>
        </div>
      </div>
    `;
  }

  open() {
    this.renderProjectList();
    this.container.classList.add('active');
  }

  close() {
    this.container.classList.remove('active');
  }

  renderProjectList() {
    const grid = document.getElementById('dash-project-grid');
    if (!grid) return;
    
    grid.innerHTML = `
      <div class="dash-card create-new" id="dash-btn-new">
        <div class="dash-card-icon" style="background: transparent; border: 2px solid currentColor; border-radius: 50%; font-size: 24px; margin-bottom: 8px;">+</div>
        <div>새 프로젝트 생성</div>
      </div>
    `;

    const projects = this.pm.getProjectsList(false); // active only
    projects.forEach(proj => {
      const isTimeline = proj.mode === 'timeline';
      const card = document.createElement('div');
      card.className = 'dash-card';
      
      const updatedStr = new Date(proj.updatedAt || proj.createdAt).toLocaleDateString();
      
      card.innerHTML = `
        <div class="dash-card-icon ${isTimeline ? 'timeline' : ''}">
          ${isTimeline ? '⏱️' : Icons.workflow}
        </div>
        <div class="dash-card-title" title="${this.escapeHtml(proj.name)}">${this.escapeHtml(proj.name)}</div>
        <div class="dash-card-meta">
          ${isTimeline ? '타임라인' : '플로우차트'} • 수정일: ${updatedStr}
        </div>
        
        <div class="dash-card-actions">
          <button class="dash-card-del-btn" title="삭제" style="color: var(--text-muted); background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px;">🗑️</button>
          <button class="dash-card-menu-btn" title="옵션 메뉴">⋮</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.dash-card-menu-btn') || e.target.closest('.dash-card-del-btn')) return;
        this.pm.switchProject(proj.id);
        this.state.loadActiveProject();
        this.close(); // Go to canvas
      });

      // Delete Action
      const delBtn = card.querySelector('.dash-card-del-btn');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`'${proj.name}' 프로젝트를 삭제하시겠습니까?`)) {
            const wasActive = this.pm.getActiveProject()?.id === proj.id;
            this.pm.deleteProject(proj.id);
            if (wasActive) {
              this.state.loadActiveProject();
            }
            this.renderRecents();
            this.renderTrash();
          }
        });
      }

      // Context Menu Action
      card.querySelector('.dash-card-menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.showContextMenu(e, proj);
      });

      grid.appendChild(card);
    });

    // New Project Button
    document.getElementById('dash-btn-new')?.addEventListener('click', () => {
      document.getElementById('dash-create-modal').classList.add('active');
      const nameInp = document.getElementById('dash-new-name');
      nameInp.value = '';
      setTimeout(() => nameInp.focus(), 100);
    });
  }

  renderTrashList() {
    const grid = document.getElementById('dash-trash-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const deleted = this.pm.getDeletedProjects ? this.pm.getDeletedProjects() : [];
    if (deleted.length === 0) {
      grid.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">휴지통이 비어 있습니다.</p>`;
      return;
    }

    deleted.forEach(proj => {
      const card = document.createElement('div');
      card.className = 'dash-card';
      card.style.opacity = '0.7';
      
      const updatedStr = new Date(proj.updatedAt || proj.createdAt).toLocaleDateString();
      
      card.innerHTML = `
        <div class="dash-card-icon" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">🗑️</div>
        <div class="dash-card-title" title="${this.escapeHtml(proj.name)}">${this.escapeHtml(proj.name)}</div>
        <div class="dash-card-meta">삭제됨 • ${updatedStr}</div>
        
        <div class="dash-card-actions" style="opacity: 1; top: auto; bottom: 12px;">
          <button class="btn-secondary btn-restore" style="font-size: 11px; padding: 2px 8px;">복원</button>
          <button class="btn-secondary btn-hard-delete" style="font-size: 11px; padding: 2px 8px; color: #ef4444; border-color: rgba(239,68,68,0.3);">영구 삭제</button>
        </div>
      `;

      card.querySelector('.btn-restore').addEventListener('click', (e) => {
        e.stopPropagation();
        this.pm.restoreProject(proj.id);
        this.renderTrashList();
        this.renderProjectList();
      });

      card.querySelector('.btn-hard-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`'${proj.name}'을(를) 영구 삭제하시겠습니까? 복구할 수 없습니다.`)) {
          this.pm.hardDeleteProject(proj.id);
          this.renderTrashList();
        }
      });

      grid.appendChild(card);
    });
  }

  showContextMenu(e, proj) {
    const menu = document.getElementById('dash-context-menu');
    const rect = e.target.getBoundingClientRect();
    
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left - 100}px`; // shift left slightly
    menu.classList.add('active');

    // Clone & Replace items to remove old listeners
    const renameBtn = this.replaceNode(document.getElementById('ctx-rename'));
    const dupBtn = this.replaceNode(document.getElementById('ctx-duplicate'));
    const delBtn = this.replaceNode(document.getElementById('ctx-delete'));

    renameBtn.addEventListener('click', () => {
      menu.classList.remove('active');
      const newName = prompt('새 프로젝트 이름:', proj.name);
      if (newName && newName.trim()) {
        this.pm.renameProject(proj.id, newName.trim());
        this.renderProjectList();
      }
    });

    dupBtn.addEventListener('click', () => {
      menu.classList.remove('active');
      this.pm.duplicateProject(proj.id);
      this.renderProjectList();
    });

    delBtn.addEventListener('click', () => {
      menu.classList.remove('active');
      if (confirm(`'${proj.name}'을(를) 휴지통으로 이동하시겠습니까?`)) {
        this.pm.deleteProject(proj.id);
        this.renderProjectList();
        this.renderTrashList();
      }
    });

    // Close on outside click
    const closeMenu = (evt) => {
      if (!menu.contains(evt.target) && evt.target !== e.target) {
        menu.classList.remove('active');
        document.removeEventListener('click', closeMenu);
      }
    };
    document.addEventListener('click', closeMenu);
  }

  replaceNode(node) {
    const clone = node.cloneNode(true);
    node.parentNode.replaceChild(clone, node);
    return clone;
  }

  initEvents() {
    // Sidebar Navigation
    const navItems = this.container.querySelectorAll('.sidebar-menu-item');
    const views = this.container.querySelectorAll('.dashboard-view');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        const targetId = `view-${item.dataset.view}`;
        views.forEach(v => v.classList.remove('active'));
        document.getElementById(targetId)?.classList.add('active');

        if (item.dataset.view === 'trash') this.renderTrashList();
        if (item.dataset.view === 'projects') this.renderProjectList();
      });
    });

    // Settings Theme Toggle
    document.getElementById('dash-btn-theme-dark')?.addEventListener('click', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    document.getElementById('dash-btn-theme-light')?.addEventListener('click', () => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    // Mode Selection
    const modeCards = this.container.querySelectorAll('.mode-card');
    modeCards.forEach(card => {
      card.addEventListener('click', () => {
        modeCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedMode = card.dataset.mode;
      });
    });

    // Cancel Create
    const modal = document.getElementById('dash-create-modal');
    document.getElementById('btn-dash-cancel')?.addEventListener('click', () => {
      modal.classList.remove('active');
    });

    // Submit Create
    document.getElementById('btn-dash-create')?.addEventListener('click', () => {
      const name = document.getElementById('dash-new-name').value.trim() || '새 프로젝트';
      
      // Determine template based on mode
      const template = this.selectedMode === 'timeline' ? 'timeline_basic' : 'blank';
      
      this.pm.createProject(name, template, this.selectedMode);
      this.state.loadActiveProject();
      modal.classList.remove('active');
      this.close();
    });
  }

  escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
