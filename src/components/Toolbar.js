// Toolbar.js: Top header toolbar actions, buttons, AI Copilot, audio, and state sync
import { Icons } from '../utils/icons.js';
import { AutoLayout } from '../core/AutoLayout.js';
import { Exporter } from '../utils/exporter.js';
import { soundFx } from '../utils/audio.js';

export class Toolbar {
  constructor(state, projectModal, aiModal, simulator, canvas, aiEngine) {
    this.state = state;
    this.projectModal = projectModal;
    this.aiModal = aiModal;
    this.simulator = simulator;
    this.canvas = canvas;
    this.aiEngine = aiEngine;

    this.initIcons();
    this.initEvents();
    this.updateZoomLabel();
    this.updateUndoRedoButtons();

    this.state.on('viewport:change', () => this.updateZoomLabel());
    this.state.on('history:change', () => this.updateUndoRedoButtons());
    this.state.on('simulation:end', () => {
      this.updateSimulationButton(false);
      soundFx.playSuccess();
    });
  }

  initIcons() {
    // Populate header icons
    document.getElementById('logo-icon').innerHTML = Icons.workflow;
    const homeIcon = document.getElementById('home-icon');
    if (homeIcon) homeIcon.innerHTML = Icons.home;
    document.getElementById('project-icon-wrapper').innerHTML = Icons.folder;
    document.getElementById('project-chevron-wrapper').innerHTML = Icons.chevronDown;
    document.getElementById('ai-btn-icon').innerHTML = Icons.sparkles;
    
    // AI Copilot Dropdown icons
    const aiCopilotIcon = document.getElementById('ai-copilot-icon');
    if (aiCopilotIcon) aiCopilotIcon.innerHTML = Icons.bot || Icons.sparkles;
    const aiCopilotChevron = document.getElementById('ai-copilot-chevron');
    if (aiCopilotChevron) aiCopilotChevron.innerHTML = Icons.chevronDown;

    const iconAiNext = document.getElementById('icon-ai-next');
    if (iconAiNext) iconAiNext.innerHTML = Icons.sparkles;
    const iconAiErr = document.getElementById('icon-ai-error');
    if (iconAiErr) iconAiErr.innerHTML = Icons.shield;
    const iconAiNotif = document.getElementById('icon-ai-notif');
    if (iconAiNotif) iconAiNotif.innerHTML = Icons.bell;
    const iconAiAudit = document.getElementById('icon-ai-audit');
    if (iconAiAudit) iconAiAudit.innerHTML = Icons.compass;

    document.getElementById('note-btn-icon').innerHTML = Icons.stickyNote;
    document.getElementById('layout-btn-icon').innerHTML = Icons.layout;
    document.getElementById('run-btn-icon').innerHTML = Icons.play;

    document.getElementById('undo-icon').innerHTML = Icons.undo;
    document.getElementById('redo-icon').innerHTML = Icons.redo;

    document.getElementById('zoom-out-icon').innerHTML = Icons.zoomOut;
    document.getElementById('zoom-in-icon').innerHTML = Icons.zoomIn;
    document.getElementById('zoom-fit-icon').innerHTML = Icons.fitView;

    document.getElementById('export-icon').innerHTML = Icons.download;
    document.getElementById('export-chevron').innerHTML = Icons.chevronDown;
    document.getElementById('export-png-icon').innerHTML = Icons.download;
    document.getElementById('export-svg-icon').innerHTML = Icons.download;
    document.getElementById('export-json-icon').innerHTML = Icons.copy;
    document.getElementById('import-json-icon').innerHTML = Icons.upload;

    const soundIcon = document.getElementById('sound-icon');
    if (soundIcon) soundIcon.innerHTML = Icons.volume;

    const helpIcon = document.getElementById('help-icon');
    if (helpIcon) helpIcon.innerHTML = Icons.help;

    document.getElementById('theme-icon').innerHTML = Icons.sun;

    // Sidebar & Inspector icons
    document.getElementById('search-icon-box').innerHTML = Icons.search;
    document.getElementById('inspector-header-icon').innerHTML = Icons.settings;
    document.getElementById('inspector-close-icon').innerHTML = Icons.close;

    // Modals icons

    document.getElementById('ai-title-icon').innerHTML = Icons.sparkles;
    document.getElementById('ai-close-icon').innerHTML = Icons.close;
    document.getElementById('ai-sparkle-btn-icon').innerHTML = Icons.sparkles;

    document.getElementById('sim-icon').innerHTML = Icons.terminal;
    document.getElementById('sim-close-icon').innerHTML = Icons.close;

    const helpModalIcon = document.getElementById('help-modal-icon');
    if (helpModalIcon) helpModalIcon.innerHTML = Icons.help;
    const helpCloseIcon = document.getElementById('help-close-icon');
    if (helpCloseIcon) helpCloseIcon.innerHTML = Icons.close;

    // Floating Dock Icons
    const dockSelect = document.getElementById('dock-icon-select');
    if (dockSelect) dockSelect.innerHTML = Icons.pointer;
    const dockPan = document.getElementById('dock-icon-pan');
    if (dockPan) dockPan.innerHTML = Icons.hand;
    const dockTask = document.getElementById('dock-icon-task');
    if (dockTask) dockTask.innerHTML = Icons.action;
    const dockCond = document.getElementById('dock-icon-condition');
    if (dockCond) dockCond.innerHTML = Icons.condition;
    const dockNote = document.getElementById('dock-icon-note');
    if (dockNote) dockNote.innerHTML = Icons.stickyNote;
    const dockAi = document.getElementById('dock-icon-ai');
    if (dockAi) dockAi.innerHTML = Icons.sparkles;
  }

  initEvents() {
    // Sidebar & Inspector Collapse Toggles
    const appBody = document.querySelector('.app-body');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    btnToggleSidebar?.addEventListener('click', () => {
      appBody?.classList.toggle('sidebar-collapsed');
      const isCollapsed = appBody?.classList.contains('sidebar-collapsed');
      btnToggleSidebar.textContent = isCollapsed ? '▶' : '◀';
      soundFx.playSnap();
    });

    const btnToggleInspector = document.getElementById('btn-toggle-inspector');
    btnToggleInspector?.addEventListener('click', () => {
      appBody?.classList.toggle('inspector-collapsed');
      const isCollapsed = appBody?.classList.contains('inspector-collapsed');
      btnToggleInspector.textContent = isCollapsed ? '◀' : '▶';
      soundFx.playSnap();
    });

    // Floating Canvas Dock Tools
    const btnToolSelect = document.getElementById('dock-tool-select');
    const btnToolPan = document.getElementById('dock-tool-pan');

    btnToolSelect?.addEventListener('click', () => {
      btnToolSelect.classList.add('active');
      btnToolPan?.classList.remove('active');
      this.canvas.isPanMode = false;
      this.canvas.container.classList.remove('panning');
    });

    btnToolPan?.addEventListener('click', () => {
      btnToolPan.classList.add('active');
      btnToolSelect?.classList.remove('active');
      this.canvas.isPanMode = true;
      this.canvas.container.classList.add('panning');
    });

    // Dock quick-add buttons
    document.getElementById('dock-add-task')?.addEventListener('click', () => {
      const rect = this.canvas.container.getBoundingClientRect();
      const center = this.canvas.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      this.state.addNode({
        title: '새 비즈니스 작업',
        desc: '태스크 설명 입력',
        type: 'action',
        category: 'action',
        icon: 'action',
        color: '#3b82f6',
        x: Math.round(center.x - 110),
        y: Math.round(center.y - 45)
      });
      soundFx.playPop();
    });

    document.getElementById('dock-add-condition')?.addEventListener('click', () => {
      const rect = this.canvas.container.getBoundingClientRect();
      const center = this.canvas.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      this.state.addNode({
        title: '조건 분기 검사',
        desc: '참/거짓 조건에 따른 분기',
        type: 'condition',
        category: 'condition',
        icon: 'condition',
        color: '#8b5cf6',
        x: Math.round(center.x - 110),
        y: Math.round(center.y - 45)
      });
      soundFx.playPop();
    });

    document.getElementById('dock-add-note')?.addEventListener('click', () => {
      const rect = this.canvas.container.getBoundingClientRect();
      const center = this.canvas.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      this.state.addNote({
        x: Math.round(center.x - 100),
        y: Math.round(center.y - 70),
        color: 'yellow'
      });
      soundFx.playPop();
    });

    document.getElementById('dock-ai-sparkle')?.addEventListener('click', () => {
      this.aiModal.open();
    });

    // Project Switcher Trigger
    document.getElementById('btn-project-selector')?.addEventListener('click', () => {
      this.projectModal.open();
    });

    // AI Draft Generator Trigger
    document.getElementById('btn-ai-draft')?.addEventListener('click', () => {
      this.aiModal.open();
    });

    // AI Copilot Actions Dropdown
    const aiCopilotDropdown = document.getElementById('ai-copilot-dropdown');
    document.getElementById('btn-ai-copilot-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      aiCopilotDropdown?.classList.toggle('active');
    });

    // AI Copilot: Next step suggestion
    document.getElementById('ai-action-next')?.addEventListener('click', () => {
      aiCopilotDropdown?.classList.remove('active');
      const selectedId = this.state.getSelectedNode()?.id;
      if (this.aiEngine.suggestNextStep(selectedId)) {
        soundFx.playSuccess();
        const containerRect = this.canvas.container.getBoundingClientRect();
        this.state.fitToContent(containerRect.width, containerRect.height);
      }
    });

    // AI Copilot: Error handling injection
    document.getElementById('ai-action-error')?.addEventListener('click', () => {
      aiCopilotDropdown?.classList.remove('active');
      if (this.aiEngine.addErrorHandling()) {
        soundFx.playSuccess();
        const containerRect = this.canvas.container.getBoundingClientRect();
        this.state.fitToContent(containerRect.width, containerRect.height);
      }
    });

    // AI Copilot: Notification step injection
    document.getElementById('ai-action-notif')?.addEventListener('click', () => {
      aiCopilotDropdown?.classList.remove('active');
      if (this.aiEngine.addNotificationStep()) {
        soundFx.playSuccess();
        const containerRect = this.canvas.container.getBoundingClientRect();
        this.state.fitToContent(containerRect.width, containerRect.height);
      }
    });

    // AI Copilot: Audit workflow
    document.getElementById('ai-action-audit')?.addEventListener('click', () => {
      aiCopilotDropdown?.classList.remove('active');
      this.aiEngine.auditWorkflow();
      soundFx.playSuccess();
    });

    // Add Sticky Note Trigger
    document.getElementById('btn-add-note')?.addEventListener('click', () => {
      const containerRect = this.canvas.container.getBoundingClientRect();
      const worldCenter = this.canvas.screenToWorld(
        containerRect.left + containerRect.width / 2,
        containerRect.top + containerRect.height / 2
      );
      this.state.addNote({
        x: Math.round(worldCenter.x - 100),
        y: Math.round(worldCenter.y - 70),
        color: 'yellow'
      });
      soundFx.playPop();
    });

    // Auto Layout Trigger
    document.getElementById('btn-auto-layout')?.addEventListener('click', () => {
      AutoLayout.apply(this.state, 'horizontal');
      const containerRect = this.canvas.container.getBoundingClientRect();
      this.state.fitToContent(containerRect.width, containerRect.height);
      soundFx.playSnap();
    });

    // Run Simulation Trigger
    const runBtn = document.getElementById('btn-run-simulation');
    runBtn?.addEventListener('click', () => {
      if (this.simulator.isRunning) {
        this.simulator.stop();
        this.updateSimulationButton(false);
      } else {
        this.updateSimulationButton(true);
        this.simulator.run();
        soundFx.playPop();
      }
    });

    // Undo / Redo
    document.getElementById('btn-undo')?.addEventListener('click', () => {
      this.state.undo();
      soundFx.playSnap();
    });
    document.getElementById('btn-redo')?.addEventListener('click', () => {
      this.state.redo();
      soundFx.playSnap();
    });

    // Zoom buttons
    const container = this.canvas.container;
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      const rect = container.getBoundingClientRect();
      this.state.zoomBy(0.15, rect.width / 2, rect.height / 2);
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      const rect = container.getBoundingClientRect();
      this.state.zoomBy(-0.15, rect.width / 2, rect.height / 2);
    });

    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
      const rect = container.getBoundingClientRect();
      this.state.fitToContent(rect.width, rect.height);
    });

    // Export Dropdown
    const exportDropdown = document.getElementById('export-dropdown');
    document.getElementById('btn-export-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdown.classList.toggle('active');
    });

    window.addEventListener('click', () => {
      exportDropdown.classList.remove('active');
      aiCopilotDropdown?.classList.remove('active');
    });

    // Export Actions (High-res PNG with complete node rendering!)
    document.getElementById('export-png')?.addEventListener('click', () => {
      exportDropdown.classList.remove('active');
      Exporter.exportPNG(this.canvas.world, this.state, `${this.state.projectManager.getActiveProject().name}.png`);
      soundFx.playSuccess();
    });

    document.getElementById('export-svg')?.addEventListener('click', () => {
      exportDropdown.classList.remove('active');
      const svg = document.getElementById('connections-svg');
      Exporter.exportSVG(svg, `${this.state.projectManager.getActiveProject().name}.svg`);
      soundFx.playSuccess();
    });

    document.getElementById('export-json')?.addEventListener('click', () => {
      exportDropdown.classList.remove('active');
      const activeProj = this.state.projectManager.getActiveProject();
      Exporter.exportJSON(activeProj, `${activeProj.name}.json`);
      soundFx.playSuccess();
    });

    // Import JSON
    const fileInput = document.getElementById('json-file-input');
    document.getElementById('import-json-trigger')?.addEventListener('click', () => {
      exportDropdown.classList.remove('active');
      fileInput.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (parsed.nodes && Array.isArray(parsed.nodes)) {
            // Opens as a new project (the current board is left as it is), time axis included
            const name = parsed.name || file.name.replace(/\.json$/i, '') || '불러온 프로젝트';
            this.state.projectManager.createProject(name, 'blank');
            this.state.projectManager.updateActiveProjectData({
              nodes: parsed.nodes,
              edges: parsed.edges || [],
              notes: parsed.notes || [],
              viewport: parsed.viewport || undefined,
              timeline: parsed.timeline || null
            });
            this.state.loadActiveProject();
            soundFx.playSuccess();
            alert(`'${name}' 프로젝트로 불러왔어요.`);
          } else {
            alert('올바른 워크플로우 JSON 파일이 아닙니다.');
          }
        } catch (err) {
          alert('JSON 파싱 오류: ' + err.message);
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });

    // Sound toggle
    document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
      const enabled = soundFx.toggle();
      const soundIcon = document.getElementById('sound-icon');
      if (soundIcon) soundIcon.innerHTML = enabled ? Icons.volume : Icons.volumeX;
      if (enabled) soundFx.playPop();
    });

    // Help modal toggle
    const helpModal = document.getElementById('help-modal');
    document.getElementById('btn-help-toggle')?.addEventListener('click', () => {
      helpModal?.classList.add('active');
    });
    document.getElementById('btn-close-help-modal')?.addEventListener('click', () => {
      helpModal?.classList.remove('active');
    });
    helpModal?.addEventListener('mousedown', (e) => {
      if (e.target === helpModal) helpModal.classList.remove('active');
    });

    // Theme Dropdown Toggle
    const themeDropdown = document.getElementById('theme-dropdown');
    document.getElementById('btn-theme-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      themeDropdown?.classList.toggle('active');
    });

    // Close theme dropdown when clicking outside
    window.addEventListener('click', () => {
      themeDropdown?.classList.remove('active');
    });

    // Theme Selection
    document.querySelectorAll('#theme-menu .dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const theme = e.currentTarget.getAttribute('data-theme-value');
        if (theme) {
          document.documentElement.setAttribute('data-theme', theme);
          document.documentElement.style.removeProperty('--bg-canvas');
          
          let icon = Icons.sun; 
          if (theme === 'dark' || theme === 'black') {
            icon = Icons.moon; 
          }
          
          const themeIcon = document.getElementById('theme-icon');
          if (themeIcon) {
            themeIcon.innerHTML = icon;
          }
          
          themeDropdown?.classList.remove('active');
          if (window.soundFx) window.soundFx.playPop();
        }
      });
    });

    // Simulator drawer close & clear logs
    document.getElementById('btn-close-simulator')?.addEventListener('click', () => {
      document.getElementById('simulator-drawer')?.classList.remove('active');
    });

    document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
      this.simulator.clearLogs();
    });

    // Global keyboard shortcuts (Cmd/Ctrl + Z, Y, C, X, V, D, Delete, ?, Backspace)
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        helpModal?.classList.toggle('active');
      } else if (cmdKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.state.redo();
        } else {
          this.state.undo();
        }
        soundFx.playSnap();
      } else if (cmdKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.state.redo();
        soundFx.playSnap();
      } else if (cmdKey && ['c', 'x'].includes(e.key.toLowerCase()) && this.state.selectedNodeIds.size > 0) {
        // Copy / cut nodes (kept in localStorage so it also works across projects)
        if (window.getSelection()?.toString()) return; // let normal text copy through
        e.preventDefault();
        const clip = this.state.copySelection();
        this.clipboard = clip;
        this.pasteCount = 0;
        try { localStorage.setItem('flowcraft_clipboard', JSON.stringify(clip)); } catch (err) { /* storage full */ }
        if (e.key.toLowerCase() === 'x') {
          this.state.removeNodes(Array.from(this.state.selectedNodeIds));
          soundFx.playDelete();
        } else {
          soundFx.playSnap();
        }
      } else if (cmdKey && e.key.toLowerCase() === 'v') {
        let clip = null;
        try { clip = JSON.parse(localStorage.getItem('flowcraft_clipboard') || 'null'); } catch (err) { /* bad data */ }
        clip = clip || this.clipboard;
        if (!clip || !clip.nodes || !clip.nodes.length) return;
        e.preventDefault();
        // Under the mouse when it is over the canvas, otherwise stepped offsets from the original
        const at = this.canvas.lastPointerWorld && this.canvas.pointerInside ? this.canvas.lastPointerWorld : null;
        this.pasteCount = (this.pasteCount || 0) + 1;
        this.state.pasteNodes(clip, at, 40 * this.pasteCount);
        soundFx.playPop();
      } else if (cmdKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        this.state.duplicateSelectedNodes();
        soundFx.playPop();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.state.selectedNodeIds.size > 0) {
          e.preventDefault();
          this.state.removeNodes(Array.from(this.state.selectedNodeIds));
          soundFx.playDelete();
        } else if (this.state.selectedEdgeId) {
          e.preventDefault();
          this.state.removeEdge(this.state.selectedEdgeId);
          soundFx.playDelete();
        } else if (this.state.selectedNoteId) {
          e.preventDefault();
          this.state.removeNote(this.state.selectedNoteId);
          soundFx.playDelete();
        }
      }
    });
  }

  updateSimulationButton(isRunning) {
    const btn = document.getElementById('btn-run-simulation');
    const icon = document.getElementById('run-btn-icon');
    const text = document.getElementById('run-btn-text');
    if (!btn || !icon || !text) return;

    if (isRunning) {
      btn.classList.add('running');
      icon.innerHTML = Icons.stop;
      text.textContent = '실행 중지';
    } else {
      btn.classList.remove('running');
      icon.innerHTML = Icons.play;
      text.textContent = '실행 시뮬레이션';
    }
  }

  updateZoomLabel() {
    const zoomText = document.getElementById('zoom-level-label');
    if (zoomText) {
      zoomText.textContent = `${Math.round(this.state.viewport.zoom * 100)}%`;
    }
  }

  updateUndoRedoButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');

    if (undoBtn) undoBtn.style.opacity = this.state.canUndo() ? '1' : '0.4';
    if (redoBtn) redoBtn.style.opacity = this.state.canRedo() ? '1' : '0.4';
  }
}
