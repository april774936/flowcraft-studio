// advanced.js: "고급 기능" toggle. Off by default: the automation-specific UI (AI copilot,
// run simulation, webhook/API palette items) is hidden so the app stays a clean
// roadmap / study-flow editor. Stored per browser.
const KEY = 'flowcraft_advanced_ui';

export function isAdvanced() {
  try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
}

export function setAdvanced(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
  applyAdvanced();
  window.dispatchEvent(new CustomEvent('advanced:change', { detail: on }));
}

export function applyAdvanced() {
  document.body.classList.toggle('simple-mode', !isAdvanced());
}
