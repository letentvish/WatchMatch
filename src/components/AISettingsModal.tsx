import React, { useEffect, useState } from 'react';
import { X, Sparkles, KeyRound, ZapOff, Loader2, CheckCircle2, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { LlmSettings, LlmMode, ProviderId, loadLlmSettings, saveLlmSettings, llmPayload } from '../utils/llmSettings';

interface ProviderOption {
  id: ProviderId;
  label: string;
  defaultModel: string;
  keyUrl: string;
  keyHint: string;
  needsBaseUrl: boolean;
  semantic: boolean;
}

interface ServerConfig {
  free: { available: boolean; provider?: string; providerLabel?: string; model?: string; semantic?: boolean };
  providers: ProviderOption[];
}

interface Props {
  onClose: () => void;
}

type TestState = { status: 'idle' } | { status: 'running' } | { status: 'ok'; ms: number; reply: string; semantic: boolean } | { status: 'error'; message: string };

export default function AISettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<LlmSettings>(loadLlmSettings);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelsState, setModelsState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  const provider = config?.providers.find(p => p.id === settings.provider);
  const update = (patch: Partial<LlmSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
    setTest({ status: 'idle' });
  };

  useEffect(() => {
    fetch('/api/llm/config')
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig({ free: { available: false }, providers: [] }));
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Model list changes whenever the engine (free vs. provider/key) changes.
  useEffect(() => {
    setModels([]);
    setModelsState({ loading: false });
  }, [settings.mode, settings.provider, settings.apiKey, settings.baseUrl]);

  const loadModels = async () => {
    setModelsState({ loading: true });
    try {
      const res = await fetch('/api/llm/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llm: llmPayload({ ...settings, model: '', freeModel: '' }) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load models');
      setModels(data.models || []);
      setModelsState({ loading: false });
    } catch (err: any) {
      setModelsState({ loading: false, error: err.message });
    }
  };

  const runTest = async () => {
    setTest({ status: 'running' });
    try {
      const res = await fetch('/api/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llm: llmPayload(settings) }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Connection failed');
      setTest({ status: 'ok', ms: data.ms, reply: data.reply, semantic: data.semantic });
    } catch (err: any) {
      setTest({ status: 'error', message: err.message });
    }
  };

  const save = () => {
    saveLlmSettings(settings);
    onClose();
  };

  const ownIncomplete = settings.mode === 'own' && (!settings.apiKey || (provider?.needsBaseUrl && (!settings.baseUrl || !settings.model)));

  // Plain render helpers (not components) so inputs keep focus while typing.
  const modeCard = (mode: LlmMode, icon: React.ReactNode, title: string, subtitle: string, disabled?: boolean) => (
    <button
      key={mode}
      type="button"
      disabled={disabled}
      onClick={() => update({ mode })}
      className={`text-left p-4 rounded-2xl border transition-all ${
        settings.mode === mode ? 'border-red-500 bg-red-500/10 shadow-[0_0_20px_rgba(229,9,20,0.25)]' : 'border-white/10 bg-white/5 hover:border-white/25'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex items-center gap-2 text-white font-bold text-sm">{icon}{title}</div>
      <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{subtitle}</p>
    </button>
  );

  const modelPicker = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <div className="space-y-2">
      <div className="flex gap-2">
        {models.length > 0 ? (
          <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className="flex-1 min-w-0 bg-black/60 border border-white/10 text-white text-xs rounded-lg px-3 py-2.5"
          >
            <option value="">{placeholder}</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-black/60 border border-white/10 text-white text-xs rounded-lg px-3 py-2.5 font-mono"
          />
        )}
        <button
          type="button"
          onClick={loadModels}
          disabled={modelsState.loading || (settings.mode === 'own' && !settings.apiKey)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white disabled:opacity-40"
        >
          {modelsState.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {models.length ? `${models.length} models` : 'Load models'}
        </button>
      </div>
      {modelsState.error && <p className="text-xs text-red-400">{modelsState.error}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-wm-card border border-white/10 rounded-3xl p-6 space-y-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="ai-settings-title" className="text-lg font-extrabold text-white font-heading">AI engine</h2>
            <p className="text-xs text-gray-400 mt-1">Understands what you feel like watching and ranks the matches. Movie data always comes from TMDB.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {modeCard(
            'free',
            <Sparkles className="w-4 h-4 text-red-500" />,
            'Free AI',
            config?.free.available ? `${config.free.providerLabel}, provided by WatchMatch.` : 'Not configured on this server.',
            config ? !config.free.available : false,
          )}
          {modeCard('own', <KeyRound className="w-4 h-4 text-red-500" />, 'My own API key', 'ChatGPT, Claude, Gemini, NVIDIA or any OpenAI-compatible API.')}
          {modeCard('off', <ZapOff className="w-4 h-4 text-red-500" />, 'No AI', 'Fastest. Keyword and relevance matching only.')}
        </div>

        {settings.mode === 'free' && config?.free.available && (
          <div className="space-y-2">
            <label className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">Model</label>
            {modelPicker(settings.freeModel, v => update({ freeModel: v }), `Default: ${config.free.model}`)}
            <p className="text-xs text-gray-500">Shared free tier with an hourly limit per visitor. Larger models can be much slower.</p>
          </div>
        )}

        {settings.mode === 'own' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="ai-provider" className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">Provider</label>
              <select
                id="ai-provider"
                value={settings.provider}
                onChange={e => update({ provider: e.target.value as ProviderId, model: '' })}
                className="w-full bg-black/60 border border-white/10 text-white text-sm rounded-lg px-3 py-2.5"
              >
                {(config?.providers || []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            {provider?.needsBaseUrl && (
              <div className="space-y-2">
                <label htmlFor="ai-base-url" className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">Base URL</label>
                <input
                  id="ai-base-url"
                  value={settings.baseUrl}
                  onChange={e => update({ baseUrl: e.target.value.trim() })}
                  placeholder="https://api.groq.com/openai/v1"
                  className="w-full bg-black/60 border border-white/10 text-white text-sm rounded-lg px-3 py-2.5 font-mono"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="ai-key" className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">API key</label>
                {provider?.keyUrl && (
                  <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                    Get a key <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                id="ai-key"
                type="password"
                autoComplete="off"
                value={settings.apiKey}
                onChange={e => update({ apiKey: e.target.value.trim() })}
                placeholder={provider?.keyHint || 'API key'}
                className="w-full bg-black/60 border border-white/10 text-white text-sm rounded-lg px-3 py-2.5 font-mono"
              />
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input type="checkbox" checked={settings.rememberKey} onChange={e => update({ rememberKey: e.target.checked })} />
                Remember on this device (otherwise it is cleared when you close the tab)
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">Model</label>
              {modelPicker(settings.model, v => update({ model: v }), provider?.defaultModel ? `Default: ${provider.defaultModel}` : 'Model id')}
            </div>

            {provider && !provider.semantic && (
              <p className="text-xs text-gray-500">This provider has no embedding model, so mood matching uses keywords instead of meaning. The AI still ranks the results.</p>
            )}

            <p className="text-xs text-gray-500 leading-relaxed">
              Your key stays in this browser and is sent only with your own searches. The WatchMatch server uses it for that request and never stores or logs it.
            </p>
          </div>
        )}

        {settings.mode !== 'off' && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runTest}
              disabled={test.status === 'running' || !!ownIncomplete}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white disabled:opacity-40"
            >
              {test.status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Test connection
            </button>
            {test.status === 'ok' && (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <CheckCircle2 className="w-4 h-4" /> Working · {(test.ms / 1000).toFixed(1)}s{test.semantic ? ' · meaning-based matching on' : ''}
              </span>
            )}
            {test.status === 'error' && (
              <span className="flex items-center gap-1.5 text-xs text-red-400"><AlertTriangle className="w-4 h-4" /> {test.message}</span>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white">Cancel</button>
          <button
            onClick={save}
            disabled={!!ownIncomplete}
            className="px-5 py-2 rounded-lg text-sm font-bold bg-wm-accent hover:bg-wm-accent-hover text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
