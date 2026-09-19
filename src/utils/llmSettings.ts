// Which AI engine powers search, chosen in the AI settings panel.
//   free: the server's own key (e.g. NVIDIA), optionally with a different model
//   own:  the user's key for OpenAI / Claude / Gemini / NVIDIA / any OpenAI-compatible endpoint
//   off:  no AI; local relevance ranking only (fastest)
// A user's key lives only in this browser (localStorage if "remember", else sessionStorage) and is
// sent to our server with each search, which uses it for that request and never stores it.

export type ProviderId = 'nvidia' | 'openai' | 'anthropic' | 'gemini' | 'openai_compatible';
export type LlmMode = 'free' | 'own' | 'off';

export interface LlmSettings {
  mode: LlmMode;
  freeModel: string;
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  rememberKey: boolean;
}

const PREFS_KEY = 'watchmatch_llm_settings';
const KEY_KEY = 'watchmatch_llm_key';

export const DEFAULT_SETTINGS: LlmSettings = {
  mode: 'free',
  freeModel: '',
  provider: 'openai',
  apiKey: '',
  model: '',
  baseUrl: '',
  rememberKey: false,
};

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string | null) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode); settings last for this page view only */
  }
}

let memoryKey = '';

export function loadLlmSettings(): LlmSettings {
  let prefs: Partial<LlmSettings> = {};
  try {
    prefs = JSON.parse(safeGet(localStorage, PREFS_KEY) || '{}');
  } catch {
    prefs = {};
  }
  const apiKey = safeGet(localStorage, KEY_KEY) || safeGet(sessionStorage, KEY_KEY) || memoryKey;
  return { ...DEFAULT_SETTINGS, ...prefs, apiKey };
}

export function saveLlmSettings(s: LlmSettings) {
  const { apiKey, ...prefs } = s;
  safeSet(localStorage, PREFS_KEY, JSON.stringify(prefs));
  memoryKey = apiKey;
  // The key only goes to persistent storage when the user explicitly asks to remember it.
  safeSet(localStorage, KEY_KEY, s.rememberKey && apiKey ? apiKey : null);
  safeSet(sessionStorage, KEY_KEY, !s.rememberKey && apiKey ? apiKey : null);
  window.dispatchEvent(new CustomEvent('watchmatch-llm-settings'));
}

// The `llm` field sent with every AI-backed request.
export function llmPayload(s: LlmSettings = loadLlmSettings()) {
  if (s.mode === 'off') return { provider: 'none' as const };
  if (s.mode === 'own' && s.apiKey) {
    return { provider: s.provider, apiKey: s.apiKey, model: s.model || undefined, baseUrl: s.baseUrl || undefined };
  }
  return { provider: 'default' as const, model: s.freeModel || undefined };
}

export function describeSettings(s: LlmSettings, freeLabel?: string): string {
  if (s.mode === 'off') return 'AI off';
  if (s.mode === 'own' && s.apiKey) return s.model ? s.model.split('/').pop()! : 'Your API key';
  return freeLabel || 'Free AI';
}
