---
Protocol: L1GHT/0.4
Node: kreator-subsystem
State: ◉ operational
Color: #00ffcc
Glyph: ⚡
Completeness: 85%
Proof: structural
Depends on:
  - express-server
  - ai-provider-factory
  - web-research-service
  - m1nd-bridge
Next:
  - autopilot-loop
  - multi-agent-kreator
---

## Overview

[⍂ entity: Kreator] is the primary [⍌ event: graph-modification] engine within RETROBUILDER. It operates in two modes:

1. **KONSTRUKTOR** — generates initial system skeletons from natural language prompts
2. **KREATOR** — modifies existing graph topology via proposal → review → execute pipeline

[⟁ binds_to: src/components/ChatFooter.tsx]
[⟁ binds_to: server.ts:generateProposal]
[⟁ binds_to: server.ts:applyProposal]

## Structural Awareness (M1ND Integration)

[⍐ state: m1nd-grounded] — As of v2.6, the Kreator is structurally grounded. Before generating any proposal, the backend:

1. Calls `m1nd.activate(prompt)` to identify affected graph nodes
2. Calls `m1nd.impact(top_node)` to compute blast radius
3. Calls `m1nd.predict(top_node)` to get co-change predictions
4. Injects all structural context into the LLM system prompt

[⟁ depends_on: src/server/m1nd-bridge.ts]
[⟁ binds_to: server.ts:gatherStructuralContext]

## Proposal Pipeline

The proposal pipeline follows a strict sequence:

1. **User Prompt** → ChatFooter captures input
2. **Structural Context** → m1nd bridge gathers topology data
3. **LLM Synthesis** → Provider generates proposal with structural awareness  
4. **User Review** → Proposal displayed with Accept/Reject controls
5. **Execution** → Graph mutated via `applyProposal` endpoint

[𝔻 confidence: 0.90] — The pipeline is battle-tested for single-step proposals.
[𝔻 ambiguity: 0.15] — Multi-step proposals may lose context between iterations.

## Risk Surface

[RED blocker: autopilot-loop-missing] — No automated multi-step execution loop exists yet.
[AMBER warning: m1nd-offline-degradation] — When m1nd is unavailable, proposals lack structural grounding.

## Data Contracts

### ChatMessage
```
{ id: string, role: 'user' | 'system' | 'm1nd', content: string, timestamp: number }
```

### Proposal Response
```
{ proposal: string, m1nd?: { structuralContextChars: number, grounded: boolean } }
```

[⟁ tests: kreator-proposal-flow]
[⟁ tests: m1nd-structural-injection]
