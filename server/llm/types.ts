// Shared types for the pluggable LLM layer.

export type ProviderId = 'nvidia' | 'openai' | 'anthropic' | 'gemini' | 'openai_compatible';

// Fully resolved config for one request. apiKey is never sent back to the browser.
export interface LlmConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;       // openai_compatible (and optional override for nvidia/openai)
  embedModel?: string;    // provider-specific embedding model, if the provider has one
  isServerDefault: boolean;
}

// JSON Schema (the subset shared by OpenAI strict mode, Anthropic structured outputs and Gemini):
// every object has additionalProperties: false and lists every property in `required`.
export type JsonSchema = Record<string, any>;

export interface JsonRequest {
  name: string;          // schema name, [a-z_]+
  prompt: string;
  schema: JsonSchema;
  maxTokens?: number;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
  baseUrl?: string;
  embedModel?: string;
  keyUrl: string;
  keyHint: string;
  needsBaseUrl?: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    // Super 120B: ~7s per ranking on the free tier; Ultra 550B was 20-77s and often overloaded.
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    embedModel: 'nvidia/nemotron-3-embed-1b',
    keyUrl: 'https://build.nvidia.com/settings/api-keys',
    keyHint: 'nvapi-…',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    defaultModel: 'gpt-5',
    baseUrl: 'https://api.openai.com/v1',
    embedModel: 'text-embedding-3-small',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-opus-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-3.6-flash',
    embedModel: 'gemini-embedding-001',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza…',
  },
  openai_compatible: {
    id: 'openai_compatible',
    label: 'Other (OpenAI-compatible)',
    defaultModel: '',
    keyUrl: '',
    keyHint: 'API key',
    needsBaseUrl: true,
  },
};

export class LlmError extends Error {
  constructor(message: string, public kind: 'auth' | 'rate_limit' | 'bad_request' | 'unavailable' | 'parse' | 'refusal' = 'unavailable') {
    super(message);
  }
}

// Pull a JSON object out of model text: strips <think> blocks and ``` fences if a provider ignored the format.
export function parseJsonText(text: string): any {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new LlmError('Model did not return valid JSON', 'parse');
  }
}
