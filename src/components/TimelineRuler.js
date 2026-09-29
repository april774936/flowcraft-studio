// TimelineRuler.js: time axis of a timeline board.
// - Header (screen space, pinned to the top of the canvas): one cell per column, follows
//   pan/zoom horizontally. Drag a cell's right edge to change its width, the first cell's
//   left edge to move where the axis starts. Double-click a label to rename it.
// - Column bands + boundary lines are drawn in world space behind the nodes.
// Nodes stay where they are when columns are resized (free placement).
import { UNITS, MIN_COL_W, DEFAULT_COL_W, labelFor, buildColumns, newColId, defaultStart } from '../core/Timeline.js';

const START_HINT = { week: '2026-10-05 (시작 주 월요일)', month: '2026-10', quarter: '2026-Q4', year: '2026', custom: '' };

export class TimelineRuler {
  constructor(state, linesEl, worldElement, container) {
    this.state = state;
    this.lines = linesEl;       // world layer (inside #canvas-world)
    this.world = worldElement;
    this.container = container; // #canvas-container
    this.drag = null;

    this.header = document.createElement('div');
    this.header.className = 'timeline-header';
    this.header.innerHTML = `
      <div class="tl-track"></div>
      <button class="tl-settings-btn" title="시간축 설정">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
      <div class="tl-popover" hidden></div>`;
    this.container.appendChild(this.header);
    this.track = this.header.querySelector('.tl-track');
    this.track.addEventListener('scroll', () => { this.track.scrollLeft = 0; });
    this.popover = this.header.querySelector('.tl-popover');

    // The header is its own UI: no marquee / node deselect behind it (right/middle drag still pans)
    this.header.addEventListener('mousedown', (e) => { if (e.button === 0) e.stopPropagation(); });
    this.header.addEventListener('dblclick', (e) => e.stopPropagation());
    this.header.querySelector('.tl-settings-btn').addEventListener('click', () => this.togglePopover());

    window.addEventListener('mousemove', (e) => this.onDragMove(e));
    window.addEventListener('mouseup', () => this.onDragEnd());

    this.state.on('timeline:change', () => this.render());
    this.state.on('viewport:change', () => this.position());
    this.render();
  }

  get tl() { return this.state.timeline; }

  render() {
    const tl = this.tl;
    this.container.classList.toggle('timeline-on', !!tl);
    this.header.style.display = tl ? '' : 'none';
    this.lines.style.display = tl ? '' : 'none';
    if (!tl) { this.closePopover(); return; }

    // World layer: alternating bands + boundary lines
    let x = tl.originX;
    this.lines.innerHTML = tl.cols.map((c, i) => {
      const html = `<div class="tl-band ${i % 2 ? 'odd' : ''}" style="left:${x}px;width:${c.w}px"></div><div class="tl-line" style="left:${x}px"></div>`;
      x += c.w;
      return html;
    }).join('') + `<div class="tl-line" style="left:${x}px"></div>`;

    // Header cells (widths/positions are set in position())
    this.track.innerHTML = tl.cols.map((c, i) => `
      <div class="tl-cell" data-idx="${i}">
        ${i === 0 ? '<div class="tl-handle tl-handle-start" data-origin="1" title="드래그: 시작 위치 조절"></div>' : ''}
        <span class="tl-label" title="더블클릭: 이름 바꾸기">${this.escape(c.label)}</span>
        <button class="tl-del" data-del="${i}" title="이 칸 삭제">×</button>
        <div class="tl-handle" data-resize="${i}" title="드래그: 칸 폭 조절"></div>
      </div>`).join('') + `<button class="tl-add" title="칸 추가">＋</button>`;

    this.track.querySelectorAll('[data-resize]').forEach(h => h.addEventListener('mousedown', (e) => this.startDrag(e, 'w', Number(h.dataset.resize))));
    this.track.querySelector('[data-origin]')?.addEventListener('mousedown', (e) => this.startDrag(e, 'origin', 0));
    this.track.querySelectorAll('.tl-label').forEach(l => l.addEventListener('dblclick', () => this.editLabel(Number(l.parentNode.dataset.idx))));
    this.track.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => this.removeCol(Number(b.dataset.del))));
    this.track.querySelector('.tl-add').addEventListener('click', () => this.addCol());
    this.track.querySelectorAll('.tl-del, .tl-add').forEach(b => b.addEventListener('mousedown', (e) => e.stopPropagation()));

    this.position();
    if (!this.popover.hidden) this.renderPopover();
  }

  // Place header cells for the current pan/zoom
  position() {
    const tl = this.tl;
    if (!tl) return;
    const { x: vx, zoom } = this.state.viewport;
    this.track.scrollLeft = 0; // focusing a label input can scroll the clipped strip
    let left = tl.originX;
    const cells = this.track.querySelectorAll('.tl-cell');
    tl.cols.forEach((c, i) => {
      const el = cells[i];
      if (!el) return;
      el.style.left = `${vx + left * zoom}px`;
      el.style.width = `${c.w * zoom}px`;
      el.classList.toggle('narrow', c.w * zoom < 70);
      left += c.w;
    });
    const add = this.track.querySelector('.tl-add');
    if (add) add.style.left = `${vx + left * zoom + 6}px`;
  }

  // ---------- width / start dragging ----------
  startDrag(e, kind, idx) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const c = this.tl.cols[idx];
    this.drag = { kind, idx, x: e.clientX, w: c.w, origin: this.tl.originX };
    this.state.beginGesture();
    document.body.classList.add('tl-resizing');
  }

  onDragMove(e) {
    const d = this.drag;
    if (!d || !this.tl) return;
    const dx = (e.clientX - d.x) / this.state.viewport.zoom;
    const col = this.tl.cols[d.idx];
    if (d.kind === 'w') {
      col.w = Math.round(Math.max(MIN_COL_W, d.w + dx));
    } else {
      // Move the start edge; the first column's right edge (and everything after it) stays put
      const move = Math.min(dx, d.w - MIN_COL_W);
      this.tl.originX = Math.round(d.origin + move);
      col.w = Math.round(d.w - move);
    }
    this.render();
  }

  onDragEnd() {
    if (!this.drag) return;
    this.drag = null;
    document.body.classList.remove('tl-resizing');
    this.state.endGesture();
    this.state.emit('canvas:change'); // node chips follow the new column ranges
  }

  // ---------- column edits ----------
  update(fn) {
    const next = JSON.parse(JSON.stringify(this.tl));
    fn(next);
    this.state.setTimeline(next);
  }

  editLabel(idx) {
    const cell = this.track.querySelector(`.tl-cell[data-idx="${idx}"]`);
    const label = cell && cell.querySelector('.tl-label');
    if (!label) return;
    const input = document.createElement('input');
    input.className = 'tl-label-input';
    input.value = this.tl.cols[idx].label;
    input.maxLength = 40;
    label.replaceWith(input);
    input.focus({ preventScroll: true });
    this.track.scrollLeft = 0;
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (commit && v && v !== this.tl.cols[idx].label) this.update(t => { t.cols[idx].label = v; });
      else this.render();
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.isComposing) return;
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      ev.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
  }

  addCol() {
    this.update(t => {
      const last = t.cols[t.cols.length - 1];
      t.cols.push({ id: newColId(), label: labelFor(t.unit, t.start, t.cols.length), w: last ? last.w : DEFAULT_COL_W });
    });
  }

  removeCol(idx) {
    if (this.tl.cols.length <= 1) return;
    this.update(t => { t.cols.splice(idx, 1); });
  }

  // ---------- settings popover ----------
  togglePopover() {
    if (this.popover.hidden) { this.popover.hidden = false; this.renderPopover(); }
    else this.closePopover();
  }

  closePopover() { this.popover.hidden = true; }

  renderPopover() {
    const tl = this.tl;
    if (!tl) return;
    this.popover.innerHTML = `
      <div class="tl-pop-title">시간축 설정</div>
      <label class="tl-pop-row"><span>단위</span>
        <select id="tl-unit">${UNITS.map(u => `<option value="${u.key}" ${u.key === tl.unit ? 'selected' : ''}>${u.label}</option>`).join('')}</select>
      </label>
      <label class="tl-pop-row" ${tl.unit === 'custom' ? 'hidden' : ''}><span>시작</span>
        <input id="tl-start" value="${this.escape(tl.start || '')}" placeholder="${START_HINT[tl.unit] || ''}" />
      </label>
      <label class="tl-pop-row"><span>칸 수</span>
        <input id="tl-count" type="number" min="1" max="120" value="${tl.cols.length}" />
      </label>
      <button class="btn-primary tl-pop-btn" id="tl-apply">칸 이름 다시 만들기</button>
      <div class="tl-pop-hint">칸 폭은 그대로 두고 이름·개수만 바꿉니다. 이름은 머리글 더블클릭으로 하나씩 바꿀 수도 있어요.</div>
      <button class="btn-secondary tl-pop-btn" id="tl-even">칸 폭 똑같이</button>
      <label class="tl-pop-check"><input type="checkbox" id="tl-show" ${tl.showOnNodes ? 'checked' : ''} /> 노드에 칸 이름 표시</label>
      <button class="btn-secondary tl-pop-btn danger" id="tl-off">시간축 끄기</button>`;
    const $ = (id) => this.popover.querySelector(id);
    $('#tl-unit').addEventListener('change', (e) => {
      const unit = e.target.value;
      const start = unit === tl.unit ? tl.start : defaultStart(unit);
      $('#tl-start').value = start;
      $('#tl-start').placeholder = START_HINT[unit] || '';
      $('#tl-start').closest('.tl-pop-row').hidden = unit === 'custom';
    });
    $('#tl-apply').addEventListener('click', () => {
      const unit = $('#tl-unit').value;
      const start = $('#tl-start').value.trim() || defaultStart(unit);
      const count = Math.max(1, Math.min(120, Number($('#tl-count').value) || tl.cols.length));
      this.update(t => {
        const fresh = buildColumns(unit, start, count);
        t.cols = fresh.map((c, i) => (t.cols[i] ? { ...t.cols[i], label: c.label } : { ...c, w: t.cols[t.cols.length - 1]?.w || DEFAULT_COL_W }));
        t.unit = unit;
        t.start = start;
      });
    });
    $('#tl-even').addEventListener('click', () => {
      const avg = Math.round(tl.cols.reduce((a, c) => a + c.w, 0) / tl.cols.length);
      this.update(t => { t.cols.forEach(c => { c.w = avg; }); });
    });
    $('#tl-show').addEventListener('change', (e) => this.update(t => { t.showOnNodes = e.target.checked; }));
    $('#tl-off').addEventListener('click', () => { this.closePopover(); this.state.setTimeline(null); });
    this.popover.querySelectorAll('input, select').forEach(el => el.addEventListener('keydown', (e) => e.stopPropagation()));
  }

  escape(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
}
