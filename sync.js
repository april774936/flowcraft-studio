// FlowCraft Studio — 개인용 기기 간 동기화 (Supabase)
// 프로젝트(플로우차트) 데이터를 브라우저 localStorage와 Supabase 사이에 동기화합니다.
// 로그인 없이, 모든 기기에 똑같은 "동기화 코드"를 넣는 방식입니다 (개인용, 비민감 데이터 전제).
(function () {
  const SUPABASE_URL = 'https://djzzjezjlemvxzjiusly.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_axIbnWAf3nLWvTYjEyXI6A_omvOu1nT';

  const TABLE = 'flowcraft_sync';
  const CODE_KEY = 'FLOWCRAFT_SYNC_CODE';
  const LASTSYNC_KEY = 'FLOWCRAFT_LAST_SYNC_AT';
  const DEBOUNCE_MS = 2500;

  const DATA_KEYS = ['flowcraft_projects_v2', 'flowcraft_active_project_id'];

  const configured = !SUPABASE_URL.includes('YOUR-PROJECT');

  function getSyncCode() {
    return localStorage.getItem(CODE_KEY) || '';
  }
  function setSyncCode(code) {
    localStorage.setItem(CODE_KEY, code);
  }

  function collectLocalData() {
    const out = {};
    DATA_KEYS.forEach((k) => {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    });
    return out;
  }

  function applyRemoteData(data) {
    if (!data) return;
    Object.keys(data).forEach((k) => {
      if (DATA_KEYS.includes(k) && typeof data[k] === 'string') {
        localStorage.setItem(k, data[k]);
      }
    });
  }

  async function pull(code) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(code)}&select=data,updated_at`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    if (!res.ok) throw new Error('pull failed: ' + res.status);
    const rows = await res.json();
    return rows[0] || null;
  }

  async function push(code) {
    const payload = {
      id: code,
      data: collectLocalData(),
      updated_at: new Date().toISOString()
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('push failed: ' + res.status);
    localStorage.setItem(LASTSYNC_KEY, payload.updated_at);
    updateBadge('synced');
  }

  let pushTimer = null;
  function schedulePush() {
    if (!configured) return;
    const code = getSyncCode();
    if (!code) return;
    clearTimeout(pushTimer);
    updateBadge('pending');
    pushTimer = setTimeout(() => {
      push(code).catch((err) => {
        console.warn('[FlowCraft sync] push error', err);
        updateBadge('error');
      });
    }, DEBOUNCE_MS);
  }

  let reloadedOnce = false;
  async function initialPull() {
    if (!configured) {
      updateBadge('unconfigured');
      return;
    }
    const code = getSyncCode();
    if (!code) {
      updateBadge('nocode');
      return;
    }
    updateBadge('syncing');
    try {
      const row = await pull(code);
      if (row && row.updated_at) {
        const localAt = localStorage.getItem(LASTSYNC_KEY);
        if (!localAt || new Date(row.updated_at) > new Date(localAt)) {
          applyRemoteData(row.data);
          localStorage.setItem(LASTSYNC_KEY, row.updated_at);
          if (!reloadedOnce) {
            reloadedOnce = true;
            location.reload();
            return;
          }
        }
      }
      updateBadge('synced');
    } catch (err) {
      console.warn('[FlowCraft sync] pull error', err);
      updateBadge('error');
    }
  }

  // --- 화면 우측 하단 작은 동기화 배지 ---
  let badgeEl = null;
  function ensureBadge() {
    if (badgeEl) return badgeEl;
    badgeEl = document.createElement('div');
    badgeEl.id = 'flowcraftSyncBadge';
    badgeEl.style.cssText =
      'position:fixed;bottom:14px;right:14px;z-index:99999;background:#1e293b;color:#e2e8f0;' +
      'font-size:12px;padding:6px 10px;border-radius:999px;cursor:pointer;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.3);font-family:system-ui,-apple-system,sans-serif;' +
      'opacity:.85;transition:opacity .15s;';
    badgeEl.addEventListener('mouseenter', () => (badgeEl.style.opacity = '1'));
    badgeEl.addEventListener('mouseleave', () => (badgeEl.style.opacity = '.85'));
    badgeEl.addEventListener('click', openSetupPrompt);
    document.body.appendChild(badgeEl);
    return badgeEl;
  }

  function updateBadge(state) {
    const el = ensureBadge();
    const code = getSyncCode();
    const map = {
      unconfigured: '☁️ 동기화 미설정',
      nocode: '☁️ 동기화 꺼짐 · 클릭해서 설정',
      syncing: '☁️ 확인 중...',
      pending: '☁️ 저장 대기...',
      synced: `☁️ 동기화됨 · ${code}`,
      error: '⚠️ 동기화 오류 · 클릭'
    };
    el.textContent = map[state] || map.nocode;
  }

  function openSetupPrompt() {
    const current = getSyncCode();
    const input = prompt(
      '기기 간 동기화 코드를 입력하세요.\n' +
        '처음이면 아무 문자열이나 새로 정해서 사용하는 모든 기기(PC/폰/태블릿)에 똑같이 입력하세요.\n' +
        '예: minjoon-flowcraft-2026',
      current || ''
    );
    if (input === null) return;
    const code = input.trim();
    if (!code) return;
    setSyncCode(code);
    reloadedOnce = false;
    initialPull();
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureBadge();
    initialPull();
  });

  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    origSetItem(key, value);
    if (DATA_KEYS.includes(key)) schedulePush();
  };
})();
