import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchKnowledgeReviewQueue,
  ingestKnowledgeSource,
  reviewKnowledgeSource,
  type KnowledgeReviewQueueItem,
  type KnowledgeReviewQueueResponse,
  type KnowledgeSourceKind,
} from '../lib/api';

const SOURCE_KIND_OPTIONS: KnowledgeSourceKind[] = ['web-research', 'donor-doc', 'internal-doc', 'asset'];

function trustClasses(trustLevel: string) {
  if (trustLevel === 'verified') return 'border-[#50fa7b]/25 bg-[#50fa7b]/8 text-[#50fa7b]';
  if (trustLevel === 'staged') return 'border-[#ffcb6b]/25 bg-[#ffcb6b]/8 text-[#ffcb6b]';
  if (trustLevel === 'blocked') return 'border-[#ff5c7a]/25 bg-[#ff5c7a]/8 text-[#ff5c7a]';
  return 'border-[#8be9fd]/20 bg-[#8be9fd]/8 text-[#8be9fd]';
}

function formatTokens(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function QueueItemCard({
  item,
  busyDocId,
  onReview,
}: {
  item: KnowledgeReviewQueueItem;
  busyDocId: string | null;
  onReview: (item: KnowledgeReviewQueueItem, action: 'approve' | 'stage' | 'block') => void;
}) {
  const busy = busyDocId === item.docId;
  return (
    <div className="rounded-[18px] border border-border-subtle bg-black/25 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-accent">{item.sourceKind}</div>
          <div className="mt-1 text-sm font-semibold leading-5 text-text-main">{item.title}</div>
          <div className="mt-1 truncate text-[10px] text-text-dim">{item.sourceUri}</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] ${trustClasses(item.trustLevel)}`}>
          {item.trustLevel}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-[12px] border border-white/10 bg-white/5 p-2">
          <div className="text-[8px] uppercase tracking-widest text-text-dim">Chunks</div>
          <div className="mt-1 text-xs font-bold text-text-main">{item.chunkCount}</div>
        </div>
        <div className="rounded-[12px] border border-white/10 bg-white/5 p-2">
          <div className="text-[8px] uppercase tracking-widest text-text-dim">Tokens</div>
          <div className="mt-1 text-xs font-bold text-text-main">{formatTokens(item.tokenEstimate)}</div>
        </div>
        <div className="rounded-[12px] border border-white/10 bg-white/5 p-2">
          <div className="text-[8px] uppercase tracking-widest text-text-dim">Review</div>
          <div className="mt-1 text-xs font-bold text-text-main">{item.reviewStatus}</div>
        </div>
      </div>

      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 7).map((tag) => (
            <span key={tag} className="rounded-full bg-surface/70 px-2 py-1 text-[8px] uppercase tracking-widest text-text-dim">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-[12px] border border-white/10 bg-white/5 p-2 text-[10px] leading-5 text-text-dim">
        {item.rightsBasis}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={() => onReview(item, 'approve')}
          disabled={busy}
          className="rounded-[12px] border border-[#50fa7b]/25 bg-[#50fa7b]/8 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-[#50fa7b] disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => onReview(item, 'stage')}
          disabled={busy}
          className="rounded-[12px] border border-[#ffcb6b]/25 bg-[#ffcb6b]/8 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-[#ffcb6b] disabled:opacity-50"
        >
          Stage
        </button>
        <button
          onClick={() => onReview(item, 'block')}
          disabled={busy}
          className="rounded-[12px] border border-[#ff5c7a]/25 bg-[#ff5c7a]/8 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-[#ff5c7a] disabled:opacity-50"
        >
          Block
        </button>
      </div>
    </div>
  );
}

export default function KnowledgeBankPanel() {
  const [queue, setQueue] = useState<KnowledgeReviewQueueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [includeReviewed, setIncludeReviewed] = useState(false);
  const [showIngest, setShowIngest] = useState(false);
  const [sourceKind, setSourceKind] = useState<KnowledgeSourceKind>('web-research');
  const [title, setTitle] = useState('');
  const [sourceUri, setSourceUri] = useState('');
  const [tags, setTags] = useState('');
  const [body, setBody] = useState('');

  const items = queue?.items || [];
  const pendingItems = useMemo(
    () => items.filter((item) => item.reviewStatus !== 'approved' || item.trustLevel !== 'verified'),
    [items],
  );

  async function refreshQueue(nextIncludeReviewed = includeReviewed) {
    setLoading(true);
    try {
      const nextQueue = await fetchKnowledgeReviewQueue({ includeReviewed: nextIncludeReviewed });
      setQueue(nextQueue);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to load Knowledge Bank queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshQueue(includeReviewed);
  }, [includeReviewed]);

  async function handleReview(item: KnowledgeReviewQueueItem, action: 'approve' | 'stage' | 'block') {
    const transition = action === 'approve'
      ? {
          trustLevel: 'verified' as const,
          reviewStatus: 'approved' as const,
          rightsBasis: 'manual review approved source for internal Knowledge Bank retrieval',
          license: { allowed: true, notes: 'Approved from Retrobuilder review panel.' },
        }
      : action === 'stage'
        ? {
            trustLevel: 'staged' as const,
            reviewStatus: 'approved' as const,
            rightsBasis: 'manual review staged source for limited retrieval experiments',
            license: { allowed: true, notes: 'Staged from Retrobuilder review panel.' },
          }
        : {
            trustLevel: 'blocked' as const,
            reviewStatus: 'rejected' as const,
            rightsBasis: 'manual review blocked source from retrieval',
            license: { allowed: false, notes: 'Blocked from Retrobuilder review panel.' },
          };

    setBusyDocId(item.docId);
    try {
      await reviewKnowledgeSource({
        docId: item.docId,
        reviewer: 'retrobuilder-ui',
        reviewedAt: new Date().toISOString(),
        notes: `${action} from Knowledge Bank review panel`,
        ...transition,
      });
      toast.success(`Knowledge source ${action === 'approve' ? 'approved' : action === 'stage' ? 'staged' : 'blocked'}`);
      await refreshQueue();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to review source');
    } finally {
      setBusyDocId(null);
    }
  }

  async function handleIngest(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !sourceUri.trim() || !body.trim()) {
      toast.error('Title, source URI and body are required.');
      return;
    }

    setLoading(true);
    try {
      await ingestKnowledgeSource({
        title: title.trim(),
        sourceKind,
        sourceUri: sourceUri.trim(),
        body: body.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      });
      setTitle('');
      setSourceUri('');
      setTags('');
      setBody('');
      setShowIngest(false);
      toast.success('Knowledge source ingested into quarantine');
      await refreshQueue();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to ingest source');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[22px] border border-[#8be9fd]/15 bg-[radial-gradient(circle_at_0%_0%,rgba(139,233,253,0.14),transparent_36%),linear-gradient(180deg,rgba(12,18,34,0.95),rgba(7,9,16,0.96))] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#8be9fd]">
              <Database size={13} /> Knowledge Bank
            </div>
            <p className="mt-2 text-[11px] leading-5 text-text-dim">
              Review quarantined donors before they can influence SPECULAR, KOMPLETUS or future build guidance.
            </p>
          </div>
          <button
            onClick={() => refreshQueue()}
            disabled={loading}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-text-dim hover:border-[#8be9fd]/30 hover:text-[#8be9fd] disabled:opacity-50"
            title="Refresh queue"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-[16px] border border-white/10 bg-black/20 p-3">
            <div className="text-[8px] uppercase tracking-widest text-text-dim">Pending</div>
            <div className="mt-1 text-xl font-black text-[#8be9fd]">{queue?.pendingCount ?? 0}</div>
          </div>
          <div className="rounded-[16px] border border-white/10 bg-black/20 p-3">
            <div className="text-[8px] uppercase tracking-widest text-text-dim">Docs</div>
            <div className="mt-1 text-xl font-black text-text-main">{queue?.totalDocuments ?? 0}</div>
          </div>
          <div className="rounded-[16px] border border-white/10 bg-black/20 p-3">
            <div className="text-[8px] uppercase tracking-widest text-text-dim">Shown</div>
            <div className="mt-1 text-xl font-black text-text-main">{items.length}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowIngest((value) => !value)}
          className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-accent"
        >
          <UploadCloud size={12} /> {showIngest ? 'Hide Ingest' : 'Ingest Source'}
        </button>
        <button
          onClick={() => setIncludeReviewed((value) => !value)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest ${
            includeReviewed ? 'border-[#50fa7b]/25 bg-[#50fa7b]/8 text-[#50fa7b]' : 'border-white/10 bg-surface/60 text-text-dim'
          }`}
        >
          <CheckCircle2 size={12} /> Reviewed
        </button>
      </div>

      {showIngest && (
        <form onSubmit={handleIngest} className="rounded-[18px] border border-border-subtle bg-surface/70 p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-accent">Quarantine Ingest</div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="inspector-input"
            placeholder="Source title"
          />
          <select
            value={sourceKind}
            onChange={(event) => setSourceKind(event.target.value as KnowledgeSourceKind)}
            className="inspector-input"
          >
            {SOURCE_KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
          <input
            value={sourceUri}
            onChange={(event) => setSourceUri(event.target.value)}
            className="inspector-input"
            placeholder="https://source.example/doc"
          />
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            className="inspector-input"
            placeholder="tags, comma, separated"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="inspector-textarea min-h-[120px]"
            placeholder="Paste curated notes or donor guidance here. Raw sources stay quarantined until reviewed."
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[14px] border border-[#8be9fd]/25 bg-[#8be9fd]/10 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-[#8be9fd] disabled:opacity-50"
          >
            {loading ? 'Ingesting...' : 'Ingest to Quarantine'}
          </button>
        </form>
      )}

      {loading && !queue ? (
        <div className="flex items-center gap-2 rounded-[16px] border border-border-subtle bg-surface/70 p-4 text-[11px] text-text-dim">
          <Loader2 size={13} className="animate-spin text-accent" /> Loading Knowledge Bank queue...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[18px] border border-border-subtle bg-surface/70 p-4 text-[11px] leading-6 text-text-dim">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#50fa7b]">
            <CheckCircle2 size={12} /> Queue Clear
          </div>
          No sources need review right now. Ingest a donor note when you want to expand the RAG safely.
        </div>
      ) : (
        <div className="space-y-3">
          {pendingItems.length === 0 && includeReviewed && (
            <div className="rounded-[16px] border border-[#50fa7b]/20 bg-[#50fa7b]/5 p-3 text-[11px] text-[#50fa7b]">
              All visible sources are reviewed.
            </div>
          )}
          {items.map((item) => (
            <QueueItemCard key={item.docId} item={item} busyDocId={busyDocId} onReview={handleReview} />
          ))}
        </div>
      )}

      <div className="rounded-[16px] border border-[#ffcb6b]/20 bg-[#ffcb6b]/5 p-3">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#ffcb6b]">
          <ShieldAlert size={12} /> Safety Rule
        </div>
        <p className="mt-2 text-[11px] leading-5 text-text-dim">
          Default retrieval only uses `verified` sources. Quarantine is visible here for review, not for generation.
        </p>
        {queue?.pendingCount ? (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-[#ffcb6b]">
            <AlertTriangle size={11} /> {queue.pendingCount} source(s) still need a decision.
          </div>
        ) : null}
      </div>
    </div>
  );
}
