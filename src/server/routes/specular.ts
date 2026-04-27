import { Router } from 'express';
import { createEphemeralSession, resolveSessionPayload } from '../session-payload.js';
import { loadSession } from '../session-store.js';
import { buildSpecularCreatePayload } from '../specular-create/specular-service.js';
import type { SpecularCreatePayload, SpecularPreviewBlock } from '../specular-create/specular-types.js';
import { GraphDataSchema } from '../validation.js';

function findNode(session: { graph: { nodes: any[] } }, nodeId: string) {
  if (!Array.isArray(session.graph?.nodes)) {
    return null;
  }
  return session.graph.nodes.find((node) => node.id === nodeId) || null;
}

async function resolveSpecularSession(sessionId: string | undefined, draft: any) {
  if (sessionId && typeof sessionId === 'string') {
    return resolveSessionPayload(sessionId, draft);
  }
  if (draft) {
    const graph = GraphDataSchema.parse(draft.graph || { nodes: [], links: [] });
    return createEphemeralSession({
      id: 'specular-preview',
      name: draft.name || 'Specular Preview',
      source: draft.source || 'manual',
      graph,
      manifesto: draft.manifesto || '',
      architecture: draft.architecture || '',
      projectContext: draft.projectContext || '',
      importMeta: draft.importMeta,
    });
  }
  return null;
}

function escapeHtml(value: unknown) {
  const entities: Record<string, string> = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return String(value ?? '').replace(/[<>&"']/g, (char) => entities[char] || char);
}

function escapeJsonForInlineScript(value: unknown) {
  const json = JSON.stringify(value) ?? 'null';
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function renderShowcaseItems(items: string[] | undefined) {
  if (!items?.length) return '';
  return `<ul class="rb-items">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderShowcaseSummary(payload: SpecularCreatePayload) {
  const heroBlock = payload.previewArtifact.blocks.find((block) => block.kind === 'hero');
  const detailBlock = payload.previewArtifact.blocks.find((block) => block.kind === 'detail');
  const source = heroBlock?.body || detailBlock?.body || payload.previewArtifact.blocks[0]?.body;
  if (source) {
    return source;
  }

  return 'A polished, user-facing surface generated from the product contract and ready for visual QA.';
}

function renderShowcaseBlock(block: SpecularPreviewBlock) {
  const eyebrow = block.eyebrow ? `<p class="rb-eyebrow">${escapeHtml(block.eyebrow)}</p>` : '';
  const body = block.body ? `<p class="rb-body">${escapeHtml(block.body)}</p>` : '';

  if (block.kind === 'hero') {
    return `
      <section class="rb-block rb-hero">
        <div class="rb-orb rb-orb-a"></div>
        <div class="rb-orb rb-orb-b"></div>
        <div class="rb-block-content">
          ${eyebrow}
          <h2>${escapeHtml(block.title)}</h2>
          ${body}
        </div>
      </section>
    `;
  }

  if (block.kind === 'metrics') {
    return `
      <section class="rb-block rb-metrics">
        ${eyebrow}
        <h3>${escapeHtml(block.title)}</h3>
        ${renderShowcaseItems(block.items)}
      </section>
    `;
  }

  if (block.kind === 'cta') {
    return `
      <section class="rb-block rb-cta">
        ${eyebrow}
        <h3>${escapeHtml(block.title)}</h3>
        ${body}
        <div class="rb-actions">
          <span>Primary action</span>
          <span>Secondary action</span>
        </div>
      </section>
    `;
  }

  return `
    <section class="rb-block ${block.kind === 'detail' ? 'rb-detail' : 'rb-list'}">
      ${eyebrow}
      <h3>${escapeHtml(block.title)}</h3>
      ${body}
      ${renderShowcaseItems(block.items)}
    </section>
  `;
}

function renderShowcaseSurface(payload: SpecularCreatePayload) {
  const blocks = payload.previewArtifact.blocks.map(renderShowcaseBlock).join('');
  const verdict = payload.designVerdict;
  const references = payload.referenceCandidates
    .filter((reference) => payload.selectedReferenceIds.includes(reference.id))
    .map((reference) => reference.patternId || reference.title)
    .slice(0, 3)
    .join(' / ');
  const productDnaPacks = payload.activeProductDnaContract.packBindings
    .map((binding) => binding.id)
    .slice(0, 4)
    .join(' / ');
  const knowledgeEvidence = payload.knowledgeContextBundle.evidence;
  const knowledgeTopSources = knowledgeEvidence
    .map((entry) => entry.title)
    .slice(0, 3)
    .join(' / ');

  return `
    <article
      class="rb-surface"
      id="${escapeHtml(payload.nodeId)}"
      data-specular-surface-id="${escapeHtml(payload.nodeId)}"
      data-specular-gate="${escapeHtml(verdict.status)}"
      data-specular-score="${escapeHtml(verdict.score)}"
      data-product-dna-packs="${escapeHtml(payload.activeProductDnaContract.packBindings.map((binding) => binding.id).join(','))}"
      data-knowledge-receipt-id="${escapeHtml(payload.knowledgeContextBundle.receipt.receiptId)}"
    >
      <header class="rb-surface-header">
        <div>
          <p class="rb-kicker">SPECULAR surface / ${escapeHtml(payload.previewArtifact.screenType)}</p>
          <h1>${escapeHtml(payload.previewArtifact.componentName.replace(/Preview$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'))}</h1>
        </div>
        <div class="rb-score ${verdict.status === 'passed' ? 'is-passed' : 'is-failed'}">
          <strong>${verdict.score}</strong>
          <span>${escapeHtml(verdict.status)}</span>
        </div>
      </header>
      <p class="rb-summary">${escapeHtml(renderShowcaseSummary(payload))}</p>
      ${references ? `<p class="rb-reference-strip">${escapeHtml(references)}</p>` : ''}
      ${productDnaPacks ? `<p class="rb-reference-strip rb-dna-strip">${escapeHtml(productDnaPacks)}</p>` : ''}
      ${knowledgeTopSources ? `<p class="rb-reference-strip rb-kb-strip">KB: ${escapeHtml(knowledgeEvidence.length)} evidence / ${escapeHtml(knowledgeTopSources)}</p>` : ''}
      <div class="rb-device">${blocks}</div>
    </article>
  `;
}

function renderSpecularShowcase(session: { id: string; name: string; graph: { nodes: any[] } }) {
  const payloads = (session.graph.nodes || [])
    .filter((node) => node.type === 'frontend' || node.type === 'external')
    .map((node) => buildSpecularCreatePayload(node));

  if (payloads.length === 0) {
    return null;
  }

  const nav = payloads
    .map((payload) => `<a href="#${escapeHtml(payload.nodeId)}">${escapeHtml(payload.nodeId)}</a>`)
    .join('');
  const surfaces = payloads.map(renderShowcaseSurface).join('');
  const averageScore = Math.round(payloads.reduce((sum, payload) => sum + payload.designVerdict.score, 0) / payloads.length);
  const failedCount = payloads.filter((payload) => payload.designVerdict.status !== 'passed').length;
  const truthManifest = {
    sessionId: session.id,
    sessionName: session.name,
    surfaceCount: payloads.length,
    averageScore,
    failedCount,
    surfaces: payloads.map((payload) => ({
      nodeId: payload.nodeId,
      componentName: payload.previewArtifact.componentName,
      screenType: payload.previewArtifact.screenType,
      designProfile: payload.designProfile,
      selectedReferenceIds: payload.selectedReferenceIds,
      selectedVariantId: payload.selectedVariantId,
      gate: payload.designVerdict.status,
      score: payload.designVerdict.score,
      evidenceCount: payload.designVerdict.evidence.length,
      findingCount: payload.designVerdict.findings.length,
      productDnaPackIds: payload.selectedProductDnaPackIds,
      productDnaFamilies: payload.activeProductDnaContract.packBindings.map((binding) => binding.family),
      requiredReceiptCount: payload.activeProductDnaContract.receipts.required.length,
      failValidatorCount: payload.activeProductDnaContract.validators.filter((validator) => validator.severity === 'fail').length,
      retrievalReceiptId: payload.knowledgeContextBundle.receipt.receiptId,
      retrievalEvidenceCount: payload.knowledgeContextBundle.evidence.length,
      retrievalSourceCount: payload.knowledgeContextBundle.documents.length,
      retrievalTopSources: payload.knowledgeContextBundle.evidence.slice(0, 3).map((entry) => entry.title),
    })),
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(session.name)} / SPECULAR Showcase</title>
    <style>
      :root {
        --ink: #17110a;
        --muted: #6f553c;
        --paper: #fff7e6;
        --paper-strong: #fffaf0;
        --gold: #ffb000;
        --rust: #b3471d;
        --cream: #f8eed8;
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        color: var(--ink);
        background:
          radial-gradient(circle at 12% 0%, rgba(255, 176, 0, 0.32), transparent 30rem),
          radial-gradient(circle at 92% 8%, rgba(179, 71, 29, 0.18), transparent 24rem),
          linear-gradient(135deg, #120d08 0%, #2b160d 34%, #f8eed8 34%, #fff7e6 100%);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .rb-shell { width: min(1200px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 72px; }
      .rb-topbar {
        position: sticky; top: 14px; z-index: 10;
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
        border: 1px solid rgba(255,250,240,0.22); border-radius: 999px;
        background: rgba(23, 17, 10, 0.76); color: var(--paper);
        padding: 10px 12px 10px 18px; backdrop-filter: blur(18px);
        box-shadow: 0 18px 70px rgba(23,17,10,0.28);
      }
      .rb-topbar strong { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; }
      .rb-nav { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
      .rb-nav a {
        white-space: nowrap; color: var(--paper); text-decoration: none;
        border: 1px solid rgba(255,250,240,0.18); border-radius: 999px;
        padding: 8px 10px; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;
      }
      .rb-hero-shell { min-height: 56vh; display: grid; align-items: end; padding: 80px 0 36px; }
      .rb-kicker, .rb-eyebrow {
        margin: 0; color: var(--rust); font-size: 10px; font-weight: 950;
        letter-spacing: .34em; text-transform: uppercase;
      }
      .rb-title {
        max-width: 980px; margin: 18px 0 0;
        color: var(--paper-strong); text-shadow: 0 24px 90px rgba(0,0,0,0.35);
        font-size: clamp(4rem, 14vw, 11.6rem); line-height: .78; letter-spacing: -.1em; font-weight: 950;
      }
      .rb-lede { max-width: 760px; margin: 24px 0 0; color: #f3dec2; font-size: clamp(1rem, 2vw, 1.45rem); line-height: 1.55; }
      .rb-stats { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
      .rb-stat {
        border-radius: 24px; border: 1px solid rgba(255,250,240,0.18);
        background: rgba(255,250,240,0.12); color: var(--paper);
        padding: 16px 18px; min-width: 140px; backdrop-filter: blur(12px);
      }
      .rb-stat strong { display: block; font-size: 30px; line-height: 1; }
      .rb-stat span { display: block; margin-top: 6px; color: #f3dec2; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .13em; }
      .rb-grid { display: grid; gap: 28px; }
      .rb-surface {
        border-radius: 44px; background: rgba(255,247,230,0.94); border: 1px solid rgba(23,17,10,0.1);
        padding: clamp(18px, 4vw, 34px); box-shadow: 0 34px 120px rgba(23,17,10,0.24);
      }
      .rb-surface-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
      .rb-surface h1 { margin: 8px 0 0; font-size: clamp(2rem, 5vw, 4.6rem); line-height: .86; letter-spacing: -.075em; }
      .rb-summary { max-width: 900px; color: var(--muted); line-height: 1.6; }
      .rb-reference-strip {
        display: inline-flex; max-width: 100%; border-radius: 999px;
        background: #17110a; color: #fff7e6; padding: 10px 14px;
        font-size: 11px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase;
      }
      .rb-dna-strip { margin-left: 8px; background: #ffb000; color: #17110a; }
      .rb-kb-strip { margin-left: 8px; background: #2f2418; color: #fff7e6; }
      .rb-score {
        display: grid; place-items: center; width: 82px; min-width: 82px; height: 82px;
        border-radius: 999px; color: var(--paper); background: var(--ink);
        box-shadow: 0 20px 54px rgba(23,17,10,0.26);
      }
      .rb-score strong { font-size: 30px; line-height: 1; }
      .rb-score span { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #f3dec2; }
      .rb-score.is-failed { background: #8f1d1d; }
      .rb-device { display: grid; gap: 14px; margin-top: 24px; }
      .rb-block { position: relative; overflow: hidden; border-radius: 32px; padding: 24px; }
      .rb-hero { min-height: 310px; display: flex; align-items: end; background: var(--gold); box-shadow: 0 30px 90px rgba(123,74,22,0.22); }
      .rb-hero h2 { max-width: 820px; margin: 14px 0 0; font-size: clamp(3rem, 11vw, 7.8rem); line-height: .82; letter-spacing: -.09em; }
      .rb-orb { position: absolute; pointer-events: none; border-radius: 999px; }
      .rb-orb-a { right: -54px; top: -76px; width: 210px; height: 210px; background: rgba(23,17,10,0.12); }
      .rb-orb-b { left: 38px; bottom: -100px; width: 260px; height: 260px; border: 1px solid rgba(23,17,10,0.15); }
      .rb-block-content { position: relative; }
      .rb-block h3 { margin: 8px 0 0; font-size: clamp(1.4rem, 3vw, 2.4rem); line-height: .95; letter-spacing: -.06em; }
      .rb-body { max-width: 720px; color: #4a3829; line-height: 1.6; }
      .rb-metrics { background: #f3dec2; border: 1px solid rgba(23,17,10,0.1); box-shadow: 0 24px 70px rgba(89,52,24,0.12); }
      .rb-detail { background: #ffe0bd; border: 1px solid rgba(179,71,29,0.2); }
      .rb-list { background: #fff7e6; border: 1px solid rgba(23,17,10,0.1); }
      .rb-cta { background: var(--ink); color: var(--paper); box-shadow: 0 28px 80px rgba(23,17,10,0.28); }
      .rb-cta .rb-body { color: #f3dec2; }
      .rb-items { list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 16px 0 0; padding: 0; }
      .rb-items li {
        border-radius: 22px; border: 1px solid rgba(23,17,10,0.1); background: var(--paper-strong);
        padding: 14px 16px; color: #24170e; font-size: 14px; font-weight: 700;
        box-shadow: 0 14px 34px rgba(67,38,18,0.08);
      }
      .rb-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 18px; }
      .rb-actions span {
        border-radius: 999px; padding: 12px 18px; font-size: 13px; font-weight: 900;
        background: var(--gold); color: var(--ink); box-shadow: 0 12px 30px rgba(255,176,0,0.22);
      }
      .rb-actions span + span { background: transparent; color: var(--paper); border: 1px solid rgba(255,247,230,0.25); box-shadow: none; }
      @media (max-width: 720px) {
        .rb-shell { width: min(100% - 20px, 1200px); padding-bottom: 36px; }
        .rb-topbar { position: static; border-radius: 24px; align-items: flex-start; flex-direction: column; }
        .rb-hero-shell { min-height: auto; padding-top: 54px; }
        .rb-title { color: var(--paper-strong); }
        .rb-surface-header { flex-direction: column; }
        .rb-items { grid-template-columns: 1fr; }
        .rb-score { width: 70px; height: 70px; min-width: 70px; }
      }
    </style>
  </head>
  <body>
    <script id="rb-specular-truth" type="application/json">${escapeJsonForInlineScript(truthManifest)}</script>
    <main class="rb-shell">
      <nav class="rb-topbar">
        <strong>Retrobuilder SPECULAR showcase</strong>
        <div class="rb-nav">${nav}</div>
      </nav>
      <section class="rb-hero-shell">
        <div>
          <p class="rb-kicker">Generated product QA / ${escapeHtml(session.id)}</p>
          <h1 class="rb-title">${escapeHtml(session.name)}</h1>
          <p class="rb-lede">A browser-visible gallery of generated user-facing surfaces. This route is intentionally product-first so visual QA can judge polish, hierarchy, copy, responsiveness, and design-database grounding without digging through inspector panels.</p>
          <div class="rb-stats">
            <div class="rb-stat"><strong>${payloads.length}</strong><span>surfaces</span></div>
            <div class="rb-stat"><strong>${averageScore}</strong><span>avg score</span></div>
            <div class="rb-stat"><strong>${failedCount}</strong><span>failed gates</span></div>
          </div>
        </div>
      </section>
      <section class="rb-grid">${surfaces}</section>
    </main>
  </body>
</html>`;
}

export function createSpecularRouter() {
  const router = Router();

  router.post('/api/specular/generate', async (req, res) => {
    const { sessionId, nodeId, draft } = req.body || {};
    if (!nodeId || typeof nodeId !== 'string') {
      return res.status(400).json({ error: 'Missing nodeId.' });
    }

    let session;
    try {
      session = await resolveSpecularSession(sessionId, draft);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid draft graph.' });
    }
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const node = findNode(session, nodeId);
    if (!node) {
      return res.status(404).json({ error: 'Node not found.' });
    }

    return res.json(buildSpecularCreatePayload(node));
  });

  router.post('/api/specular/verdict', async (req, res) => {
    const { sessionId, nodeId, draft } = req.body || {};
    if (!nodeId || typeof nodeId !== 'string') {
      return res.status(400).json({ error: 'Missing nodeId.' });
    }

    let session;
    try {
      session = await resolveSpecularSession(sessionId, draft);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid draft graph.' });
    }
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const node = findNode(session, nodeId);
    if (!node) {
      return res.status(404).json({ error: 'Node not found.' });
    }

    return res.json(buildSpecularCreatePayload(node));
  });

  router.get('/api/specular/preview/:sessionId/:nodeId', async (req, res) => {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const node = findNode(session, req.params.nodeId);
    if (!node) {
      return res.status(404).json({ error: 'Node not found.' });
    }

    return res.json(buildSpecularCreatePayload(node));
  });

  router.get('/specular/showcase/:sessionId', async (req, res) => {
    const session = await loadSession(req.params.sessionId);
    if (!session) {
      return res.status(404).send('Session not found.');
    }

    const html = renderSpecularShowcase(session);
    if (!html) {
      return res.status(404).send('No user-facing SPECULAR surfaces found for this session.');
    }

    res.type('html').send(html);
  });

  return router;
}
