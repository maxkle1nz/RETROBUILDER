import type { DesignProfile } from './specular-types.js';

export const SPECULAR_DESIGN_PROFILE: DesignProfile = '21st';

export const SPECULAR_21ST_PROFILE = {
  id: SPECULAR_DESIGN_PROFILE,
  label: '21st Design Law',
  principles: [
    'Reference-first UI grounded in real component patterns.',
    'A small number of strong blocks beats noisy layout sprawl.',
    'Typography, spacing, and contrast should establish instant hierarchy.',
    'User-facing surfaces must visibly reflect the backend truth and state machine.',
    'Generated UI should feel production-ready, not placeholder-grade.',
  ],
  buildGate: {
    passScore: 78,
    maxBlocks: 6,
    maxPrimaryActions: 2,
  },
} as const;
