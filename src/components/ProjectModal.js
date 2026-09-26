// ProjectModal.js: Comprehensive project switcher and management modal
import { Icons } from '../utils/icons.js';
import { Exporter } from '../utils/exporter.js';

export class ProjectModal {
  constructor(state, projectManager, modalOverlay) {
    this.state = state;
    this.pm = projectManager;
    this.overlay = modalOverlay;

    this.selectedTemplateKey = 'blank';
    this.searchQuery = '';

    this.listView = document.getElementById('project-modal-list-view');
    this.formView = document.getElementById('new-project-form-view');
    this.cardsContainer = document.getElementById('project-cards-container');
    this.searchInput = document.getElementById('project-search-input');
    this.headerProjectName = document.getElementById('header-project-name');

    this.initEvents();
    this.updateHeaderDisplay();
  }

  open() {
    this.showListView();
    this.renderProjectList();
    this.overlay.classList.add('active');
  }

  close() {
    this.overlay.classList.remove('active');
  }

  updateHeaderDisplay() {
    const active = this.pm.getActiveProject();
    if (active && this.headerProjectName) {
      this.headerProjectName.textContent = active.name;
    }
  }

  showListView() {
    this.listView.style.display = 'flex';
    this.formView.style.display = 'none';
  }

  showFormView() {
    this.listView.style.display = 'none';
    this.formView.style.display = 'flex';
    this.renderTemplateRadioOptions();
    const nameInp = document.getElementById('new-project-name-input');
    nameInp.value = '';
    setTimeout(() => nameInp.focus(), 100);
  }

  renderProjectList() {
    const projects = this.pm.getProjectsList();
    const activeId = this.pm.getActiveProject().id;
    this.cardsContainer.innerHTML = '';

    const filtered = projects.filter(p => {
      if (!this.searchQuery) return true;
      return p.name.toLowerCase().includes(this.searchQuery.toLowerCase());
    });

    if (filtered.length === 0) {
      this.cardsContainer.innerHTML = `
        <div style="text-align:center; padding: 30px; color: var(--text-muted); font-size: 13px;">
          검색된 프로젝트가 없습니다.
        </div>
      `;
      return;
    }

    filtered.forEach(proj => {
      const isActive = proj.id === activeId;
      const card = document.createElement('div');
      card.className = `project-card ${isActive ? 'active' : ''}`;

      const nodeCount = proj.nodes?.length || 0;
      const noteCount = proj.notes?.length || 0;
      const updatedStr = new Date(proj.updatedAt || proj.createdAt).toLocaleDateString();

      card.innerHTML = `
        <div class="project-card-main">
          <div class="project-card-icon">${Icons.workflow}</div>
          <div class="project-card-info">
            <div class="project-title-row">
              <span class="project-card-title">${this.escapeHtml(proj.name)}</span>
              ${isActive ? '<span class="badge-active-project">현재 작업 중</span>' : ''}
            </div>
            <div class="project-card-meta">
              <span>수정일: ${updatedStr}</span>
              <span>•</span>
              <span>노드 ${nodeCount}개</span>
              <span>•</span>
              <span>메모 ${noteCount}개</span>
            </div>
          </div>
        </div>
        <div class="project-card-actions">
          <button class="btn-icon btn-rename" title="이름 변경">${Icons.edit}</button>
          <button class="btn-icon btn-duplicate" title="프로젝트 복제">${Icons.copy}</button>
          <button class="btn-icon btn-download" title="JSON 다운로드">${Icons.download}</button>
          ${!isActive ? `<button class="btn-icon btn-delete" title="프로젝트 삭제" style="color:#ef4444;">${Icons.trash}</button>` : ''}
        </div>
      `;

      // Click card to open/switch project
      card.addEventListener('click', (e) => {
        if (e.target.closest('.project-card-actions')) return;
        this.pm.switchProject(proj.id);
        this.state.loadActiveProject();
        this.updateHeaderDisplay();
        this.close();
      });

      // Rename button
      card.querySelector('.btn-rename').addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt('새 프로젝트 이름을 입력하세요:', proj.name);
        if (newName && newName.trim()) {
          this.pm.renameProject(proj.id, newName.trim());
          this.updateHeaderDisplay();
          this.renderProjectList();
        }
      });

      // Duplicate button
      card.querySelector('.btn-duplicate').addEventListener('click', (e) => {
        e.stopPropagation();
        this.pm.duplicateProject(proj.id);
        this.renderProjectList();
      });

      // Download JSON
      card.querySelector('.btn-download').addEventListener('click', (e) => {
        e.stopPropagation();
        Exporter.exportJSON(proj, `${proj.name}.json`);
      });

      // Delete button
      const deleteBtn = card.querySelector('.btn-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`'${proj.name}' 프로젝트를 정말 삭제하시겠습니까?`)) {
            this.pm.deleteProject(proj.id);
            this.state.loadActiveProject();
            this.updateHeaderDisplay();
            this.renderProjectList();
          }
        });
      }

      this.cardsContainer.appendChild(card);
    });
  }

  renderTemplateRadioOptions() {
    const templates = [
      { key: 'blank', name: '빈 캔버스', desc: '새로운 빈 워크플로우로 시작' },
      { key: 'ecommerce', name: '이커머스 결제 & 배송', desc: '주문, 재고확인, 환불분기 템플릿' },
      { key: 'cicd', name: 'DevOps CI/CD 배포', desc: 'Git 감지, 빌드, K8s 배포 템플릿' }
    ];

    const grid = document.getElementById('template-radio-grid');
    grid.innerHTML = '';

    templates.forEach(tpl => {
      const card = document.createElement('div');
      card.className = `template-radio-card ${this.selectedTemplateKey === tpl.key ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="template-radio-name">${tpl.name}</div>
        <div class="template-radio-desc">${tpl.desc}</div>
      `;

      card.addEventListener('click', () => {
        this.selectedTemplateKey = tpl.key;
        grid.querySelectorAll('.template-radio-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });

      grid.appendChild(card);
    });
  }

  initEvents() {
    // Search input
    this.searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim();
      this.renderProjectList();
    });

    // Close buttons
    document.getElementById('btn-close-project-modal')?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // New Project buttons
    document.getElementById('btn-modal-create-project')?.addEventListener('click', () => {
      this.showFormView();
    });

    document.getElementById('btn-cancel-new-project')?.addEventListener('click', () => {
      this.showListView();
    });

    document.getElementById('btn-submit-new-project')?.addEventListener('click', () => {
      const nameInp = document.getElementById('new-project-name-input');
      const name = nameInp.value.trim() || '새 워크플로우 프로젝트';
      this.pm.createProject(name, this.selectedTemplateKey);
      this.state.loadActiveProject();
      this.updateHeaderDisplay();
      this.close();
    });
  }

  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
