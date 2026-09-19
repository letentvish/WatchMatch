import OpenAI from 'openai';
import { JsonRequest, LlmConfig, LlmError, parseJsonText } from './types.js';

// OpenAI, NVIDIA NIM and any other OpenAI-compatible endpoint (Groq, Together, OpenRouter, a local
// vLLM...). JSON output uses response_format json_schema; providers that reject it fall back to a
// plain prompt and we parse the JSON out of the text.

const clients = new Map<string, OpenAI>();
function client(cfg: LlmConfig): OpenAI {
  const key = `${cfg.baseUrl}|${cfg.apiKey}`;
  let c = clients.get(key);
  if (!c) {
    // Fail fast: one quick retry for transient 429/503s, then local ranking instead of stalling the search.
    c = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl, maxRetries: 1, timeout: 40_000 });
    clients.set(key, c);
  }
  return c;
}

const noJsonSchema = new Set<string>(); // base URLs/models that rejected response_format json_schema

function toLlmError(err: unknown): LlmError {
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) return new LlmError('The provider rejected the API key', 'auth');
  if (err instanceof OpenAI.RateLimitError) return new LlmError('Provider rate limit reached', 'rate_limit');
  if (err instanceof OpenAI.NotFoundError) return new LlmError('Model not found at this provider', 'bad_request');
  if (err instanceof OpenAI.BadRequestError) return new LlmError(`Provider rejected the request: ${err.message}`, 'bad_request');
  if (err instanceof OpenAI.APIError) return new LlmError(`Provider API error ${err.status ?? ''}`.trim(), 'unavailable');
  if (err instanceof LlmError) return err;
  return new LlmError(`Could not reach the provider: ${(err as Error)?.message || err}`, 'unavailable');
}

// Reasoning-capable NVIDIA models think by default; for structured extraction/ranking that only adds latency.
function extraBody(cfg: LlmConfig): Record<string, unknown> {
  return cfg.provider === 'nvidia' ? { chat_template_kwargs: { enable_thinking: false } } : {};
}

export async function openaiJson(cfg: LlmConfig, req: JsonRequest): Promise<any> {
  const c = client(cfg);
  const capKey = `${cfg.baseUrl}|${cfg.model}`;
  const isOpenAIReasoning = cfg.provider === 'openai' && /^(o\d|gpt-5)/.test(cfg.model);
  const base: any = {
    model: cfg.model,
    messages: [{ role: 'user', content: req.prompt }],
    // OpenAI reasoning models only accept max_completion_tokens and the default temperature.
    ...(isOpenAIReasoning ? { max_completion_tokens: req.maxTokens ?? 16000 } : { max_tokens: req.maxTokens ?? 8000, temperature: 0.2 }),
    ...extraBody(cfg),
  };

  try {
    if (!noJsonSchema.has(capKey)) {
      try {
        const res = await c.chat.completions.create({
          ...base,
          response_format: { type: 'json_schema', json_schema: { name: req.name, strict: true, schema: req.schema } },
        });
        return parseJsonText(res.choices[0]?.message?.content || '');
      } catch (err) {
        if (!(err instanceof OpenAI.BadRequestError)) throw err;
        noJsonSchema.add(capKey); // this endpoint/model doesn't do json_schema; use the prompt-only path from now on
      }
    }
    const res = await c.chat.completions.create({
      ...base,
      messages: [{ role: 'user', content: `${req.prompt}\n\nRespond with a single JSON object matching this JSON Schema and nothing else:\n${JSON.stringify(req.schema)}` }],
    });
    return parseJsonText(res.choices[0]?.message?.content || '');
  } catch (err) {
    throw toLlmError(err);
  }
}

export async function openaiModels(cfg: LlmConfig): Promise<string[]> {
  try {
    const ids: string[] = [];
    for await (const m of client(cfg).models.list()) ids.push(m.id);
    return ids.sort();
  } catch (err) {
    throw toLlmError(err);
  }
}

export async function openaiEmbed(cfg: LlmConfig, texts: string[], kind: 'query' | 'document'): Promise<number[][]> {
  if (!cfg.embedModel) throw new LlmError('No embedding model for this provider', 'bad_request');
  const res = await client(cfg).embeddings.create({
    model: cfg.embedModel,
    input: texts,
    encoding_format: 'float',
    // NVIDIA retrieval embedders need to know whether the text is a query or a passage.
    ...(cfg.provider === 'nvidia' ? { input_type: kind === 'query' ? 'query' : 'passage', truncate: 'END' } : {}),
  } as any);
  return res.data.map(d => d.embedding as unknown as number[]);
}
