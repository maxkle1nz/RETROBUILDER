---
Protocol: L1GHT/0.4
Node: kreator-subsystem
State: ◉ operational
Color: #00ffcc
Glyph: ⚡
Completeness: 88%
Proof: structural
Depends on:
  - src/components/ChatFooter.tsx
  - src/server/routes/ai.ts
  - src/server/ai-workflows.ts
  - src/server/m1nd-bridge.ts
Next:
  - full-journey visual dogfood
  - tighter proposal-to-proof ergonomics
---

## Overview

[⌂ entity: Kreator] is the prompt-driven blueprint authoring subsystem inside RETROBUILDER.

It currently operates in two practical authoring modes:
1. **KONSTRUKTOR** — generate the initial blueprint skeleton
2. **KREATOR** — propose and apply graph modifications against an existing blueprint

[⟁ binds_to: src/components/ChatFooter.tsx]
[⟁ binds_to: src/server/routes/ai.ts]
[⟁ binds_to: src/server/ai-workflows.ts]

## Current Flow

### KONSTRUKTOR
1. User enters a natural-language prompt in `ChatFooter`
2. `generateGraphStructureWorkflow(...)` creates the initial graph, manifesto, and architecture
3. The graph is written into the frontend store and rendered on the m1ndmap canvas

### KREATOR
1. User requests a modification in `ChatFooter`
2. `generateProposalWorkflow(...)` synthesizes a concise technical plan
3. User explicitly reviews the proposal
4. `applyProposalWorkflow(...)` mutates the graph when accepted

This is still a human-approved proposal pipeline, not a hidden multi-step autopilot loop.

## Structural Awareness (m1nd Integration)

[⟐ state: m1nd-grounded]

When m1nd is online, `generateProposalWorkflow(...)` gathers structural context before proposal synthesis.

Current injected context can include:
- activated nodes
- blast radius
- co-change predictions
- risk assessment
- layer violations

This makes KREATOR structurally aware instead of only prompt-reactive.

[⟁ depends_on: src/server/m1nd-bridge.ts]
[⟁ binds_to: src/server/ai-workflows.ts::generateProposalWorkflow]

## Relationship to KOMPLETUS

KREATOR and KOMPLETUS are adjacent but different:
- **KREATOR** = incremental user-reviewed graph modification
- **KOMPLETUS** = full pipeline from prompt -> research -> specular audit -> quality gate -> report

For full autonomous handoff into OMX, the current preferred flow is:
`KONSTRUKTOR/KOMPLETUS -> review -> Accept & Continue -> OMX runtime`

## Data Contracts

### ChatMessage
```
{ id: string, role: 'user' | 'system' | 'm1nd', content: string, timestamp: number }
```

### Proposal Response
```
{
  proposal: string,
  m1nd?: { structuralContextChars: number, grounded: boolean },
  meta?: { provider: string, fallbackUsed: boolean }
}
```

## Risk Surface

[AMBER warning: proposal-loop-not-proof-loop]
KREATOR proposals are structurally grounded, but the user still decides whether to apply them.

[AMBER warning: visual-specular-gap]
There is not yet one browser-level proof that the entire user journey from KREATOR/KOMPLETUS into OMX is visually truth-preserving.

[GREEN note: graceful-degradation]
If m1nd is offline, proposal generation still works; it simply loses structural grounding.

## Binding Truth

Current canonical bindings:
- `src/components/ChatFooter.tsx`
- `src/server/routes/ai.ts`
- `src/server/ai-workflows.ts`
- `src/server/m1nd-bridge.ts`

Legacy `server.ts:*` references are no longer the best source of truth because the backend is now route-modular.
