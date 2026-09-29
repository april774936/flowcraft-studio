// Branches.js: helpers for N-way decision nodes and checklist items
// A decision node with `branches: [{ id, label }]` gets one output port per branch,
// addressed as "branch:<id>" in edge.fromPort. Legacy decision nodes (no `branches`)
// keep the old Yes (right) / No (bottom) ports.

export const BRANCH_PREFIX = 'branch:';

export const isBranchPort = (port) => typeof port === 'string' && port.startsWith(BRANCH_PREFIX);
export const branchIdOf = (port) => port.slice(BRANCH_PREFIX.length);
export const branchPort = (id) => BRANCH_PREFIX + id;

export const newItemId = (prefix) => prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Branch list for a legacy Yes/No node, keeping the labels its edges already carry
export function legacyBranchesFor(node, edges) {
  const labelOf = (port, fallback) => {
    const e = edges.find(x => x.from === node.id && x.fromPort === port && (x.label || '').trim());
    return e ? e.label.trim() : fallback;
  };
  return [
    { id: 'yes', label: labelOf('right', 'Yes') },
    { id: 'no', label: labelOf('bottom', 'No') }
  ];
}

// Point on the right half of the diamond outline (top vertex → right vertex → bottom
// vertex) for branch `index` of `count`, relative to the node box.
export function branchPortPoint(index, count, w, h) {
  const t = (index + 1) / (count + 1);
  if (t <= 0.5) {
    const s = t * 2;
    return { x: w / 2 + (s * w) / 2, y: (s * h) / 2 };
  }
  const s = (t - 0.5) * 2;
  return { x: w - (s * w) / 2, y: h / 2 + (s * h) / 2 };
}

// Accept strings or {text, done} objects; always return fresh objects with ids
export function normalizeChecklist(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => (typeof c === 'string' ? { text: c, done: false } : { text: c.text || '', done: !!c.done }))
    .filter((c) => c.text.trim())
    .map((c) => ({ id: newItemId('ck'), ...c }));
}

export function normalizeBranches(list) {
  if (!Array.isArray(list)) return undefined;
  return list
    .map((b) => (typeof b === 'string' ? { label: b } : b))
    .filter((b) => b && (b.label || '').trim())
    .map((b) => ({ id: b.id || newItemId('br'), label: b.label.trim() }));
}
