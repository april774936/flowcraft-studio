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
import { PLAN_SCHEMA, SYSTEM, userMessage, geminiPlan, GEMINI_MODELS } from '../src/ai/planPrompt.js';

export const config = { maxDuration: 60 };

async function withClaude(prompt) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: userMessage(prompt) }]
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('AI가 이 요청을 처리하지 않았어요.'), { status: 422 });
  if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('흐름이 너무 길어요. 조금 나눠서 요청해 주세요.'), { status: 422 });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text);
}

async function withGemini(prompt) {
  const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL, ...GEMINI_MODELS] : GEMINI_MODELS;
  // Stay inside the function's 60 s limit: two quick tries at most
  const { plan } = await geminiPlan(process.env.GEMINI_API_KEY, prompt, { models: models.slice(0, 2), timeoutMs: 27000 });
  return plan;
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
