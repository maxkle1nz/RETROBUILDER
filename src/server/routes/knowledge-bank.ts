import { Router } from 'express';
import {
  DEFAULT_KNOWLEDGE_BANK_ROOT,
  createExternalKnowledgeEntry,
  persistKnowledgeBankSnapshot,
  readKnowledgeBankSnapshot,
} from '../knowledge-bank/knowledge-bank-store.js';
import {
  applyKnowledgeReviewToSnapshot,
  listKnowledgeReviewQueue,
  upsertKnowledgeReviewEntry,
} from '../knowledge-bank/knowledge-bank-review.js';
import type {
  ExternalKnowledgeEntryInput,
  KnowledgeBankSnapshot,
  KnowledgeReviewTransition,
  KnowledgeTrustLevel,
} from '../knowledge-bank/knowledge-bank-types.js';

function knowledgeRoot(rootDir?: string) {
  return rootDir || process.env.RETROBUILDER_KNOWLEDGE_BANK_ROOT || DEFAULT_KNOWLEDGE_BANK_ROOT;
}

function emptySnapshot(generatedAt = new Date().toISOString()): KnowledgeBankSnapshot {
  return {
    schemaVersion: 'knowledge-bank@1',
    generatedAt,
    documents: [],
    chunks: [],
  };
}

async function readSnapshotOrEmpty(rootDir: string) {
  try {
    return await readKnowledgeBankSnapshot(rootDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return emptySnapshot();
    throw error;
  }
}

function parseTrustLevels(value: unknown): KnowledgeTrustLevel[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is KnowledgeTrustLevel => typeof entry === 'string') as KnowledgeTrustLevel[];
  }
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.split(',').map((entry) => entry.trim()).filter(Boolean) as KnowledgeTrustLevel[];
}

function validateTransition(body: Record<string, unknown>): KnowledgeReviewTransition {
  const { trustLevel, reviewStatus, reviewer } = body;
  if (!trustLevel || typeof trustLevel !== 'string') {
    throw new Error("Missing 'trustLevel'.");
  }
  if (!reviewStatus || typeof reviewStatus !== 'string') {
    throw new Error("Missing 'reviewStatus'.");
  }
  if (!reviewer || typeof reviewer !== 'string') {
    throw new Error("Missing 'reviewer'.");
  }
  return {
    trustLevel: trustLevel as KnowledgeReviewTransition['trustLevel'],
    reviewStatus: reviewStatus as KnowledgeReviewTransition['reviewStatus'],
    reviewer,
    reviewedAt: typeof body.reviewedAt === 'string' ? body.reviewedAt : undefined,
    notes: typeof body.notes === 'string' ? body.notes : undefined,
    rightsBasis: typeof body.rightsBasis === 'string' ? body.rightsBasis : undefined,
    license: body.license && typeof body.license === 'object' ? body.license as KnowledgeReviewTransition['license'] : undefined,
  };
}

export function createKnowledgeBankRouter(options: { rootDir?: string } = {}) {
  const router = Router();

  router.get('/api/knowledge-bank/review', async (req, res) => {
    try {
      const rootDir = knowledgeRoot(options.rootDir);
      const snapshot = await readSnapshotOrEmpty(rootDir);
      const includeReviewed = req.query.includeReviewed === '1' || req.query.includeReviewed === 'true';
      const items = listKnowledgeReviewQueue(snapshot, {
        includeReviewed,
        trustLevels: parseTrustLevels(req.query.trustLevels),
      });
      res.json({
        rootDir,
        generatedAt: snapshot.generatedAt,
        totalDocuments: snapshot.documents.length,
        pendingCount: listKnowledgeReviewQueue(snapshot).length,
        items,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read Knowledge Bank review queue.' });
    }
  });

  router.post('/api/knowledge-bank/review', async (req, res) => {
    const { docId } = req.body || {};
    if (!docId || typeof docId !== 'string') {
      return res.status(400).json({ error: "Missing 'docId'." });
    }

    let transition: KnowledgeReviewTransition;
    try {
      transition = validateTransition(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid review transition.' });
    }

    try {
      const rootDir = knowledgeRoot(options.rootDir);
      const snapshot = await readSnapshotOrEmpty(rootDir);
      const result = applyKnowledgeReviewToSnapshot(snapshot, docId, transition);
      await persistKnowledgeBankSnapshot(result.snapshot, rootDir);
      res.json({
        rootDir,
        item: result.item,
        pendingCount: listKnowledgeReviewQueue(result.snapshot).length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to review Knowledge Bank source.';
      const status = message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.post('/api/knowledge-bank/ingest', async (req, res) => {
    try {
      const input = req.body as ExternalKnowledgeEntryInput;
      if (!input?.title || !input?.sourceKind || !input?.sourceUri || !input?.body) {
        return res.status(400).json({ error: "Missing 'title', 'sourceKind', 'sourceUri', or 'body'." });
      }
      const rootDir = knowledgeRoot(options.rootDir);
      const snapshot = await readSnapshotOrEmpty(rootDir);
      const entry = createExternalKnowledgeEntry(input);
      const nextSnapshot = upsertKnowledgeReviewEntry(snapshot, entry, entry.document.capturedAt);
      await persistKnowledgeBankSnapshot(nextSnapshot, rootDir);
      res.status(201).json({
        rootDir,
        item: listKnowledgeReviewQueue(nextSnapshot, { includeReviewed: true })
          .find((candidate) => candidate.docId === entry.document.docId),
        pendingCount: listKnowledgeReviewQueue(nextSnapshot).length,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to ingest Knowledge Bank source.' });
    }
  });

  return router;
}
