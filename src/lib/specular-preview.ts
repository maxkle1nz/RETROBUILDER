import type { SpecularPreviewArtifact, SpecularPreviewBlock, SpecularPreviewState } from './api';

function sectionMarkup(block: SpecularPreviewBlock) {
  const eyebrow = block.eyebrow ? `<p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#b3471d]">${block.eyebrow}</p>` : '';
  const body = block.body ? `<p className="mt-3 max-w-2xl text-sm leading-6 text-[#4a3829]">${block.body}</p>` : '';
  const items = (block.items || []).map((item) => `<li className="rounded-[1.4rem] border border-[#17110a]/10 bg-[#fffaf0] px-4 py-3 text-sm font-medium leading-5 text-[#24170e] shadow-[0_14px_34px_rgba(67,38,18,0.08)]">${item}</li>`).join('');

  switch (block.kind) {
    case 'metrics':
      return `
        <section className="rounded-[2rem] border border-[#17110a]/10 bg-[#f3dec2] p-5 shadow-[0_24px_70px_rgba(89,52,24,0.12)]">
          ${eyebrow}
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-[#17110a]">${block.title}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            ${items}
          </div>
        </section>`;
    case 'list':
    case 'activity':
      return `
        <section className="rounded-[2rem] border border-[#17110a]/10 bg-[#fff7e6] p-5">
          ${eyebrow}
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-[#17110a]">${block.title}</h2>
          <ul className="mt-4 space-y-2">
            ${items}
          </ul>
        </section>`;
    case 'cta':
      return `
        <section className="rounded-[2rem] bg-[#17110a] p-5 text-[#fff7e6] shadow-[0_28px_80px_rgba(23,17,10,0.28)]">
          ${eyebrow}
          <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">${block.title}</h2>
          ${block.body ? `<p className="mt-3 max-w-2xl text-sm leading-6 text-[#f3dec2]">${block.body}</p>` : ''}
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-full bg-[#ffb000] px-5 py-3 text-sm font-black text-[#17110a] shadow-[0_12px_30px_rgba(255,176,0,0.26)]">Primary action</button>
            <button className="rounded-full border border-[#fff7e6]/25 px-5 py-3 text-sm font-bold text-[#fff7e6]">Secondary action</button>
          </div>
        </section>`;
    case 'detail':
      return `
        <section className="rounded-[2rem] border border-[#b3471d]/20 bg-[#ffe0bd] p-5">
          ${eyebrow}
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-[#17110a]">${block.title}</h2>
          ${body}
        </section>`;
    case 'hero':
    default:
      return `
        <section className="relative overflow-hidden rounded-[2.4rem] bg-[#ffb000] p-6 shadow-[0_30px_90px_rgba(123,74,22,0.22)]">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#17110a]/12" />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full border border-[#17110a]/15" />
          <div className="relative">
            ${eyebrow}
            <h1 className="mt-3 max-w-3xl text-[clamp(2.6rem,12vw,6rem)] font-black leading-[0.86] tracking-[-0.08em] text-[#17110a]">${block.title}</h1>
            ${body}
          </div>
        </section>`;
  }
}

export function serializeSpecularArtifactTsx(artifact: SpecularPreviewArtifact, previewState: SpecularPreviewState) {
  const rootPadding = previewState.density === 'compact' ? 'p-4' : 'p-6';
  const rootTone = previewState.emphasis === 'editorial'
    ? 'bg-[#f8eed8]'
    : previewState.emphasis === 'dashboard'
      ? 'bg-[#edf4e7]'
      : 'bg-[#fff7e6]';
  const blockMarkup = artifact.blocks.map((block) => sectionMarkup(block)).join('\n');

  return `import React from 'react';

export function ${artifact.componentName}() {
  return (
    <div className=\"min-h-screen ${rootTone} ${rootPadding} text-[#17110a]\">
      <div className=\"mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-hidden\" data-retrobuilder-vanguard=\"${artifact.summary}\">
        ${blockMarkup}
      </div>
    </div>
  );
}
`;
}

export function applyPreviewStateToArtifact(
  artifact: SpecularPreviewArtifact,
  previewState: SpecularPreviewState,
): SpecularPreviewArtifact {
  return {
    ...artifact,
    tsx: serializeSpecularArtifactTsx(artifact, previewState),
  };
}

export function movePreviewBlock(
  artifact: SpecularPreviewArtifact,
  blockId: string,
  direction: -1 | 1,
): SpecularPreviewArtifact {
  const currentIndex = artifact.blocks.findIndex((block) => block.id === blockId);
  if (currentIndex === -1) return artifact;
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= artifact.blocks.length) return artifact;

  const blocks = [...artifact.blocks];
  const [moved] = blocks.splice(currentIndex, 1);
  blocks.splice(nextIndex, 0, moved);
  return { ...artifact, blocks };
}

export function updatePreviewBlock(
  artifact: SpecularPreviewArtifact,
  blockId: string,
  patch: Partial<SpecularPreviewBlock>,
): SpecularPreviewArtifact {
  return {
    ...artifact,
    blocks: artifact.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
  };
}
