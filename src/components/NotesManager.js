// NotesManager.js: Interactive canvas sticky notes with resize, color palette, and inline editing
import { Icons } from '../utils/icons.js';

export class NotesManager {
  constructor(state, notesLayer, canvas) {
    this.state = state;
    this.layer = notesLayer;
    this.canvas = canvas;

    this.dragState = null;
    this.resizeState = null;

    this.initWindowEvents();
    this.render();

    this.state.on('canvas:change', () => this.render());
  }

  render() {
    this.layer.innerHTML = '';

    this.state.notes.forEach(note => {
      const el = document.createElement('div');
      const isSelected = this.state.selectedNoteId === note.id;
      el.className = `canvas-note color-${note.color || 'yellow'} ${isSelected ? 'selected' : ''}`;
      el.dataset.noteId = note.id;
      el.style.left = `${note.x}px`;
      el.style.top = `${note.y}px`;
      el.style.width = `${note.width || 200}px`;
      el.style.height = `${note.height || 140}px`;

      el.innerHTML = `
        <div class="note-header">
          <div class="note-header-left">
            <span>${Icons.stickyNote}</span>
            <span>메모</span>
          </div>
          <div class="note-color-picker">
            <div class="color-dot yellow" data-color="yellow" title="노란색"></div>
            <div class="color-dot green" data-color="green" title="초록색"></div>
            <div class="color-dot blue" data-color="blue" title="파란색"></div>
            <div class="color-dot pink" data-color="pink" title="분홍색"></div>
            <div class="color-dot purple" data-color="purple" title="보라색"></div>
          </div>
          <button class="note-delete-btn" title="메모 삭제">${Icons.close}</button>
        </div>
        <div class="note-body" contenteditable="true" placeholder="메모할 내용을 자유롭게 입력하세요...">${this.escapeHtml(note.text || '')}</div>
        <div class="note-resize-handle"></div>
      `;

      // Event: Note Selection & Drag start
      el.addEventListener('mousedown', (e) => {
        if (e.target.closest('.color-dot') || e.target.closest('.note-delete-btn') || e.target.closest('.note-resize-handle')) {
          return;
        }

        e.stopPropagation();
        this.state.selectNote(note.id);

        if (e.target.classList.contains('note-body')) {
          return; // Let user select text
        }

        const worldPos = this.canvas.screenToWorld(e.clientX, e.clientY);
        this.dragState = {
          noteId: note.id,
          offsetX: worldPos.x - note.x,
          offsetY: worldPos.y - note.y
        };
      });

      // Event: Color selection
      el.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          const newColor = dot.dataset.color;
          this.state.updateNote(note.id, { color: newColor });
        });
      });

      // Event: Delete note
      el.querySelector('.note-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.state.removeNote(note.id);
      });

      // Event: Text editing (auto-save)
      const bodyEl = el.querySelector('.note-body');
      bodyEl.addEventListener('blur', () => {
        const text = bodyEl.innerText;
        if (text !== note.text) {
          this.state.updateNote(note.id, { text });
        }
      });

      // Event: Resize handle
      const resizeHandle = el.querySelector('.note-resize-handle');
      resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.state.selectNote(note.id);
        this.resizeState = {
          noteId: note.id,
          startX: e.clientX,
          startY: e.clientY,
          startWidth: note.width || 200,
          startHeight: note.height || 140
        };
      });

      this.layer.appendChild(el);
    });
  }

  initWindowEvents() {
    window.addEventListener('mousemove', (e) => {
      if (this.dragState) {
        const worldPos = this.canvas.screenToWorld(e.clientX, e.clientY);
        const newX = Math.round(worldPos.x - this.dragState.offsetX);
        const newY = Math.round(worldPos.y - this.dragState.offsetY);
        this.state.updateNote(this.dragState.noteId, { x: newX, y: newY });
      } else if (this.resizeState) {
        const zoom = this.state.viewport.zoom;
        const dx = (e.clientX - this.resizeState.startX) / zoom;
        const dy = (e.clientY - this.resizeState.startY) / zoom;
        const newWidth = Math.max(160, Math.round(this.resizeState.startWidth + dx));
        const newHeight = Math.max(100, Math.round(this.resizeState.startHeight + dy));
        this.state.updateNote(this.resizeState.noteId, { width: newWidth, height: newHeight });
      }
    });

    window.addEventListener('mouseup', () => {
      this.dragState = null;
      this.resizeState = null;
    });
  }

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
