import Anthropic from '@anthropic-ai/sdk';
import { JsonRequest, LlmConfig, LlmError } from './types.js';

// Claude via the official Anthropic SDK. JSON output uses structured outputs
// (output_config.format json_schema), so the reply is guaranteed to match the schema.

const clients = new Map<string, Anthropic>();
function client(cfg: LlmConfig): Anthropic {
  let c = clients.get(cfg.apiKey);
  if (!c) {
    c = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 1, timeout: 90_000 });
    clients.set(cfg.apiKey, c);
  }
  return c;
}

// Server-side refusal fallback is available on these models; other models run without it.
const SUPPORTS_FALLBACKS = new Set(['claude-opus-5', 'claude-fable-5-1']);

function toLlmError(err: unknown): LlmError {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return new LlmError('Anthropic rejected the API key', 'auth');
  if (err instanceof Anthropic.RateLimitError) return new LlmError('Anthropic rate limit reached', 'rate_limit');
  if (err instanceof Anthropic.NotFoundError) return new LlmError('Model not found for this Anthropic key', 'bad_request');
  if (err instanceof Anthropic.BadRequestError) return new LlmError(`Anthropic rejected the request: ${err.message}`, 'bad_request');
  if (err instanceof Anthropic.APIError) return new LlmError(`Anthropic API error ${err.status ?? ''}`.trim(), 'unavailable');
  if (err instanceof LlmError) return err;
  return new LlmError(`Could not reach Anthropic: ${(err as Error)?.message || err}`, 'unavailable');
}

export async function anthropicJson(cfg: LlmConfig, req: JsonRequest): Promise<any> {
  try {
    const response = await client(cfg).beta.messages.create({
      model: cfg.model,
      max_tokens: req.maxTokens ?? 16000,
      messages: [{ role: 'user', content: req.prompt }],
      output_config: { format: { type: 'json_schema', schema: req.schema } },
      ...(SUPPORTS_FALLBACKS.has(cfg.model)
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    });
    if (response.stop_reason === 'refusal') throw new LlmError('Claude declined this request', 'refusal');
    if (response.stop_reason === 'max_tokens') throw new LlmError('Claude ran out of output tokens', 'parse');
    const text = response.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
    return JSON.parse(text);
  } catch (err) {
    throw toLlmError(err);
  }
}

export async function anthropicModels(cfg: LlmConfig): Promise<string[]> {
  try {
    const ids: string[] = [];
    for await (const m of client(cfg).models.list()) ids.push(m.id);
    return ids;
  } catch (err) {
    throw toLlmError(err);
  }
}
