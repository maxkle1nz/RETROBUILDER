import React, { useEffect, useMemo, useState } from 'react';
import { fetchEnvConfig, fetchModels, saveEnvConfig, type EnvConfigState } from '../lib/api';
import { useGraphStore } from '../store/useGraphStore';
import { AlertTriangle, KeyRound, Loader2, Save, ShieldCheck, X, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

const SECRET_FIELDS = [
  'XAI_API_KEY',
  'OPENAI_API_KEY',
  'THEBRIDGE_HTTP_TOKEN',
  'PERPLEXITY_API_KEY',
  'SERPER_API_KEY',
  'APIFY_API_KEY',
  'NIMBLE_API_KEY',
] as const;

const TEXT_FIELDS = [
  'XAI_MODEL',
  'OPENAI_MODEL',
  'THEBRIDGE_URL',
  'THEBRIDGE_MODEL',
] as const;

function sectionLabel(key: string) {
  return key.replace(/_/g, ' ');
}

export default function EnvConfigModal() {
  const {
    showEnvConfigModal,
    closeEnvConfigModal,
    setAvailableProviders,
    setAvailableModels,
    setActiveProvider,
    setActiveModel,
  } = useGraphStore();
  const [state, setState] = useState<EnvConfigState | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!showEnvConfigModal) return;
    load();
  }, [showEnvConfigModal]);

  const activeProvider = useMemo(
    () => form.AI_PROVIDER || state?.config.AI_PROVIDER || 'xai',
    [form.AI_PROVIDER, state?.config.AI_PROVIDER],
  );

  async function load() {
    setLoading(true);
    try {
      const nextState = await fetchEnvConfig();
      setState(nextState);
      setForm({
        AI_PROVIDER: nextState.config.AI_PROVIDER || 'xai',
        XAI_MODEL: nextState.config.XAI_MODEL || '',
        OPENAI_MODEL: nextState.config.OPENAI_MODEL || '',
        THEBRIDGE_URL: nextState.config.THEBRIDGE_URL || '',
        THEBRIDGE_MODEL: nextState.config.THEBRIDGE_MODEL || '',
      });
      setAvailableProviders(nextState.providers);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load env config');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveEnvConfig(form);
      setState(saved);
      setAvailableProviders(saved.providers);
      const selectedProvider = saved.config.AI_PROVIDER || form.AI_PROVIDER || activeProvider;
      setActiveProvider(selectedProvider);
      try {
        const models = await fetchModels(selectedProvider);
        setAvailableModels(models.models);
        if (models.defaultModel) {
          setActiveModel(models.defaultModel);
        }
      } catch {
        // Provider may still be unavailable after save; keep current model state.
      }
      toast.success(`Saved to ${saved.targetFile}`);
      if (!saved.onboardingRequired) {
        closeEnvConfigModal();
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to save env config');
    } finally {
      setSaving(false);
    }
  }

  if (!showEnvConfigModal) return null;

  return (
    <div className="absolute inset-0 z-[130] bg-bg/85 backdrop-blur-md flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl bg-[#090b10] border border-accent/30 rounded-md overflow-hidden shadow-[0_0_40px_rgba(0,242,255,0.08)]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">Project Keys & Provider Config</div>
            <div className="text-sm text-text-dim mt-1">
              Save local provider credentials into the project env file used by RETROBUILDER.
              {state?.targetFile ? ` Target: ${state.targetFile}` : ''}
            </div>
          </div>
          <button onClick={closeEnvConfigModal} className="text-text-dim hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center gap-3 text-text-dim">
            <Loader2 size={16} className="animate-spin" />
            Loading env configuration...
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {state?.onboardingRequired && (
              <div className="bg-[#ffcb6b]/10 border border-[#ffcb6b]/30 rounded p-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-[#ffcb6b] mt-0.5" />
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-[#ffcb6b] font-bold mb-1">Onboarding Required</div>
                  <div className="text-sm text-text-main">
                    No healthy provider is currently available. Configure a valid key or a working local bridge to finish onboarding.
                  </div>
                </div>
              </div>
            )}

            {state?.providers?.length ? (
              <div className="grid md:grid-cols-3 gap-3">
                {state.providers.map((provider) => (
                  <div key={provider.name} className="bg-surface/60 border border-border-subtle rounded p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-text-main">{provider.label}</span>
                      <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 rounded ${
                        provider.status === 'ready'
                          ? 'bg-[#50fa7b]/10 text-[#50fa7b]'
                          : provider.status === 'blocked'
                            ? 'bg-[#ff5c7a]/10 text-[#ff5c7a]'
                            : 'bg-[#ffcb6b]/10 text-[#ffcb6b]'
                      }`}>
                        {provider.status || 'unknown'}
                      </span>
                    </div>
                    <div className="text-[10px] text-text-dim font-mono">
                      {provider.defaultModel || 'no default model'}
                    </div>
                    {provider.error && (
                      <div className="text-[10px] text-text-dim mt-2 break-words">{provider.error}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid md:grid-cols-2 gap-6">
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-accent">
                  <Zap size={14} />
                  <span className="text-[10px] uppercase tracking-widest font-bold">Core Provider</span>
                </div>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-text-dim">AI Provider</span>
                  <select
                    value={form.AI_PROVIDER || 'xai'}
                    onChange={(e) => setForm((prev) => ({ ...prev, AI_PROVIDER: e.target.value }))}
                    className="mt-2 w-full bg-bg border border-border-subtle rounded px-3 py-2 text-sm text-text-main outline-none focus:border-accent"
                  >
                    <option value="xai">xAI</option>
                    <option value="bridge">THE BRIDGE</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </label>

                {TEXT_FIELDS.map((key) => (
                  <label key={key} className="block">
                    <span className="text-[10px] uppercase tracking-widest text-text-dim">{sectionLabel(key)}</span>
                    <input
                      value={form[key] || ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="mt-2 w-full bg-bg border border-border-subtle rounded px-3 py-2 text-sm text-text-main outline-none focus:border-accent font-mono"
                      placeholder={key.includes('URL') ? 'http://127.0.0.1:7788/v1' : 'Optional override'}
                    />
                  </label>
                ))}
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2 text-accent">
                  <KeyRound size={14} />
                  <span className="text-[10px] uppercase tracking-widest font-bold">Secrets</span>
                </div>
                {SECRET_FIELDS.map((key) => (
                  <label key={key} className="block">
                    <span className="text-[10px] uppercase tracking-widest text-text-dim">{sectionLabel(key)}</span>
                    <input
                      type="password"
                      value={form[key] || ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="mt-2 w-full bg-bg border border-border-subtle rounded px-3 py-2 text-sm text-text-main outline-none focus:border-accent font-mono"
                      placeholder={state?.configured?.[key] ? 'Already configured — leave blank to keep' : 'Paste secret'}
                    />
                  </label>
                ))}
              </section>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-surface/60 border border-border-subtle rounded p-4 text-[11px] text-text-dim">
                <div className="flex items-center gap-2 text-accent mb-2">
                  <ShieldCheck size={14} />
                  Safety
                </div>
                Secrets are not read back into the UI. Leaving a secret field blank preserves the current value in the local env file.
              </div>
              <div className="bg-surface/60 border border-border-subtle rounded p-4 text-[11px] text-text-dim">
                Active provider after save: <span className="text-text-main font-mono">{activeProvider}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={closeEnvConfigModal}
                className="px-4 py-2 border border-border-subtle rounded text-[11px] uppercase tracking-widest text-text-dim hover:text-white hover:border-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-accent text-bg rounded text-[11px] uppercase tracking-widest font-bold hover:bg-white transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save project env
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
