import React, { useState, useEffect, useRef } from 'react';
import { Settings2, ChevronDown, Zap, Globe, Bot, Loader2, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useGraphStore } from '../store/useGraphStore';
import { fetchProviders, fetchModels, switchProvider } from '../lib/api';

/**
 * ModelSelector — Settings panel for AI provider/model selection.
 * Sits next to the chat input as a floating config panel.
 */
export default function ModelSelector() {
  const {
    activeProvider,
    activeModel,
    availableProviders,
    availableModels,
    setActiveProvider,
    setActiveModel,
    setAvailableProviders,
    setAvailableModels,
  } = useGraphStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Fetch providers + models on first open
  useEffect(() => {
    if (isOpen && availableProviders.length === 0) {
      loadProviders();
    }
  }, [isOpen]);

  async function loadProviders() {
    setIsLoading(true);
    try {
      const data = await fetchProviders();
      setAvailableProviders(data.providers);
      
      // Also fetch models for the active provider
      await loadModels(data.active);
    } catch (e) {
      toast.error('Failed to load providers');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadModels(providerName?: string) {
    try {
      const data = await fetchModels(providerName);
      setAvailableModels(data.models);
      
      // If no model selected, use provider default
      if (!activeModel) {
        setActiveModel(data.defaultModel);
      }
    } catch (e) {
      console.warn('Failed to load models:', e);
    }
  }

  async function handleProviderSwitch(providerName: string) {
    if (providerName === activeProvider) return;
    
    setIsSwitching(true);
    try {
      const result = await switchProvider(providerName);
      setActiveProvider(result.provider);
      setActiveModel(result.defaultModel);
      
      // Refresh providers list and models
      const data = await fetchProviders();
      setAvailableProviders(data.providers);
      await loadModels(result.provider);
      
      toast.success(`Provider switched to ${result.label}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to switch provider');
    } finally {
      setIsSwitching(false);
    }
  }

  function handleModelSelect(modelId: string) {
    setActiveModel(modelId);
    toast.success(`Model: ${modelId}`);
    
    // Background warmup — pre-fetch auth token + establish connection
    fetch('/api/ai/warmup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId }),
    }).catch(() => {}); // Best-effort, non-blocking
  }

  // Display label for the active model
  const displayModel = activeModel 
    ? (activeModel.length > 28 ? activeModel.slice(0, 28) + '…' : activeModel) 
    : 'auto';

  const activeProviderInfo = availableProviders.find(p => p.name === activeProvider);

  return (
    <div ref={panelRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface/80 border border-border-subtle text-text-dim hover:text-accent hover:border-accent transition-all text-[9px] uppercase tracking-widest font-bold cursor-pointer rounded"
        title="AI Model Settings"
      >
        <Settings2 size={12} />
        <span className="hidden sm:inline">{displayModel}</span>
        <ChevronDown size={10} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Floating Panel */}
      {isOpen && (
        <div 
          className="absolute bottom-full mb-2 right-0 w-[320px] bg-[#0a0b0f] border border-accent/30 rounded shadow-[0_0_30px_rgba(0,242,255,0.1)] z-[9999] overflow-hidden backdrop-blur-xl"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-accent" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-text-main">AI Configuration</span>
            </div>
            <div className="flex items-center gap-2">
              {isLoading && <Loader2 size={12} className="animate-spin text-accent" />}
              <button onClick={() => { setAvailableProviders([]); setAvailableModels([]); loadProviders(); }} className="text-text-dim hover:text-accent transition-colors cursor-pointer" title="Refresh providers & models">
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          {/* Provider Section */}
          <div className="px-4 py-3 border-b border-border-subtle">
            <div className="text-[8px] uppercase tracking-[0.25em] text-text-dim mb-2 font-bold">Provider</div>
            <div className="space-y-1">
              {availableProviders.length === 0 && !isLoading && (
                <div className="text-[10px] text-text-dim italic">Loading providers...</div>
              )}
              {availableProviders.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handleProviderSwitch(p.name)}
                  disabled={isSwitching || !!p.error}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-left transition-all cursor-pointer ${
                    p.name === activeProvider
                      ? 'bg-accent/10 border border-accent/40 text-accent'
                      : p.error
                        ? 'bg-surface/30 border border-red-500/20 text-text-dim opacity-50 cursor-not-allowed'
                        : 'bg-surface/50 border border-transparent hover:border-accent/20 text-text-dim hover:text-text-main'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {p.name === 'xai' ? (
                      <Zap size={12} className={p.name === activeProvider ? 'text-accent' : 'text-text-dim'} />
                    ) : p.name === 'openai' ? (
                      <Bot size={12} className={p.name === activeProvider ? 'text-accent' : 'text-text-dim'} />
                    ) : (
                      <Globe size={12} className={p.name === activeProvider ? 'text-accent' : 'text-text-dim'} />
                    )}
                  <div>
                      <div className="text-[11px] font-bold">{p.label}</div>
                      <div className="text-[8px] opacity-60">
                        {p.error
                          ? <span className="text-red-400">{p.status === 'blocked' ? 'Blocked' : p.status === 'offline' ? 'Offline' : 'Unavailable'}</span>
                          : p.defaultModel || 'auto'}
                      </div>
                    </div>
                  </div>
                  {p.name === activeProvider && <Check size={12} className="text-accent" />}
                  {p.error && <AlertTriangle size={12} className="text-red-500" />}
                </button>
              ))}
            </div>
          </div>

          {/* Model Section */}
          <div className="px-4 py-3 max-h-[240px] overflow-y-auto custom-scrollbar">
            <div className="text-[8px] uppercase tracking-[0.25em] text-text-dim mb-2 font-bold">
              Model — {activeProviderInfo?.label || activeProvider}
            </div>
            <div className="space-y-1">
              {availableModels.length === 0 && (
                <div className="text-[10px] text-text-dim italic">
                  {isLoading ? 'Fetching models...' : 'No models available'}
                </div>
              )}
              {availableModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleModelSelect(m.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-left transition-all cursor-pointer ${
                    m.id === activeModel
                      ? 'bg-accent/10 border border-accent/40 text-accent'
                      : 'bg-surface/50 border border-transparent hover:border-accent/20 text-text-dim hover:text-text-main'
                  }`}
                >
                  <span className="text-[10px] font-mono truncate pr-2">{m.name}</span>
                  {m.id === activeModel && <Check size={10} className="text-accent flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-border-subtle">
            <div className="text-[8px] text-text-dim opacity-50 text-center uppercase tracking-widest">
              Runtime model override • persisted locally
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
