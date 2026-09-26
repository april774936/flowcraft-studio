// AIModal.js: AI Workflow Draft Generator modal with presets, streaming feedback, and auto-layout
import { AIPresets } from '../ai/AIPresets.js';
import { Icons } from '../utils/icons.js';

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

    this.optAutolayout = document.getElementById('ai-opt-autolayout');
    this.optClear = document.getElementById('ai-opt-clear');

    this.initEvents();
    this.renderPresets();
  }

  open() {
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

    document.getElementById('btn-generate-ai-draft')?.addEventListener('click', () => {
      this.generate();
    });
  }

  async generate() {
    const promptText = this.promptInput.value.trim();
    if (!promptText) {
      alert('생성할 워크플로우에 대한 설명이나 프롬프트를 입력해주세요.');
      this.promptInput.focus();
      return;
    }

    // Switch to generating progress view
    this.formView.style.display = 'none';
    this.generatingView.style.display = 'flex';

    try {
      // Progress step 1
      this.progressStatus.textContent = '비즈니스 흐름 및 조건 분기 분석 중...';
      this.progressSubstatus.textContent = '문맥에서 트리거, 태스크, 분기 조건을 추출하고 있습니다';
      await this.sleep(400);

      // Progress step 2
      this.progressStatus.textContent = '노드 및 스마트 연결선 구조 생성 중...';
      this.progressSubstatus.textContent = '각 단계별 최적의 아이콘과 포트를 매핑하고 있습니다';
      await this.sleep(450);

      // Progress step 3: Execution
      this.progressStatus.textContent = '위계적 자동 정렬 및 캔버스 배치 중...';
      this.progressSubstatus.textContent = '노드가 겹치지 않도록 깔끔하게 배치합니다';

      const options = {
        clear: this.optClear ? this.optClear.checked : true,
        autolayout: this.optAutolayout ? this.optAutolayout.checked : true
      };

      await this.aiEngine.generateDraft(promptText, options);
      await this.sleep(300);

      // Fit view
      const mainRect = this.canvas.container.getBoundingClientRect();
      this.state.fitToContent(mainRect.width, mainRect.height);

      this.showToast('✨ AI 워크플로우 초안이 성공적으로 생성되었습니다!');
      this.close();
    } catch (err) {
      alert('AI 생성 중 오류가 발생했습니다: ' + err.message);
      this.formView.style.display = 'flex';
      this.generatingView.style.display = 'none';
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
