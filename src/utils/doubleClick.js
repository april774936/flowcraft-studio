// doubleClick.js: double-click detection keyed by item id.
// Nodes and edges are re-rendered on selection, so the element under the cursor is
// replaced between the two clicks and the browser's native dblclick never fires.
const WINDOW_MS = 350;
let last = { key: null, t: 0 };

export function isSecondClick(key) {
  const now = Date.now();
  const hit = last.key === key && now - last.t < WINDOW_MS;
  last = hit ? { key: null, t: 0 } : { key, t: now };
  return hit;
}
