import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Wand2,
  RefreshCw,
  Sparkles,
  Code2,
  MoveUp,
  MoveDown,
  Palette,
  LayoutTemplate,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  generateSpecularPreview,
  evaluateSpecularPreview,
  type NodeData,
  type SpecularCreateResponse,
  type SpecularPreviewArtifact,
  type SpecularPreviewBlock,
  type SpecularPreviewState,
} from '../lib/api';
import { applyPreviewStateToArtifact, movePreviewBlock, updatePreviewBlock } from '../lib/specular-preview';
import { useGraphStore } from '../store/useGraphStore';

function PreviewFrame({ artifact, previewState }: { artifact: SpecularPreviewArtifact; previewState: SpecularPreviewState }) {
  const shellTone = previewState.emphasis === 'editorial'
    ? 'from-[#f8eed8] via-[#fff7e6] to-[#f2d5ad]'
    : previewState.emphasis === 'dashboard'
      ? 'from-[#edf4e7] via-[#fff7e6] to-[#d9e4ce]'
      : 'from-[#fff7e6] via-[#ffe4bd] to-[#f3dec2]';
  const shellPadding = previewState.density === 'compact' ? 'p-3 gap-3' : 'p-4 gap-4';

  return (
    <div className={`rounded-[2rem] border border-[#17110a]/10 bg-gradient-to-br ${shellTone} ${shellPadding} shadow-[0_24px_70px_rgba(89,52,24,0.16)]`}>
      {artifact.blocks.map((block) => (
        <PreviewBlockCard key={block.id} block={block} previewState={previewState} />
      ))}
    </div>
  );
}

function PreviewBlockCard({ block, previewState }: { block: SpecularPreviewBlock; previewState: SpecularPreviewState }) {
  const dense = previewState.density === 'compact';
  const base = dense ? 'p-4 rounded-[22px]' : 'p-5 rounded-[24px]';

  if (block.kind === 'hero') {
    return (
      <section className={`${base} relative overflow-hidden bg-[#ffb000] shadow-[0_30px_90px_rgba(123,74,22,0.22)]`}>
        <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-[#17110a]/12" />
        <div className="pointer-events-none absolute -bottom-16 left-8 h-44 w-44 rounded-full border border-[#17110a]/15" />
        <div className="relative">
          {block.eyebrow && <div className="text-[10px] font-black uppercase tracking-[0.34em] text-[#b3471d]">{block.eyebrow}</div>}
          <h3 className="mt-3 max-w-3xl text-[clamp(2rem,8vw,4.8rem)] font-black leading-[0.86] tracking-[-0.08em] text-[#17110a]">{block.title}</h3>
          {block.body && <p className="mt-3 max-w-2xl text-sm leading-6 text-[#4a3829]">{block.body}</p>}
        </div>
      </section>
    );
  }

  if (block.kind === 'metrics') {
    return (
      <section className={`${base} border border-[#17110a]/10 bg-[#f3dec2] shadow-[0_24px_70px_rgba(89,52,24,0.12)]`}>
        <div className="text-xl font-black tracking-[-0.04em] text-[#17110a]">{block.title}</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(block.items || []).map((item) => (
            <div key={item} className="rounded-[1.4rem] border border-[#17110a]/10 bg-[#fffaf0] px-4 py-3 text-sm font-medium leading-5 text-[#24170e] shadow-[0_14px_34px_rgba(67,38,18,0.08)]">{item}</div>
          ))}
        </div>
      </section>
    );
  }

  if (block.kind === 'cta') {
    return (
      <section className={`${base} bg-[#17110a] text-[#fff7e6] shadow-[0_28px_80px_rgba(23,17,10,0.28)]`}>
        <div className="text-2xl font-black tracking-[-0.05em]">{block.title}</div>
        {block.body && <p className="mt-3 max-w-2xl text-sm leading-6 text-[#f3dec2]">{block.body}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="rounded-full bg-[#ffb000] px-5 py-3 text-sm font-black text-[#17110a] shadow-[0_12px_30px_rgba(255,176,0,0.26)]">Primary action</button>
          <button className="rounded-full border border-[#fff7e6]/25 px-5 py-3 text-sm font-bold text-[#fff7e6]">Secondary action</button>
        </div>
      </section>
    );
  }

  return (
    <section className={`${base} border ${block.kind === 'detail' ? 'border-[#b3471d]/20 bg-[#ffe0bd]' : 'border-[#17110a]/10 bg-[#fff7e6]'}`}>
      <div className="text-xl font-black tracking-[-0.04em] text-[#17110a]">{block.title}</div>
      {block.body && <p className="mt-2 text-sm leading-6 text-[#4a3829]">{block.body}</p>}
      {block.items && block.items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {block.items.map((item) => (
            <li key={item} className="rounded-[1.4rem] border border-[#17110a]/10 bg-[#fffaf0] px-4 py-3 text-sm font-medium leading-5 text-[#24170e] shadow-[0_14px_34px_rgba(67,38,18,0.08)]">{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SpecularCreateEditor({
  node,
  updateNode,
  typeColor,
}: {
  node: NodeData;
  updateNode: (id: string, updates: Partial<NodeData>) => void;
  typeColor: string;
}) {
  const {
    activeSessionId,
    activeSessionName,
    activeSessionSource,
    graphData,
    manifesto,
    architecture,
    projectContext,
    importMeta,
  } = useGraphStore();
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [knowledgeContext, setKnowledgeContext] = useState<SpecularCreateResponse['knowledgeContextBundle'] | null>(null);
  const lastVerdictSignature = useRef('');

  const currentDraft = useMemo(
    () => ({
      name: activeSessionName,
      source: activeSessionSource,
      graph: graphData,
      manifesto,
      architecture,
      projectContext,
      importMeta,
    }),
    [activeSessionName, activeSessionSource, graphData, manifesto, architecture, projectContext, importMeta],
  );

  const previewState = node.previewState || { density: 'comfortable', emphasis: node.type === 'frontend' ? 'product' : 'dashboard' };
  const userFacing = node.type === 'frontend' || node.type === 'external';
  const verdictSignature = useMemo(
    () => JSON.stringify({
      nodeId: node.id,
      selectedVariantId: node.selectedVariantId || '',
      selectedReferenceIds: node.selectedReferenceIds || [],
      previewState,
      previewArtifact: node.previewArtifact
        ? {
            componentName: node.previewArtifact.componentName,
            screenType: node.previewArtifact.screenType,
            blocks: node.previewArtifact.blocks,
          }
        : null,
    }),
    [node.id, node.selectedVariantId, node.selectedReferenceIds, node.previewArtifact, previewState],
  );

  function pendingVerdict() {
    return {
      status: 'pending' as const,
      score: node.designVerdict?.score || 0,
      findings: node.designVerdict?.findings || [],
      evidence: node.designVerdict?.evidence || [],
    };
  }

  function applyPayload(payload: SpecularCreateResponse) {
    setKnowledgeContext(payload.knowledgeContextBundle);
    lastVerdictSignature.current = JSON.stringify({
      nodeId: payload.nodeId,
      selectedVariantId: payload.selectedVariantId,
      selectedReferenceIds: payload.selectedReferenceIds,
      previewState: payload.previewState,
      previewArtifact: {
        componentName: payload.previewArtifact.componentName,
        screenType: payload.previewArtifact.screenType,
        blocks: payload.previewArtifact.blocks,
      },
    });
    updateNode(node.id, {
      designProfile: payload.designProfile,
      referenceCandidates: payload.referenceCandidates,
      selectedReferenceIds: payload.selectedReferenceIds,
      selectedProductDnaPackIds: payload.selectedProductDnaPackIds,
      activeProductDnaContract: payload.activeProductDnaContract,
      variantCandidates: payload.variantCandidates,
      selectedVariantId: payload.selectedVariantId,
      previewArtifact: payload.previewArtifact,
      previewState: payload.previewState,
      designVerdict: payload.designVerdict,
    });
  }

  useEffect(() => {
    if (!userFacing || !node.previewArtifact) {
      return;
    }
    if (busy || verdictSignature === lastVerdictSignature.current) {
      return;
    }

    const timer = window.setTimeout(async () => {
      lastVerdictSignature.current = verdictSignature;
      try {
        const payload = await evaluateSpecularPreview(activeSessionId, node.id, currentDraft);
        applyPayload(payload);
      } catch (error) {
        console.error(error);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [userFacing, node.previewArtifact, busy, verdictSignature, activeSessionId, node.id, currentDraft]);

  async function handleGenerate() {
    setBusy(true);
    try {
      const payload = await generateSpecularPreview(activeSessionId, node.id, currentDraft);
      applyPayload(payload);
      toast.success(`UIX generated for ${node.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate UIX preview');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerdict() {
    setBusy(true);
    try {
      const payload = await evaluateSpecularPreview(activeSessionId, node.id, currentDraft);
      applyPayload(payload);
      toast.success(`21st verdict refreshed for ${node.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to evaluate UIX preview');
    } finally {
      setBusy(false);
    }
  }

  function persistArtifact(nextArtifact: SpecularPreviewArtifact, nextState = previewState) {
    const hydrated = applyPreviewStateToArtifact(nextArtifact, nextState);
    updateNode(node.id, {
      designProfile: '21st',
      previewArtifact: hydrated,
      previewState: nextState,
      designVerdict: pendingVerdict(),
    });
  }

  function selectVariant(variantId: string) {
    const variant = node.variantCandidates?.find((candidate) => candidate.id === variantId);
    if (!variant) return;
    updateNode(node.id, {
      designProfile: '21st',
      selectedVariantId: variant.id,
      selectedReferenceIds: variant.referenceIds,
      previewArtifact: applyPreviewStateToArtifact(variant.previewArtifact, previewState),
      previewState,
      designVerdict: pendingVerdict(),
    });
  }

  function toggleReference(referenceId: string) {
    const current = new Set(node.selectedReferenceIds || []);
    if (current.has(referenceId)) {
      current.delete(referenceId);
    } else {
      current.add(referenceId);
    }
    updateNode(node.id, {
      selectedReferenceIds: Array.from(current),
      designVerdict: pendingVerdict(),
    });
  }

  function updateState(patch: Partial<SpecularPreviewState>) {
    const nextState: SpecularPreviewState = { ...previewState, ...patch };
    updateNode(node.id, {
      previewState: nextState,
      designVerdict: pendingVerdict(),
    });
    if (node.previewArtifact) {
      persistArtifact(node.previewArtifact, nextState);
    }
  }

  function updateBlock(blockId: string, patch: Partial<SpecularPreviewBlock>) {
    if (!node.previewArtifact) return;
    persistArtifact(updatePreviewBlock(node.previewArtifact, blockId, patch));
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    if (!node.previewArtifact) return;
    persistArtifact(movePreviewBlock(node.previewArtifact, blockId, direction));
  }

  if (!userFacing) {
    return (
      <div className="p-4 space-y-3">
        <div className="rounded-[12px] border border-border-subtle bg-surface/60 p-4 text-[10px] uppercase tracking-[0.16em] text-text-dim">
          UIX authoring is only enabled for frontend and user-facing external nodes.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,18,34,0.96),rgba(7,9,16,0.96))] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-accent font-bold">
              <Sparkles size={12} /> SPECULAR CREATE
            </div>
            <h3 className="mt-2 text-sm font-semibold text-white">21st-powered live UIX preview</h3>
            <p className="mt-2 text-[11px] leading-5 text-text-dim">
              Generate a contract-bound interface for this node, compare multiple 21st-inspired directions, then edit the live surface directly.
            </p>
          </div>
          <div className="rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.18em]" style={{ borderColor: `${typeColor}55`, color: typeColor }}>
            {node.designProfile || '21st'}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={handleGenerate}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
          >
            <Wand2 size={12} /> {node.previewArtifact ? 'Regenerate UIX' : 'Generate UIX'}
          </button>
          <button
            onClick={handleVerdict}
            disabled={busy || !node.previewArtifact}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-text-main transition-colors hover:border-accent/30 hover:text-accent disabled:opacity-60"
          >
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Re-run 21st verdict
          </button>
        </div>
      </div>

      {node.designVerdict && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[14px] border border-border-subtle bg-surface/70 p-3">
            <div className="text-[9px] uppercase tracking-[0.18em] text-text-dim">Design score</div>
            <div className={`mt-2 text-2xl font-semibold ${node.designVerdict.status === 'passed' ? 'text-[#50fa7b]' : 'text-[#ffcb6b]'}`}>
              {node.designVerdict.score}
            </div>
          </div>
          <div className="rounded-[14px] border border-border-subtle bg-surface/70 p-3">
            <div className="text-[9px] uppercase tracking-[0.18em] text-text-dim">Gate status</div>
            <div className={`mt-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] ${node.designVerdict.status === 'passed' ? 'text-[#50fa7b]' : 'text-[#ffcb6b]'}`}>
              {node.designVerdict.status === 'passed' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {node.designVerdict.status}
            </div>
          </div>
        </div>
      )}

      {node.referenceCandidates && node.referenceCandidates.length > 0 && (
        <div className="rounded-[16px] border border-border-subtle bg-surface/70 p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">
            <Palette size={12} /> 21st references
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {node.referenceCandidates.map((reference) => {
              const active = (node.selectedReferenceIds || []).includes(reference.id);
              return (
                <button
                  key={reference.id}
                  onClick={() => toggleReference(reference.id)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${active ? 'border-accent/40 bg-accent/10 text-accent' : 'border-white/10 bg-black/30 text-text-dim hover:border-accent/30 hover:text-white'}`}
                  title={reference.rationale}
                >
                  {reference.category}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {node.activeProductDnaContract?.packBindings?.length ? (
        <div className="rounded-[16px] border border-accent/20 bg-accent/5 p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-accent font-bold">
            <Palette size={12} /> Product DNA
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {node.activeProductDnaContract.packBindings.map((binding) => (
              <span key={`${binding.id}@${binding.version}`} className="rounded-full border border-accent/25 bg-black/30 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-accent">
                {binding.family}: {binding.title}
              </span>
            ))}
          </div>
          {node.activeProductDnaContract.receipts.required.length > 0 && (
            <div className="mt-3 text-[11px] leading-5 text-text-dim">
              Required receipts: {node.activeProductDnaContract.receipts.required.slice(0, 6).join(', ')}
            </div>
          )}
        </div>
      ) : null}

      {knowledgeContext?.evidence?.length ? (
        <div className="rounded-[16px] border border-[#ffcb6b]/20 bg-[#ffcb6b]/5 p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#ffcb6b] font-bold">
            <Sparkles size={12} /> Knowledge Bank
          </div>
          <div className="mt-2 text-[11px] leading-5 text-text-dim">
            Receipt: {knowledgeContext.receipt.receiptId} · Evidence chunks: {knowledgeContext.evidence.length}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {knowledgeContext.evidence.slice(0, 5).map((entry) => (
              <span key={entry.chunkId} className="rounded-full border border-[#ffcb6b]/20 bg-black/30 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#ffcb6b]">
                {entry.trustLevel}: {entry.title}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {node.variantCandidates && node.variantCandidates.length > 0 && (
        <div className="rounded-[16px] border border-border-subtle bg-surface/70 p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">
            <LayoutTemplate size={12} /> Variants
          </div>
          <div className="mt-3 space-y-2">
            {node.variantCandidates.map((variant) => {
              const active = node.selectedVariantId === variant.id;
              return (
                <button
                  key={variant.id}
                  onClick={() => selectVariant(variant.id)}
                  className={`w-full rounded-[14px] border px-3 py-3 text-left transition-colors ${active ? 'border-accent/40 bg-accent/10' : 'border-white/10 bg-black/30 hover:border-accent/30'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-white">{variant.label}</div>
                      <div className="mt-1 text-[11px] text-text-dim">{variant.description}</div>
                    </div>
                    <div className={`text-[10px] font-bold ${variant.designVerdict.status === 'passed' ? 'text-[#50fa7b]' : 'text-[#ffcb6b]'}`}>
                      {variant.designVerdict.score}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[16px] border border-border-subtle bg-surface/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">Density</div>
          <div className="mt-3 flex gap-2">
            {(['comfortable', 'compact'] as const).map((density) => (
              <button
                key={density}
                onClick={() => updateState({ density })}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${previewState.density === density ? 'border-accent/40 bg-accent/10 text-accent' : 'border-white/10 text-text-dim'}`}
              >
                {density}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-[16px] border border-border-subtle bg-surface/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">Emphasis</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['editorial', 'product', 'dashboard'] as const).map((emphasis) => (
              <button
                key={emphasis}
                onClick={() => updateState({ emphasis })}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${previewState.emphasis === emphasis ? 'border-accent/40 bg-accent/10 text-accent' : 'border-white/10 text-text-dim'}`}
              >
                {emphasis}
              </button>
            ))}
          </div>
        </div>
      </div>

      {node.previewArtifact ? (
        <>
          <div className="rounded-[18px] border border-border-subtle bg-surface/70 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">Live preview</div>
                <div className="mt-1 text-[11px] text-text-dim">{node.previewArtifact.summary}</div>
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-accent">{node.previewArtifact.screenType}</div>
            </div>
            <PreviewFrame artifact={node.previewArtifact} previewState={previewState} />
          </div>

          <div className="rounded-[18px] border border-border-subtle bg-surface/70 p-4 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-text-dim font-bold">Visual editor</div>
            {node.previewArtifact.blocks.map((block, index) => (
              <div key={block.id} className="rounded-[14px] border border-white/10 bg-black/25 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-accent font-bold">{block.kind}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveBlock(block.id, -1)} disabled={index === 0} className="rounded border border-white/10 p-1 text-text-dim disabled:opacity-30">
                      <MoveUp size={11} />
                    </button>
                    <button onClick={() => moveBlock(block.id, 1)} disabled={index === node.previewArtifact!.blocks.length - 1} className="rounded border border-white/10 p-1 text-text-dim disabled:opacity-30">
                      <MoveDown size={11} />
                    </button>
                  </div>
                </div>
                <input
                  value={block.title}
                  onChange={(event) => updateBlock(block.id, { title: event.target.value })}
                  className="inspector-input"
                />
                <textarea
                  value={block.body || ''}
                  onChange={(event) => updateBlock(block.id, { body: event.target.value })}
                  className="inspector-textarea min-h-[72px]"
                  placeholder="Optional block copy"
                />
                {block.items && (
                  <textarea
                    value={block.items.join('\n')}
                    onChange={(event) => updateBlock(block.id, { items: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })}
                    className="inspector-textarea min-h-[72px] font-mono text-[9.5px]"
                    placeholder="One line per item"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="rounded-[18px] border border-border-subtle bg-surface/70 p-4">
            <button
              onClick={() => setShowCode((value) => !value)}
              className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-accent"
            >
              <Code2 size={12} /> {showCode ? 'Hide TSX' : 'Show TSX'}
            </button>
            {showCode && (
              <pre className="mt-3 max-h-[340px] overflow-auto rounded-[14px] border border-white/10 bg-black/35 p-3 text-[10px] leading-5 text-slate-200">{node.previewArtifact.tsx}</pre>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-[16px] border border-dashed border-border-subtle bg-surface/60 p-4 text-[11px] text-text-dim leading-6">
          Generate the first live preview to attach a 21st-inspired interface to this node.
        </div>
      )}

      {node.designVerdict?.findings && node.designVerdict.findings.length > 0 && (
        <div className="rounded-[16px] border border-[#ffcb6b]/20 bg-[#ffcb6b]/8 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#ffcb6b] font-bold">Current findings</div>
          <ul className="mt-3 space-y-2 text-[11px] text-text-main">
            {node.designVerdict.findings.map((finding) => (
              <li key={finding} className="flex items-start gap-2">
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[#ffcb6b]" />
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
