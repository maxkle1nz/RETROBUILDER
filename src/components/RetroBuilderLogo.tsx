import React from 'react';

type RetroBuilderLogoProps = {
  mode: 'architect' | 'm1nd' | 'builder';
};

const LETTER_COLORS = [
  '#00f2ff',
  '#7c3cff',
  '#ff79c6',
  '#ffcb6b',
  '#50fa7b',
  '#00f2ff',
  '#b026ff',
  '#ff9d00',
  '#50fa7b',
  '#00f2ff',
  '#ff79c6',
  '#ffcb6b',
];

const MODE_COPY: Record<RetroBuilderLogoProps['mode'], { label: string; color: string }> = {
  architect: { label: 'ARCHITECT STUDIO', color: '#00f2ff' },
  m1nd: { label: 'M1ND COCKPIT', color: '#b026ff' },
  builder: { label: 'BU1LDER LIVE', color: '#50fa7b' },
};

export default function RetroBuilderLogo({ mode }: RetroBuilderLogoProps) {
  const modeCopy = MODE_COPY[mode];

  return (
    <div className="flex items-center gap-3" aria-label={`RETROBUILDER ${modeCopy.label}`}>
      <div className="relative flex h-10 items-center overflow-hidden rounded-md border border-white/10 bg-[#050608] px-3 shadow-[0_0_24px_rgba(0,242,255,0.12)]">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-45"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,242,255,0.14), rgba(255,121,198,0.10), rgba(80,250,123,0.12)), repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,0.04) 3px 4px)',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 h-px w-full"
          style={{
            background: 'linear-gradient(90deg, #00f2ff, #ff79c6, #ffcb6b, #50fa7b)',
          }}
        />
        <span className="relative mr-2 font-mono text-[9px] font-bold tracking-[0.22em] text-[#50fa7b]/70">
          &gt;_
        </span>
        <span className="sr-only">RETROBUILDER</span>
        <span aria-hidden="true" className="relative hidden items-center font-mono text-[15px] font-black tracking-[0.18em] sm:flex">
          {'RETROBUILDER'.split('').map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              className="drop-shadow-[0_0_8px_currentColor]"
              style={{ color: LETTER_COLORS[index] }}
            >
              {letter}
            </span>
          ))}
        </span>
        <span className="relative ml-2 h-4 w-1 animate-pulse bg-[#ffcb6b] shadow-[0_0_10px_#ffcb6b]" aria-hidden="true" />
      </div>

      <div className="hidden flex-col leading-none xl:flex">
        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.34em] text-text-dim">
          ANSI SYSTEM
        </span>
        <span
          className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.28em]"
          style={{ color: modeCopy.color }}
        >
          {modeCopy.label}
        </span>
      </div>
    </div>
  );
}
