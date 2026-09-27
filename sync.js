// FlowCraft Studio — 개인용 기기 간 동기화 (Supabase)
// 프로젝트(플로우차트) 데이터를 브라우저 localStorage와 Supabase 사이에 동기화합니다.
// 로그인 없이, 모든 기기에 똑같은 "동기화 코드"를 넣는 방식입니다 (개인용, 비민감 데이터 전제).
//
// 병합 규칙: 통째로 덮어쓰지 않고 프로젝트 단위로 합칩니다.
//  - 같은 id의 프로젝트는 updatedAt이 더 최신인 쪽이 이김 (동률이면 이 기기 쪽).
//  - 한쪽에만 있는 프로젝트는 유지. 영구삭제는 툼스톤(flowcraft_deleted_project_ids)으로 전파.
//  - 서버 쓰기는 updated_at 조건부(낙관적 동시성) — 그 사이 다른 기기가 썼으면 다시 받아서 병합 후 재시도.
//  - 화면 이동/줌(viewport)만 바뀐 건 업로드하지 않음.
(function () {
  const SUPABASE_URL = 'https://djzzjezjlemvxzjiusly.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_axIbnWAf3nLWvTYjEyXI6A_omvOu1nT';

  const TABLE = 'flowcraft_sync';
  const CODE_KEY = 'FLOWCRAFT_SYNC_CODE';
  const DEBOUNCE_MS = 2500;
  const MAX_RETRIES = 3;

  const PROJECTS_KEY = 'flowcraft_projects_v2';
  const ACTIVE_KEY = 'flowcraft_active_project_id';
  const TOMBSTONE_KEY = 'flowcraft_deleted_project_ids';
  const DATA_KEYS = [PROJECTS_KEY, ACTIVE_KEY, TOMBSTONE_KEY];
  // 동기화 결과 반영 후 새로고침 무한루프 방지용
  const RELOAD_GUARD_KEY = 'FLOWCRAFT_SYNC_RELOADED_AT';

  const configured = !SUPABASE_URL.includes('YOUR-PROJECT');

  const origSetItem = localStorage.setItem.bind(localStorage);

  function getSyncCode() {
    return localStorage.getItem(CODE_KEY) || '';
  }
  function setSyncCode(code) {
    origSetItem(CODE_KEY, code);
  }

  function parseJSON(str, fallback) {
    if (typeof str !== 'string') return fallback;
    try {
      const v = JSON.parse(str);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function readLocal() {
    return {
      projects: parseJSON(localStorage.getItem(PROJECTS_KEY), null),
      tombstones: parseJSON(localStorage.getItem(TOMBSTONE_KEY), {}),
      activeId: localStorage.getItem(ACTIVE_KEY) || ''
    };
  }

  function fromRemote(data) {
    data = data || {};
    return {
      projects: parseJSON(data[PROJECTS_KEY], null),
      tombstones: parseJSON(data[TOMBSTONE_KEY], {}),
      activeId: typeof data[ACTIVE_KEY] === 'string' ? data[ACTIVE_KEY] : ''
    };
  }

  const ts = (iso) => Date.parse(iso) || 0;

  function merge(local, remote) {
    const tombstones = { ...remote.tombstones };
    Object.keys(local.tombstones).forEach((id) => {
      if (!tombstones[id] || ts(local.tombstones[id]) > ts(tombstones[id])) {
        tombstones[id] = local.tombstones[id];
      }
    });

    const byId = new Map();
    const order = [];
    const all = [].concat(
      Array.isArray(local.projects) ? local.projects : [],
      Array.isArray(remote.projects) ? remote.projects : []
    );
    all.forEach((p) => {
      if (!p || !p.id) return;
      const cur = byId.get(p.id);
      if (!cur) {
        byId.set(p.id, p);
        order.push(p.id);
      } else if (ts(p.updatedAt) > ts(cur.updatedAt)) {
        byId.set(p.id, p);
      }
    });

    const projects = order
      .map((id) => byId.get(id))
      .filter((p) => !(tombstones[p.id] && ts(tombstones[p.id]) >= ts(p.updatedAt)));

    // 활성 프로젝트는 기기별 상태 — 이 기기 값 우선
    const ids = new Set(projects.map((p) => p.id));
    const activeId = ids.has(local.activeId)
      ? local.activeId
      : ids.has(remote.activeId)
        ? remote.activeId
        : projects[0]?.id || '';

    return { projects, tombstones, activeId };
  }

  // viewport를 뺀 내용 서명 — 화면 이동만으로는 "변경"으로 치지 않음
  function signature(d) {
    const projects = Array.isArray(d.projects)
      ? d.projects.map(({ viewport, ...rest }) => rest)
      : null;
    return JSON.stringify({ projects, tombstones: d.tombstones });
  }

  function toPayload(d) {
    return {
      [PROJECTS_KEY]: JSON.stringify(d.projects),
      [ACTIVE_KEY]: d.activeId,
      [TOMBSTONE_KEY]: JSON.stringify(d.tombstones)
    };
  }

  function writeLocal(d) {
    origSetItem(PROJECTS_KEY, JSON.stringify(d.projects));
    origSetItem(TOMBSTONE_KEY, JSON.stringify(d.tombstones));
    if (d.activeId) origSetItem(ACTIVE_KEY, d.activeId);
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`
  };

  async function pull(code) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(code)}&select=data,updated_at`,
      { headers, cache: 'no-store' }
    );
    if (!res.ok) throw new Error('pull failed: ' + res.status);
    const rows = await res.json();
    return rows[0] || null;
  }

  // prevUpdatedAt이 있으면 그 버전일 때만 덮어씀. 경합이면 false 반환.
  async function write(code, data, prevUpdatedAt) {
    const updated_at = new Date().toISOString();
    if (prevUpdatedAt) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(code)}` +
          `&updated_at=eq.${encodeURIComponent(prevUpdatedAt)}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ data, updated_at })
        }
      );
      if (!res.ok) throw new Error('push failed: ' + res.status);
      const rows = await res.json();
      return rows.length > 0;
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ id: code, data, updated_at })
    });
    if (res.status === 409) return false; // 다른 기기가 방금 처음 만듦
    if (!res.ok) throw new Error('push failed: ' + res.status);
    return true;
  }

  // 서버에서 받아 병합 → 서버와 다르면 조건부 쓰기(경합 시 재시도). 병합 결과 반환.
  async function syncOnce(code) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const row = await pull(code);
      const remote = fromRemote(row && row.data);
      const merged = merge(readLocal(), remote);
      if (row && signature(merged) === signature(remote)) {
        lastSyncedSig = signature(merged);
        return { merged, remote };
      }
      if (await write(code, toPayload(merged), row && row.updated_at)) {
        lastSyncedSig = signature(merged);
        return { merged, remote };
      }
    }
    throw new Error('push conflict: retries exhausted');
  }

  let pushTimer = null;
  let inFlight = null;
  let dirty = false;
  let lastSyncedSig = null; // 마지막으로 서버와 일치했던 내용 서명

  function schedulePush() {
    if (!configured || !getSyncCode()) return;
    if (!dirty && !inFlight && signature(readLocal()) === lastSyncedSig) return; // viewport만 바뀜
    dirty = true;
    clearTimeout(pushTimer);
    updateBadge('pending');
    pushTimer = setTimeout(flush, DEBOUNCE_MS);
  }

  async function flush() {
    clearTimeout(pushTimer);
    const code = getSyncCode();
    if (!configured || !code || !dirty) return;
    if (inFlight) {
      await inFlight;
      return flush();
    }
    dirty = false;
    inFlight = syncOnce(code)
      .then(() => updateBadge(dirty ? 'pending' : 'synced'))
      .catch((err) => {
        dirty = true;
        console.warn('[FlowCraft sync] push error', err);
        updateBadge('error');
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  async function initialSync() {
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
      const localBefore = readLocal();
      const { merged } = await syncOnce(code);
      // 다른 기기 변경분이 들어왔으면 로컬에 반영하고 한 번 새로고침
      if (signature(merged) !== signature(localBefore)) {
        writeLocal(merge(readLocal(), merged)); // 대기 중 생긴 로컬 수정도 보존
        const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
        if (Date.now() - last > 10000) {
          sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
          location.reload();
          return;
        }
      }
      updateBadge('synced');
    } catch (err) {
      console.warn('[FlowCraft sync] initial sync error', err);
      updateBadge('error');
    }
  }

  // 탭으로 돌아왔을 때: 다른 기기 변경이 있으면 배지로 알림 (작업 중 강제 새로고침은 안 함)
  async function checkRemote() {
    const code = getSyncCode();
    if (!configured || !code || dirty || inFlight) return;
    try {
      const row = await pull(code);
      const merged = merge(readLocal(), fromRemote(row && row.data));
      if (signature(merged) !== signature(readLocal())) updateBadge('remote');
    } catch (err) {
      console.warn('[FlowCraft sync] check error', err);
    }
  }

  // --- 화면 우측 하단 작은 동기화 배지 ---
  let badgeEl = null;
  let badgeState = 'nocode';
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
    badgeEl.addEventListener('click', onBadgeClick);
    document.body.appendChild(badgeEl);
    return badgeEl;
  }

  function updateBadge(state) {
    const el = ensureBadge();
    badgeState = state;
    const code = getSyncCode();
    const map = {
      unconfigured: '☁️ 동기화 미설정',
      nocode: '☁️ 동기화 꺼짐 · 클릭해서 설정',
      syncing: '☁️ 확인 중...',
      pending: '☁️ 저장 대기...',
      synced: `☁️ 동기화됨 · ${code}`,
      remote: '🔄 다른 기기 변경사항 있음 · 클릭해서 불러오기',
      error: '⚠️ 동기화 오류 · 클릭'
    };
    el.textContent = map[state] || map.nocode;
  }

  function onBadgeClick() {
    if (badgeState === 'remote') {
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
      initialSync();
      return;
    }
    openSetupPrompt();
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
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
    initialSync();
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureBadge();
    initialSync();
  });

  // 탭을 떠날 때 대기 중인 변경을 바로 올림 (닫기 직전 2.5초 안 수정분 유실 방지).
  // 그래도 못 올라간 건 다음에 열 때 병합 단계에서 올라감.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else checkRemote();
  });
  window.addEventListener('pagehide', () => flush());

  localStorage.setItem = function (key, value) {
    origSetItem(key, value);
    if (DATA_KEYS.includes(key) && key !== ACTIVE_KEY) schedulePush();
  };
})();
