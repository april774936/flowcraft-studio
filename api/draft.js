// api/draft.js — Vercel serverless function: text → flow plan (JSON) with a real LLM.
// POST { prompt } → { plan, provider }. GET → { ready, provider } (which AI is configured). The browser turns the plan into nodes (src/ai/DraftBuilder.js).
//
// Keys live only in Vercel → Project → Settings → Environment Variables (never in the repo):
//   GEMINI_API_KEY      → Gemini (preferred when set); optional GEMINI_MODEL
//   ANTHROPIC_API_KEY   → Claude (used when there is no Gemini key)
//   FLOWCRAFT_AI_CODE   → optional passphrase; when set, requests must send it
//                         (keeps strangers from spending your API credit)
// With no key the endpoint answers 501 and the app falls back to its built-in text parser.
import Anthropic from '@anthropic-ai/sdk';

export const config = { maxDuration: 60 };

const KINDS = ['start', 'step', 'decision', 'milestone', 'document', 'manual', 'end'];

const PLAN_SCHEMA = {
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

const SYSTEM = `You design flowcharts for FlowCraft, a Korean flowchart / roadmap board.
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

async function withClaude(prompt) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }]
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('AI가 이 요청을 처리하지 않았어요.'), { status: 422 });
  if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('흐름이 너무 길어요. 조금 나눠서 요청해 주세요.'), { status: 422 });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text);
}

async function withGemini(prompt) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM}\nAnswer with JSON only, matching this JSON schema:\n${JSON.stringify(PLAN_SCHEMA)}` }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
    })
  });
  if (!r.ok) throw Object.assign(new Error(`Gemini 오류 (${r.status})`), { status: 502 });
  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  return JSON.parse(text);
}

export default async function handler(req, res) {
  // GET: is AI configured? (no key values, just which provider would answer)
  if (req.method === 'GET') {
    const provider = process.env.GEMINI_API_KEY ? 'gemini' : process.env.ANTHROPIC_API_KEY ? 'claude' : null;
    return res.status(200).json({ ready: !!provider, provider, codeRequired: !!process.env.FLOWCRAFT_AI_CODE });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  }
  const code = process.env.FLOWCRAFT_AI_CODE;
  if (code && req.headers['x-flowcraft-ai-code'] !== code) {
    return res.status(401).json({ error: 'code', message: 'AI 사용 코드가 필요해요.' });
  }
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  if (!hasClaude && !hasGemini) return res.status(501).json({ error: 'no_key' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const prompt = String(body.prompt || '').trim().slice(0, 4000);
  if (!prompt) return res.status(400).json({ error: 'prompt', message: '만들 흐름을 적어주세요.' });

  try {
    const plan = hasGemini ? await withGemini(prompt) : await withClaude(prompt);
    return res.status(200).json({ plan, provider: hasGemini ? 'gemini' : 'claude' });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'rate', message: '요청이 많아요. 잠시 후 다시 시도해 주세요.' });
    if (err instanceof Anthropic.AuthenticationError) return res.status(502).json({ error: 'auth', message: 'API 키가 올바르지 않아요.' });
    if (err instanceof SyntaxError) return res.status(502).json({ error: 'parse', message: 'AI 응답을 읽지 못했어요. 다시 시도해 주세요.' });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: 'api', message: `AI 서버 오류 (${err.status})` });
    return res.status(err.status || 500).json({ error: 'failed', message: err.message || 'AI 생성 실패' });
  }
}
