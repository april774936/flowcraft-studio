// planPrompt.js: what the AI is asked for when drafting a flow — shared by the Vercel function
// (api/draft.js) and the browser (direct Gemini call with a key saved on this device).

export const KINDS = ['start', 'step', 'decision', 'milestone', 'document', 'manual', 'end'];

export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'steps', 'links'],
  properties: {
    title: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'title', 'desc', 'period', 'checklist', 'branches'],
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: KINDS },
          title: { type: 'string' },
          desc: { type: 'string' },
          period: { type: 'string' },
          checklist: { type: 'array', items: { type: 'string' } },
          branches: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    links: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'branch', 'label'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          branch: { type: 'string' },
          label: { type: 'string' }
        }
      }
    }
  }
};

export const SYSTEM = `You design flowcharts for FlowCraft, a Korean flowchart / roadmap board.
The user describes a process, a study plan, or a career roadmap in plain language. Return a plan:
- steps: 4–20 nodes. id: short unique ascii ("s1", "s2" …). title: short Korean label (≤ 18 chars, no trailing punctuation).
  desc: one short sentence only when it adds something, otherwise "".
- kind: start (the first node), end (final goals / outcomes), decision (a real choice or condition),
  milestone (an achievement or checkpoint: 합격, 졸업, 취득 …), document (materials, textbooks, papers),
  manual (hands-on work: 실습, 면접, 상담 …), step (everything else).
- decision: put the options in "branches" (2–5 short labels, e.g. ["취업","박사","연구원"] or ["예","아니오"]),
  and give every outgoing link of that decision the matching "branch". Other nodes use branches [] and branch "".
- checklist: concrete sub-items of a step (things to prepare, tasks to tick off); [] if none. Prefer a checklist over many tiny steps.
- period: timing if the user mentions or clearly implies it ("2026 Q4", "~2027.06", "D-30", "1학기"), otherwise "".
- links: the arrows. Keep the main flow left → right; a loop back to an earlier step is allowed when the process repeats.
  label: short text on the arrow only when it helps (non-decision links), otherwise "".
- title: a short name for the whole flow.
Use the user's language (Korean unless they wrote otherwise). Do not invent personal facts about the user.`;


// The user's text plus today's date (so periods land in the right years)
export function userMessage(prompt, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `오늘 날짜: ${today}\n\n${prompt}`;
}

// Gemini models to try in order; busy (503/429) or missing (404) models fall through to the next
export const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

// Ask Gemini for a plan (works in Node 18+ and the browser). Throws with a Korean message.
export async function geminiPlan(key, prompt, { models = GEMINI_MODELS, timeoutMs = 45000 } = {}) {
  let last = '';
  for (const model of models) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal: ctrl ? ctrl.signal : undefined,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${SYSTEM}\nAnswer with JSON only, matching this JSON schema:\n${JSON.stringify(PLAN_SCHEMA)}` }] },
          contents: [{ role: 'user', parts: [{ text: userMessage(prompt) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.4,
            ...(/^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) // faster; 3.x only
          }
        })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        const msg = (e.error && e.error.message) || '';
        // A bad key fails the same way on every model: stop and say so
        if (r.status === 401 || r.status === 403 || /api key/i.test(msg)) {
          throw Object.assign(new Error(`Gemini 키가 올바르지 않아요 (${r.status})`), { status: 502, fatal: true });
        }
        last = `${model}: ${r.status}`;
        continue; // busy / unsupported option / not available → next model
      }
      const data = await r.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      return { plan: JSON.parse(text), model };
    } catch (err) {
      if (err.fatal) throw err;
      last = `${model}: ${err.name === 'AbortError' ? '시간 초과' : err.message}`;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw Object.assign(new Error(`Gemini가 지금 붐벼요. 잠시 후 다시 시도해 주세요. (${last})`), { status: 503 });
}
