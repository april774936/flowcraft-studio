// AIModal.js: AI Workflow Draft Generator modal with presets, streaming feedback, and auto-layout
import { AIPresets } from '../ai/AIPresets.js';
import { Icons } from '../utils/icons.js';
import { GEMINI_KEY_STORE } from '../ai/AIEngine.js';

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* private mode */ } }
};

export class AIModal {
  constructor(state, aiEngine, modalOverlay, canvas) {
    this.state = state;
    this.aiEngine = aiEngine;
    this.overlay = modalOverlay;
    this.canvas = canvas;

    this.promptInput = document.getElementById('ai-prompt-input');
    this.chipsList = document.getElementById('ai-chips-list');
    this.formView = document.getElementById('ai-modal-form-view');
    this.generatingView = document.getElementById('ai-generating-view');
    this.progressStatus = document.getElementById('ai-progress-status');
    this.progressSubstatus = document.getElementById('ai-progress-substatus');

    this.optClear = document.getElementById('ai-opt-clear');

    this.initEvents();
    this.renderPresets();
  }

  // Key row: only when the server has no AI key (then the browser calls Gemini itself)
  async refreshKeyRow() {
    const row = document.getElementById('ai-key-row');
    if (!row) return;
    if (this.serverReady === undefined) {
      try {
        const r = await fetch('/api/draft');
        const d = r.ok ? await r.json() : null;
        this.serverReady = !!(d && d.ready);
      } catch (e) { this.serverReady = false; }
    }
    row.hidden = this.serverReady;
    const saved = store.get(GEMINI_KEY_STORE);
    document.getElementById('ai-key-status').textContent = saved ? '저장됨 ✓' : '없으면 기본 규칙으로 그려요';
    document.getElementById('ai-key-input').value = '';
    document.getElementById('ai-key-input').placeholder = saved ? '저장됨 — 바꾸려면 새 키를 붙여넣기' : '키를 붙여넣으면 이 브라우저에만 저장돼요';
  }

  open() {
    this.refreshKeyRow();
    this.formView.style.display = 'flex';
    this.generatingView.style.display = 'none';
    this.overlay.classList.add('active');
    setTimeout(() => this.promptInput.focus(), 100);
  }

  close() {
    this.overlay.classList.remove('active');
  }

  renderPresets() {
    this.chipsList.innerHTML = '';
    AIPresets.forEach(preset => {
      const chip = document.createElement('div');
      chip.className = 'ai-chip';
      chip.innerHTML = `<span>${preset.title}</span>`;

      chip.addEventListener('click', () => {
        this.promptInput.value = preset.prompt;
        this.promptInput.focus();
      });

      this.chipsList.appendChild(chip);
    });
  }

  initEvents() {
    document.getElementById('btn-close-ai-modal')?.addEventListener('click', () => this.close());
    document.getElementById('btn-cancel-ai')?.addEventListener('click', () => this.close());

    this.overlay?.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close();
    });

    document.getElementById('ai-key-save')?.addEventListener('click', () => {
      const v = document.getElementById('ai-key-input').value.trim();
      if (!v) return;
      store.set(GEMINI_KEY_STORE, v);
      this.refreshKeyRow();
    });

    document.getElementById('btn-generate-ai-draft')?.addEventListener('click', () => {
      this.generate();
    });
  }

  async generate() {
    const promptText = this.promptInput.value.trim();
    if (!promptText) {
      alert('만들 흐름을 적어주세요. 예: 대학원 진학 → 졸업 → 취업 / 박사 / 연구원');
      this.promptInput.focus();
      return;
    }
    if (this.busy) return;
    this.busy = true;

    this.formView.style.display = 'none';
    this.generatingView.style.display = 'flex';
    this.progressStatus.textContent = 'AI가 흐름을 설계하고 있어요…';
    this.progressSubstatus.textContent = '단계 · 분기 · 체크리스트 · 기간을 정리하는 중 (보통 20~40초)';

    try {
      const result = await this.aiEngine.generateDraft(promptText, {
        clear: this.optClear ? this.optClear.checked : true
      });
      // Fit once the new nodes are rendered (their real sizes count)
      requestAnimationFrame(() => {
        const mainRect = this.canvas.container.getBoundingClientRect();
        this.state.fitToContent(mainRect.width, mainRect.height);
      });
      const who = result.source === 'claude' ? 'Claude AI로' : result.source === 'gemini' ? 'Gemini AI로'
        : result.note ? '기본 규칙으로' : '기본 규칙으로(AI 키 없음)';
      this.showToast(`✨ ${who} ${result.count}개 단계를 만들었어요${result.note ? ' · ' + result.note : ''}`);
      this.close();
    } catch (err) {
      alert(err.message);
      this.formView.style.display = 'flex';
      this.generatingView.style.display = 'none';
    } finally {
      this.busy = false;
    }
  }

  showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${Icons.sparkles}</span> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
