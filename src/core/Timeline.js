// Timeline.js: the time axis of a timeline board.
// { unit, start, originX, showOnNodes, cols: [{ id, label, w }] }
// Columns are laid out left to right from originX (world px); each has its own width,
// so the axis can be stretched unevenly. Nodes are placed freely on top of it.

export const UNITS = [
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
  { key: 'quarter', label: '분기' },
  { key: 'year', label: '년' },
  { key: 'custom', label: '직접 입력' }
];

export const DEFAULT_COL_W = 240;
export const MIN_COL_W = 60;

const pad = (n) => String(n).padStart(2, '0');

// Default start value for a unit, from today
export function defaultStart(unit, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth() + 1;
  if (unit === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday of this week
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (unit === 'month') return `${y}-${pad(m)}`;
  if (unit === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  if (unit === 'year') return `${y}`;
  return '';
}

// Label of column i for a unit starting at `start`
export function labelFor(unit, start, i) {
  if (unit === 'week') {
    const [y, m, d] = (start || defaultStart('week')).split('-').map(Number);
    const t = new Date(y || 2026, (m || 1) - 1, (d || 1) + i * 7);
    return `${t.getMonth() + 1}/${t.getDate()}주`;
  }
  if (unit === 'month') {
    const [y, m] = (start || defaultStart('month')).split('-').map(Number);
    const idx = (m || 1) - 1 + i;
    return `${(y || 2026) + Math.floor(idx / 12)}.${pad((idx % 12) + 1)}`;
  }
  if (unit === 'quarter') {
    const mt = /^(\d{4})\s*-?\s*Q([1-4])$/i.exec(start || defaultStart('quarter')) || [0, 2026, 1];
    const idx = Number(mt[2]) - 1 + i;
    return `${Number(mt[1]) + Math.floor(idx / 4)} Q${(idx % 4) + 1}`;
  }
  if (unit === 'year') return String((Number(start) || new Date().getFullYear()) + i);
  return `${i + 1}단계`;
}

export const newColId = () => 'col_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function buildColumns(unit, start, count, w = DEFAULT_COL_W) {
  return Array.from({ length: count }, (_, i) => ({ id: newColId(), label: labelFor(unit, start, i), w }));
}

// A fresh axis: 12 months from this month, starting just left of the existing nodes
export function defaultTimeline(nodes = []) {
  const minX = nodes.length ? Math.min(...nodes.map(n => n.x)) : 100;
  const unit = 'month';
  const start = defaultStart(unit);
  return { unit, start, originX: Math.round(minX - 60), showOnNodes: false, cols: buildColumns(unit, start, 12) };
}
