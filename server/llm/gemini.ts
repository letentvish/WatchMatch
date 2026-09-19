import { GoogleGenAI } from '@google/genai';
import { JsonRequest, LlmConfig, LlmError } from './types.js';

// Google Gemini via @google/genai. JSON output uses responseJsonSchema (plain JSON Schema).

const clients = new Map<string, GoogleGenAI>();
function client(cfg: LlmConfig): GoogleGenAI {
  let c = clients.get(cfg.apiKey);
  if (!c) {
    c = new GoogleGenAI({ apiKey: cfg.apiKey });
    clients.set(cfg.apiKey, c);
  }
  return c;
}

function toLlmError(err: any): LlmError {
  const msg = String(err?.message || err);
  const status = err?.status;
  if (status === 401 || status === 403 || /API key not valid|PERMISSION_DENIED/i.test(msg)) return new LlmError('Google rejected the API key', 'auth');
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) return new LlmError('Gemini rate limit or quota reached', 'rate_limit');
  if (status === 404 || /not found/i.test(msg)) return new LlmError('Gemini model not found', 'bad_request');
  if (status === 400) return new LlmError(`Gemini rejected the request: ${msg}`, 'bad_request');
  return new LlmError(`Gemini error: ${msg}`, 'unavailable');
}

export async function geminiJson(cfg: LlmConfig, req: JsonRequest): Promise<any> {
  try {
    const res = await client(cfg).models.generateContent({
      model: cfg.model,
      contents: req.prompt,
      config: { responseMimeType: 'application/json', responseJsonSchema: req.schema, maxOutputTokens: req.maxTokens ?? 8000 },
    });
    return JSON.parse((res.text || '').trim());
  } catch (err) {
    if (err instanceof SyntaxError) throw new LlmError('Gemini did not return valid JSON', 'parse');
    throw toLlmError(err);
  }
}

export async function geminiModels(cfg: LlmConfig): Promise<string[]> {
  try {
    const ids: string[] = [];
    const pager = await client(cfg).models.list();
    for await (const m of pager) {
      if (m.name && (m.supportedActions || []).includes('generateContent')) ids.push(m.name.replace(/^models\//, ''));
    }
    return ids.sort();
  } catch (err) {
    throw toLlmError(err);
  }
}

export async function geminiEmbed(cfg: LlmConfig, texts: string[], kind: 'query' | 'document'): Promise<number[][]> {
  const res = await client(cfg).models.embedContent({
    model: cfg.embedModel || 'gemini-embedding-001',
    contents: texts,
    config: { taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' },
  });
  return (res.embeddings || []).map(e => e.values || []);
}
