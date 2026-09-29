// DraftBuilder.js: turns a flow "plan" into board nodes/edges, laid out left → right.
// A plan comes from the AI endpoint (api/draft.js) or from parseTextToPlan() below:
// { title, steps: [{ id, kind, title, desc, period, checklist: [], branches: [] }],
//   links: [{ from, to, branch, label }] }
// kind: start | step | decision | milestone | document | manual | end
// A decision's outgoing links name one of its `branches` (→ one output port per branch).

const KIND = {
  start: { type: 'start', icon: 'start', color: '#10b981' },
  end: { type: 'end', icon: 'target', color: '#ec4899' },
  decision: { type: 'condition', icon: 'condition', color: '#8b5cf6' },
  milestone: { type: 'milestone', icon: 'flag', color: '#f59e0b' },
  document: { type: 'document', icon: 'book', color: '#f59e0b' },
  manual: { type: 'manual', icon: 'user', color: '#f97316' },
  step: { type: 'action', icon: 'action', color: '#3b82f6' }
};

const COL_GAP = 360;
const ROW_GAP = 190;

const clean = (s, max = 80) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

// Keep only what the board can show; drop dangling links and repeated ids
export function normalizePlan(plan) {
  const steps = [];
  const seen = new Set();
  (plan && Array.isArray(plan.steps) ? plan.steps : []).slice(0, 60).forEach((s, i) => {
    const id = clean(s.id, 40) || `s${i + 1}`;
    if (seen.has(id) || !clean(s.title)) return;
    seen.add(id);
    steps.push({
      id,
      kind: KIND[s.kind] ? s.kind : 'step',
      title: clean(s.title, 60),
      desc: clean(s.desc, 160),
      period: clean(s.period, 30),
      checklist: (Array.isArray(s.checklist) ? s.checklist : []).map(c => clean(c, 100)).filter(Boolean).slice(0, 12),
      branches: (Array.isArray(s.branches) ? s.branches : []).map(b => clean(b, 30)).filter(Boolean).slice(0, 8)
    });
  });
  const links = (plan && Array.isArray(plan.links) ? plan.links : [])
    .filter(l => seen.has(l.from) && seen.has(l.to) && l.from !== l.to)
    .map(l => ({ from: l.from, to: l.to, branch: clean(l.branch, 30), label: clean(l.label, 30) }));
  // A decision's branch list must cover every branch its links use
  steps.filter(s => s.kind === 'decision').forEach(s => {
    links.filter(l => l.from === s.id).forEach(l => {
      const name = l.branch || l.label;
      if (name && !s.branches.includes(name)) s.branches.push(name);
    });
    if (!s.branches.length) s.branches = ['예', '아니오'];
  });
  return { title: clean(plan && plan.title, 60), steps, links };
}

// Columns = longest path from the first steps (back edges ignored), rows = order within a column
function layout(steps, links) {
  const out = new Map(steps.map(s => [s.id, []]));
  const indeg = new Map(steps.map(s => [s.id, 0]));
  links.forEach(l => { out.get(l.from).push(l.to); indeg.set(l.to, indeg.get(l.to) + 1); });

  // Drop back edges (loops like "다시 복습") so the depth calculation terminates
  const state = new Map();
  const forward = new Set();
  const visit = (id) => {
    state.set(id, 1);
    out.get(id).forEach(to => {
      if (state.get(to) === 1) return; // back edge
      forward.add(id + '→' + to);
      if (!state.get(to)) visit(to);
    });
    state.set(id, 2);
  };
  steps.filter(s => indeg.get(s.id) === 0).forEach(s => visit(s.id));
  steps.forEach(s => { if (!state.get(s.id)) visit(s.id); });

  const depth = new Map(steps.map(s => [s.id, 0]));
  for (let pass = 0; pass < steps.length; pass++) {
    let changed = false;
    links.forEach(l => {
      if (!forward.has(l.from + '→' + l.to)) return;
      const d = depth.get(l.from) + 1;
      if (d > depth.get(l.to)) { depth.set(l.to, d); changed = true; }
    });
    if (!changed) break;
  }

  // Order inside a column by the average row of the parents (keeps branches untangled)
  const cols = [];
  steps.forEach(s => { (cols[depth.get(s.id)] ||= []).push(s.id); });
  const row = new Map();
  cols.forEach((ids, c) => {
    if (c > 0) {
      const key = (id) => {
        const parents = links.filter(l => l.to === id && forward.has(l.from + '→' + l.to)).map(l => {
          const p = row.get(l.from) ?? 0;
          const s = steps.find(x => x.id === l.from);
          const bi = s && s.kind === 'decision' ? s.branches.indexOf(l.branch || l.label) : -1;
          return p + (bi >= 0 ? bi * 0.01 : 0); // branch order inside a decision
        });
        return parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : 0;
      };
      ids.sort((a, b) => key(a) - key(b));
    }
    ids.forEach((id, r) => row.set(id, r - (ids.length - 1) / 2));
  });
  return { depth, row };
}

// Plan → nodes/edges for the board, with the top-left of the flow at (x0, y0)
export function buildGraph(rawPlan, x0 = 100, y0 = 200) {
  const plan = normalizePlan(rawPlan);
  const { steps, links } = plan;
  if (!steps.length) return { nodes: [], edges: [], title: plan.title };
  const { depth, row } = layout(steps, links);
  const minRow = Math.min(...steps.map(s => row.get(s.id)));
  const stamp = Date.now().toString(36);
  const nid = (id) => `ai_${stamp}_${id}`.replace(/[^\w-]/g, '_');

  const nodes = steps.map(s => {
    const k = KIND[s.kind];
    const node = {
      id: nid(s.id),
      type: k.type,
      category: k.type === 'action' ? 'action' : k.type,
      title: s.title,
      desc: s.desc,
      icon: k.icon,
      color: k.color,
      x: Math.round(x0 + depth.get(s.id) * COL_GAP),
      y: Math.round(y0 + (row.get(s.id) - minRow) * ROW_GAP),
      status: 'idle',
      memo: ''
    };
    if (s.period && s.kind !== 'decision') node.period = s.period;
    if (s.checklist.length && s.kind !== 'decision' && s.kind !== 'start' && s.kind !== 'end') {
      node.checklist = s.checklist.map((text, i) => ({ id: `ck_${stamp}_${s.id}_${i}`, text, done: false }));
    }
    if (s.kind === 'decision') node.branches = s.branches.map((label, i) => ({ id: `b${i + 1}`, label }));
    return node;
  });

  const byPlanId = new Map(steps.map((s, i) => [s.id, nodes[i]]));
  const edges = links.map((l, i) => {
    const from = byPlanId.get(l.from);
    const to = byPlanId.get(l.to);
    let fromPort = 'right';
    let label = l.label || '';
    if (from.branches) {
      const name = l.branch || l.label;
      const b = from.branches.find(x => x.label === name) || from.branches[0];
      fromPort = `branch:${b.id}`;
      label = b.label;
    }
    const back = to.x <= from.x; // loop back to an earlier step
    return {
      id: `e_${stamp}_${i}`,
      from: from.id, fromPort: back && !from.branches ? 'bottom' : fromPort,
      to: to.id, toPort: back ? 'bottom' : 'left',
      label, lineType: 'orthogonal'
    };
  });
  return { nodes, edges, title: plan.title };
}

// ---------------------------------------------------------------------------
// Local fallback: text → plan without any AI.
// Understands arrows (→ -> => ~> >), one step per line, "A / B / C" or "A 또는 B" choices,
// "제목: 항목, 항목" checklists, "(2026 Q4)" / "~2027.06" periods, "x1:" step prefixes and
// the "조건: [Yes: a -> b], [No: c]" branch form.
// ---------------------------------------------------------------------------
const PERIOD = /\(([^)]*\d[^)]*)\)|(~\s*\d{4}(?:[.\-/]\d{1,2})?)|(\d{4}\s*[.\-/]?\s*(?:Q[1-4]|\d{1,2}월?|상반기|하반기))/i;
const MILESTONE = /(합격|달성|완료|취득|졸업|입학|런칭|출시|목표)$/;
const DOCUMENT = /(교재|자료|문서|책|논문|노트|기출)/;
const DECISION = /(\?|여부|선택|결정|판단|분기)$/;

// Split on arrows that are not inside [ ... ]
function splitArrows(line) {
  const parts = [];
  let depth = 0, cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '[') depth++;
    if (ch === ']') depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const m = /^\s*(?:→|->|=>|~>|⇒|>)\s*/.exec(line.slice(i));
      if (m) { parts.push(cur); cur = ''; i += m[0].length - 1; continue; }
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
}

function splitChoices(text) {
  const t = text.replace(/\s*(?:중에서|중)\s*(?:하나\s*)?(?:를|을)?\s*(?:선택|고르기|결정)?\s*[.!]?$/, '');
  const parts = t.split(/\s*(?:\/|\|| 또는 | 혹은 | or )\s*/i).map(s => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts : null;
}

// Requests to the tool itself ("…체크리스트로 넣어줘") are not steps
const REQUEST = /(해\s?줘|넣어\s?줘|만들어\s?줘|그려\s?줘|주세요|줘)\s*[.!]?$/;

function makeStep(raw, idx) {
  let text = raw.replace(/^\s*(?:[-*•]|\d+[.)]|x\d+\s*[:：]|step\s*\d+\s*[:：])\s*/i, '').replace(/[.。]\s*$/, '').trim();
  let period = '';
  let checklist = [];
  // "(연구실 컨택, 연구계획서)" — a list in parentheses is the step's checklist
  const lm = /\(([^)\d]*[,、，][^)\d]*)\)/.exec(text);
  if (lm) {
    checklist = lm[1].split(/\s*[,、，]\s*/).filter(Boolean);
    text = text.replace(lm[0], '').trim();
  }
  const pm = text.match(PERIOD);
  if (pm) {
    period = (pm[1] || pm[2] || pm[3] || '').trim();
    text = text.replace(pm[0], '').replace(/\s{2,}/g, ' ').trim();
  }
  const cm = /^([^:：]{1,40})[:：]\s*(.+)$/.exec(text);
  if (cm && /[,、，]/.test(cm[2])) {
    checklist = cm[2].split(/\s*[,、，]\s*/).filter(Boolean);
    text = cm[1].trim();
  }
  let kind = 'step';
  if (DECISION.test(text)) kind = 'decision';
  else if (MILESTONE.test(text)) kind = 'milestone';
  else if (DOCUMENT.test(text)) kind = 'document';
  return { id: `s${idx}`, kind, title: text || `단계 ${idx}`, desc: '', period, checklist, branches: [] };
}

// "…하면 A, …하면 B" → { title, conds: [{ label, action }] } (first part may be the decision itself)
const COND = /^(.*?)(\S*?(?:으면|면))\s+(.+)$/;
function parseConditional(seg) {
  let head = '';
  let body = seg;
  const colon = /^([^:：]{2,60})[:：]\s*(.+)$/.exec(seg);
  if (colon) { head = colon[1].trim(); body = colon[2]; }
  const items = body.split(/\s*[,，]\s*/).map(x => x.trim()).filter(Boolean);
  if (items.length < 2 && !head) {
    // one sentence: "점수가 목표 이상인지 확인해서 부족하면 복습"
    const m = COND.exec(body);
    if (!m || !m[1].trim()) return null;
    return { title: tidyTitle(m[1]), conds: [{ label: m[2], action: m[3] }], openElse: true };
  }
  const conds = [];
  let title = head;
  for (let i = 0; i < items.length; i++) {
    const m = COND.exec(items[i]);
    if (!m) {
      if (i === 0 && !title) { title = items[i]; continue; } // "스스로 점검, 못 하면 …"
      return null;
    }
    let label = m[2];
    if (m[1].trim()) {
      if (i === 0 && !title) title = m[1];      // "점수 확인해서 부족하면 …": the check is the decision
      else label = (m[1] + m[2]).trim();        // "문제 있으면 …", "못 하면 …"
    }
    conds.push({ label, action: m[3] });
  }
  if (!conds.length || (!title && conds.length < 2)) return null;
  return { title: tidyTitle(title || '판단'), conds, openElse: conds.length === 1 };
}
const tidyTitle = (t) => t.replace(/\s*(?:해서|하고|한 뒤|해 보고|해보고|하여)\s*$/, '').trim();

export function parseTextToPlan(text) {
  const steps = [];
  const links = [];
  let n = 0;
  const add = (raw) => { const s = makeStep(raw, ++n); steps.push(s); return s; };
  const link = (from, to, branch = '') => { if (from && to) links.push({ from: from.id, to: to.id, branch, label: branch }); };
  // Open ends of the flow so far: { s: step, b: branch label when leaving a decision }
  let tails = [];
  const linkTails = (to) => tails.forEach(t => link(t.s, to, t.b || ''));
  const decisionStep = (title) => { const d = add(title); d.kind = 'decision'; d.title = makeStep(title, 0).title || '판단'; return d; };

  // "다시 개념으로 돌아가기" → an earlier step whose title shares the key word
  const findBack = (action) => {
    const m = /(?:다시|다른)\s+(.+?)(?:으로|로|을|를)?\s*(?:돌아가기|돌아감|돌아가|하기)?\.?$/.exec(action);
    if (!m) return null;
    const key = m[1].replace(/\s*(?:단계|부분)$/, '').trim();
    if (!key) return null;
    return [...steps].reverse().find(s => s.title.includes(key) || key.includes(s.title)) || null;
  };

  // "조건: [Yes: a -> b], [No: c]" → decision with a chain per branch
  const bracketed = (segment) => {
    const m = /^(.*?)[:：]?\s*((?:\[[^\]]+\]\s*,?\s*)+)$/.exec(segment);
    if (!m || !m[2].includes('[')) return false;
    const dec = decisionStep(m[1] || '분기');
    linkTails(dec);
    const ends = [];
    (m[2].match(/\[[^\]]+\]/g) || []).forEach(group => {
      const g = /^\[\s*([^:：]+?)\s*[:：]\s*(.+)\]$/.exec(group.trim());
      if (!g) return;
      const label = g[1].replace(/\s*\((?:yes|no)\)\s*/i, '').trim();
      dec.branches.push(label);
      let last = null;
      splitArrows(g[2]).forEach((part, i) => {
        const st = add(part);
        if (i === 0) link(dec, st, label); else link(last, st);
        last = st;
      });
      if (last) ends.push({ s: last });
    });
    tails = ends;
    return true;
  };

  // "부족하면 복습 후 다시 모의고사, 충분하면 최종 정리" → decision; loops go back, the rest continue
  const conditional = (segment) => {
    const c = parseConditional(segment);
    if (!c) return false;
    const dec = decisionStep(c.title);
    linkTails(dec);
    const next = [];
    c.conds.forEach(({ label, action }) => {
      dec.branches.push(label);
      const back = findBack(action);
      if (/^(?:포기|중단|종료|그만|취소)/.test(action)) { // this branch ends here
        const st = add(action);
        st.kind = 'end';
        link(dec, st, label);
        return;
      }
      const main = action.replace(/\s*(?:후|하고|한 뒤)?\s*다시\s+.*$/, '').trim();
      if (/^다른\s/.test(action) && back) { link(dec, back, label); return; }
      if (main && !/^다시/.test(action)) {
        const st = add(main);
        link(dec, st, label);
        if (back) link(st, back); else next.push({ s: st });
      } else if (back) {
        link(dec, back, label);
      } else {
        const st = add(action);
        link(dec, st, label);
        next.push({ s: st });
      }
    });
    if (c.openElse) { dec.branches.push('그 외'); next.push({ s: dec, b: '그 외' }); }
    tails = next.length ? next : [{ s: dec, b: dec.branches[dec.branches.length - 1] }];
    return true;
  };

  const lines = String(text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  lines.forEach(line => {
    // A bullet under a line ending in ":" becomes a checklist item of that step
    const prevStep = steps[steps.length - 1];
    if (/^[-*•]\s+/.test(line) && prevStep && prevStep._collect) {
      prevStep.checklist.push(line.replace(/^[-*•]\s+/, ''));
      return;
    }
    // Sentences are steps too; requests to the tool are dropped
    const segments = splitArrows(line)
      .flatMap(seg => seg.split(/(?<=[.。!])\s+(?![^\[]*\])/))
      .map(seg => seg.trim())
      .filter(seg => seg && !REQUEST.test(seg));
    segments.forEach(seg => {
      if (seg.includes('[') && bracketed(seg)) return;
      if (/면\s/.test(seg) && conditional(seg)) return;
      const choices = splitChoices(seg.replace(/^\s*x\d+\s*[:：]\s*/i, ''));
      if (choices && choices.length <= 6) {
        // "취업 / 박사 / 연구원" → a choice point with one step per option
        const dec = decisionStep('어느 길로?');
        linkTails(dec);
        tails = choices.map(c => {
          const st = add(c);
          dec.branches.push(st.title);
          link(dec, st, st.title);
          return { s: st };
        });
        return;
      }
      const st = add(seg.replace(/[:：]\s*$/, ''));
      if (/[:：]\s*$/.test(seg)) st._collect = true;
      linkTails(st);
      tails = [{ s: st }];
    });
  });

  // First step starts the flow; steps nothing leaves from are ends (unless they are milestones)
  if (steps.length >= 3) {
    if (steps[0].kind === 'step') steps[0].kind = 'start';
    const hasOut = new Set(links.map(l => l.from));
    steps.forEach(s => {
      if (!hasOut.has(s.id) && s.kind === 'step' && s !== steps[0]) s.kind = 'end';
    });
  }
  steps.forEach(s => delete s._collect);
  return { title: '', steps, links };
}
