import { anthropicJson, anthropicModels } from './anthropic.js';
import { openaiJson, openaiModels, openaiEmbed } from './openaiCompatible.js';
import { geminiJson, geminiModels, geminiEmbed } from './gemini.js';
import { JsonRequest, LlmConfig, LlmError, PROVIDERS, ProviderId } from './types.js';
import type { EmbedFn } from '../relevance.js';

export { PROVIDERS, LlmError } from './types.js';
export type { LlmConfig, JsonSchema, ProviderId } from './types.js';

// ---------------------------------------------------------------------------
// Server default ("free WatchMatch AI"): configured in .env, key never leaves the server.
//   LLM_PROVIDER=nvidia  NVIDIA_API_KEY=nvapi-...  LLM_MODEL=nvidia/nemotron-3-ultra-550b-a55b
// Falls back to GEMINI_API_KEY for older setups.
// ---------------------------------------------------------------------------

const PLACEHOLDERS = new Set(['', 'MY_GEMINI_API_KEY', 'PLACEHOLDER_KEY', 'MY_NVIDIA_API_KEY', 'MY_LLM_API_KEY']);

export function serverDefault(): LlmConfig | null {
  const provider = (process.env.LLM_PROVIDER as ProviderId) || (process.env.NVIDIA_API_KEY ? 'nvidia' : process.env.GEMINI_API_KEY ? 'gemini' : undefined);
  if (!provider || !PROVIDERS[provider]) return null;
  const keyByProvider: Record<ProviderId, string | undefined> = {
    nvidia: process.env.NVIDIA_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openai_compatible: process.env.LLM_API_KEY,
  };
  const apiKey = (process.env.LLM_API_KEY || keyByProvider[provider] || '').trim();
  if (PLACEHOLDERS.has(apiKey)) return null;
  const info = PROVIDERS[provider];
  return {
    provider,
    apiKey,
    model: process.env.LLM_MODEL || (provider === 'gemini' ? process.env.GEMINI_MODEL : '') || info.defaultModel,
    baseUrl: process.env.LLM_BASE_URL || info.baseUrl,
    embedModel: process.env.LLM_EMBED_MODEL || info.embedModel,
    isServerDefault: true,
  };
}

// Simple per-IP budget so a public deployment can't drain the owner's free key.
const DEFAULT_LIMIT = Number(process.env.FREE_AI_REQUESTS_PER_HOUR) || 60;
const usage = new Map<string, { windowStart: number; count: number }>();

function allowDefaultUse(ip: string): boolean {
  const now = Date.now();
  const u = usage.get(ip);
  if (!u || now - u.windowStart > 3_600_000) {
    usage.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (u.count >= DEFAULT_LIMIT) return false;
  u.count++;
  return true;
}

// Custom base URLs make this server issue requests on the user's behalf; refuse anything that
// could reach the host's own network.
export function assertSafeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LlmError('Base URL is not a valid URL', 'bad_request');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isPrivate =
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local') ||
    host === '0.0.0.0' || host === '::1' || (host.includes(':') && /^(fc|fd|fe80)/.test(host)) ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === 'metadata.google.internal';
  const allowLocal = process.env.ALLOW_LOCAL_LLM_URLS === 'true';
  if (url.protocol !== 'https:' && !(allowLocal && url.protocol === 'http:')) throw new LlmError('Base URL must use https', 'bad_request');
  if (isPrivate && !allowLocal) throw new LlmError('Base URL must be a public host', 'bad_request');
  return url.toString().replace(/\/$/, '');
}

// What the browser may send. `provider: "default"` means the server's free key (optionally with a model choice).
export interface ClientLlmSettings {
  provider?: ProviderId | 'default' | 'none';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface ResolvedLlm {
  config: LlmConfig | null;
  skipped?: 'disabled' | 'not_configured' | 'rate_limited' | 'invalid';
  error?: string;
}

export function resolveLlm(settings: ClientLlmSettings | undefined, ip: string): ResolvedLlm {
  const s = settings || {};
  if (s.provider === 'none') return { config: null, skipped: 'disabled' };

  if (!s.provider || s.provider === 'default') {
    const def = serverDefault();
    if (!def) return { config: null, skipped: 'not_configured' };
    if (!allowDefaultUse(ip)) return { config: null, skipped: 'rate_limited' };
    return { config: { ...def, model: sanitizeModel(s.model) || def.model } };
  }

  const info = PROVIDERS[s.provider];
  if (!info) return { config: null, skipped: 'invalid', error: 'Unknown provider' };
  const apiKey = (s.apiKey || '').trim();
  if (!apiKey) return { config: null, skipped: 'invalid', error: 'API key missing' };
  try {
    const baseUrl = info.needsBaseUrl || s.baseUrl ? assertSafeBaseUrl(s.baseUrl || '') : info.baseUrl;
    const model = sanitizeModel(s.model) || info.defaultModel;
    if (!model) return { config: null, skipped: 'invalid', error: 'Model missing' };
    return { config: { provider: s.provider, apiKey, model, baseUrl, embedModel: info.embedModel, isServerDefault: false } };
  } catch (err: any) {
    return { config: null, skipped: 'invalid', error: err.message };
  }
}

function sanitizeModel(m?: string): string {
  const v = (m || '').trim();
  return /^[\w.\-/:@]{1,120}$/.test(v) ? v : '';
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function generateJson(cfg: LlmConfig, req: JsonRequest): Promise<any> {
  switch (cfg.provider) {
    case 'anthropic': return anthropicJson(cfg, req);
    case 'gemini': return geminiJson(cfg, req);
    default: return openaiJson(cfg, req);
  }
}

// Embedding function for semantic relevance, or undefined when the provider has none (e.g. Claude).
export function embedderFor(cfg: LlmConfig | null): EmbedFn | undefined {
  if (!cfg || !cfg.embedModel) return undefined;
  let fn: EmbedFn;
  if (cfg.provider === 'gemini') fn = (texts, kind) => geminiEmbed(cfg, texts, kind);
  else if (cfg.provider === 'nvidia' || cfg.provider === 'openai') fn = (texts, kind) => openaiEmbed(cfg, texts, kind);
  else return undefined;
  fn.cacheKey = `${cfg.provider}:${cfg.embedModel}`;
  return fn;
}

const NON_CHAT = /embed|rerank|reward|safety|guard|parse|retriever|clip|whisper|tts|dall-e|image|audio|transcribe|moderation|vision-only|nv-ingest/i;

export async function listModels(cfg: LlmConfig): Promise<string[]> {
  let ids: string[];
  switch (cfg.provider) {
    case 'anthropic': ids = await anthropicModels(cfg); break;
    case 'gemini': ids = await geminiModels(cfg); break;
    default: ids = await openaiModels(cfg);
  }
  return ids.filter(id => !NON_CHAT.test(id));
}

export async function testConnection(cfg: LlmConfig): Promise<{ ok: true; ms: number; reply: string }> {
  const started = Date.now();
  const out = await generateJson(cfg, {
    name: 'ping',
    prompt: 'Reply with {"reply": "ok"} and name one classic movie in "movie".',
    schema: {
      type: 'object',
      properties: { reply: { type: 'string' }, movie: { type: 'string' } },
      required: ['reply', 'movie'],
      additionalProperties: false,
    },
    maxTokens: 2000,
  });
  return { ok: true, ms: Date.now() - started, reply: `${out.reply} — e.g. ${out.movie}` };
}

export function describe(cfg: LlmConfig | null): string {
  return cfg ? `${cfg.provider}:${cfg.model}${cfg.isServerDefault ? ' (free)' : ''}` : 'local';
}
