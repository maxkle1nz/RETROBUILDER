# Demystifier Card UIX Spec

This document is the canonical card/UIX spec for the Demystifier node system on `main`.

Goal: keep the m1ndmap node compact, highly legible, and side-by-side comparable while preserving the structural graph feel.

Architecture: the major Demystifier shift is already implemented on `main`, but this document remains the reference spec for future polish. The graph remains a graph; the node primitive is a disciplined Demystifier card rather than a wide cyber panel. Layout constants, card anatomy, typography, and metadata summarization should continue to follow this spec.

Tech Stack: React 19, `@xyflow/react`, dagre layout, Tailwind CSS 4, Zustand state, lucide-react icons.

---

## 1. Problem Statement

The current m1ndmap cards are not actually behaving like cards.

Today they read as:
- graph nodes with cyberpunk chrome
- horizontally segmented info panels
- sparse objects inside an over-spaced graph

This creates four UX failures:
1. poor scanability across many modules
2. weak hierarchy inside each module
3. too much visual width for too little useful information
4. forced zoom-out due to inflated layout boxes and large inter-node spacing

The new primitive is called `Demystifier`.

`Demystifier` means:
- compact
- clarifying
- comparative
- semantically dense
- visually disciplined

It does not mean “trading card nostalgia” as an aesthetic gimmick.
It means “a card that demystifies what a module is, how mature it is, and how specified it is”.

---

## 2. Current Implementation Summary

Current files involved:
- `src/components/CyberNode.tsx`
- `src/components/GraphView.tsx`
- `src/lib/layout.ts`
- `src/components/RightPanel.tsx`
- `src/components/NodeInspector.tsx`
- `src/components/KompletusReport.tsx`
- `src/lib/api.ts`

Current implementation:
- `layout.ts` now uses a compact truthful footprint: `220x180`
- dagre spacing is already tightened to `nodesep: 64`, `ranksep: 104`
- `CyberNode` already renders the compact Demystifier-style face on `main`
- data-flow arrows are now visible in the graph
- node comparison is materially better than the earlier wide-panel state
- rich fields in `NodeData` are summarized more coherently on-card and through the inspector/report surfaces

Remaining visual work:
- continue tightening large-graph density under real project sessions
- keep the card/report/inspector language aligned so the module reads consistently across surfaces
- SPECULAR showcase and OMX handoff now have focused browser-level manifest verification; the remaining gap is wider parity coverage across graph cards, reports, inspector surfaces, knowledge-bank guidance, and final runnable handoff

Current node data available:
- `label`
- `description`
- `status`
- `type`
- `data_contract`
- `decision_rationale`
- `acceptance_criteria`
- `error_handling`
- `priority`
- `researchContext`
- `researchMeta`
- `constructionNotes`

Conclusion:
The data model is rich enough and the main card compaction has landed. The remaining work is visual verification hardening, not a fresh redesign from scratch.

---

## 3. Demystifier Design Principles

Every Demystifier card must answer, in under 2 seconds:
- what is this module?
- what kind of module is it?
- how important is it?
- how specified is it?
- how grounded is it?
- what state is it in?

The card must privilege:
- identity over decoration
- comparison over prose
- density over whitespace waste
- consistency over optional band stacking

The card must avoid:
- full-width metadata strips for every attribute
- tiny unreadable utility labels as primary information
- widths that exceed the amount of visible content
- variable card anatomy based on optional fields

---

## 4. Target Card Anatomy

Each Demystifier card should have 4 stable zones.

### Zone A — Identity Rail
Purpose: establish module identity immediately.

Contents:
- type icon
- type label
- priority badge
- state indicator

Rules:
- this zone is compact and always present
- state should be shown as a strong chip or compact status marker, not only as a tiny icon
- type + priority must be readable without zooming in excessively

### Zone B — Title Core
Purpose: name the module clearly.

Contents:
- module label
- optional one-line subtitle or compressed description

Rules:
- label may use up to 2 lines before truncation
- description must not dominate the card
- description should be editorial, not dumpy
- if no useful short description exists, prefer more space for stats

### Zone C — Demystifier Metrics Grid
Purpose: summarize module maturity/specification in comparable slots.

Canonical metrics:
- `AC` = acceptance criteria count
- `EH` = error handling count
- `CTR` = contract presence/strength
- `RCH` = grounding/research presence

Optional future metrics:
- dependency count
- downstream impact count
- completeness score
- confidence score

Rules:
- metrics live in a compact 2x2 grid
- every metric slot has the same footprint
- values must be visually stronger than labels
- if a metric is missing, use a neutral empty state, not disappearance

### Zone D — Semantic Footer
Purpose: convey one concise semantic sentence.

Examples:
- `auth boundary · contract defined`
- `frontend shell · grounding missing`
- `data core · 5 AC / 2 EH`

Rules:
- one line only
- no stacked subpanels
- this is the card’s human-readable takeaway

---

## 5. Target Proportions

The Demystifier card should be compact and nearly portrait-oriented compared to the current node.

Target footprint:
- width target: `180–220px`
- preferred width: around `196px`
- height target: `150–180px`
- all cards should share a near-constant footprint

Important:
The graph layout box must match the real card footprint closely.

This means `layout.ts` should stay near the current compact implementation:
- nodeWidth: `220`
- nodeHeight: `180`

Current `main` implementation already matches this direction. Further tuning should happen only after validation against real project sessions, not by drifting back toward oversized placeholders.

---

## 6. Graph Layout Principles

The graph should still feel architectural, but denser and more intelligible.

Required changes:
- reduce dagre `nodesep`
- reduce dagre `ranksep`
- keep `TB` initially unless testing proves `LR` is better for module reading
- preserve fitView, but only after node footprint is truthful

Current main tuning:
- `nodesep`: `64`
- `ranksep`: `104`

Future tuning should stay in this compact band unless larger real-world blueprints prove a better density tradeoff.

Expected effect:
- less dead air
- less forced zoom-out
- stronger sense of a real module field rather than isolated labels on a huge canvas

---

## 7. Typography Rules

### Title
- stronger than current
- 12–13px equivalent
- semibold or bold
- max 2 lines
- tighter tracking than current chrome labels

### Utility labels
- fewer
- less uppercase shouting
- reduce wide tracking except for tiny chips where necessary

### Metrics
- label small, value prominent
- value should be the fastest-readable element after the title

### Description / footer sentence
- compact
- regular sans, not mono unless specifically technical
- mono should be reserved for machine-like values, not general reading

Anti-rule:
Do not let 8px uppercase mono labels define the reading rhythm of the card.

---

## 8. Visual Hierarchy Rules

Strong hierarchy order:
1. label
2. state / priority / type
3. metric values
4. semantic footer
5. decorative chrome

Weak hierarchy targets:
- corner ornaments
- glow effects
- thin divider lines
- tiny metadata captions

If a decorative element competes with a metric or title, decoration loses.

---

## 9. Data Mapping Rules

The Demystifier card should summarize richer node data rather than exposing long-form source fields.

### Type
Source:
- `data.type`

Display:
- icon + compact badge

### Priority
Source:
- `data.priority`

Display:
- strong small badge like `P1`, `P2`, `P3`

### State
Source:
- `data.status`

Display:
- explicit chip, not icon-only
- examples: `PENDING`, `ACTIVE`, `DONE`

### Contract metric (`CTR`)
Source:
- `data.data_contract`

Display:
- binary or graded signal
- phase 1 can be `SET` / `MISS`

### Acceptance metric (`AC`)
Source:
- `data.acceptance_criteria?.length`

Display:
- numeric count

### Error-handling metric (`EH`)
Source:
- `data.error_handling?.length`

Display:
- numeric count

### Research metric (`RCH`)
Source:
- `data.researchContext`

Display:
- `ON` / `OFF` or compact count/state

### Semantic footer
Derived from:
- type
- contract presence
- research presence
- AC/EH count
- maybe status

This footer should be composed, not copied directly from source fields.

---

## 10. Component Refactor Strategy

### Primary file to redesign
- `src/components/CyberNode.tsx`

### Supporting layout file
- `src/lib/layout.ts`

### Optional follow-up consistency files
- `src/components/GraphView.tsx`
- `src/index.css`
- `src/components/KompletusReport.tsx`

Implementation strategy:

1. Keep the React Flow node contract unchanged
2. Refactor internal JSX structure of `CyberNode`
3. Replace stacked footer bands with one metrics grid + semantic footer
4. Introduce stable card footprint
5. Re-tune dagre dimensions to match
6. Only after card + spacing are right, tune glows, handles, edge intensity, and background texture

---

## 11. Phase Plan

### Phase 1 — Card Primitive Conversion
Objective: convert `CyberNode` into a Demystifier card without changing graph behavior.

Files:
- modify `src/components/CyberNode.tsx`

Deliverables:
- new 4-zone card anatomy
- compact dimensions
- metric grid
- stronger title hierarchy
- no multi-strip footer stack

### Phase 2 — Layout Compression
Objective: make graph spacing truthful to the new card.

Files:
- modify `src/lib/layout.ts`
- maybe tweak `src/components/GraphView.tsx`

Deliverables:
- reduced node width reservation
- reduced rank/node spacing
- improved default zoom feel

### Phase 3 — Canvas Clarity Pass
Objective: reduce visual competition around the Demystifier cards.

Files:
- `src/components/GraphView.tsx`
- `src/index.css`

Deliverables:
- calmer edges if needed
- subtler scanline/grid if needed
- card-first legibility

### Phase 4 — Surface Consistency Pass
Objective: align related surfaces with the Demystifier language.

Files:
- `src/components/KompletusReport.tsx`
- maybe `src/components/RightPanel.tsx`

Deliverables:
- consistent metric naming
- consistent labels for AC / EH / contract / grounding
- no UI vocabulary drift

---

## 12. Acceptance Criteria

The redesign is successful only if all are true:

1. Cards feel visibly narrower and more compact than the current m1ndmap nodes.
2. The graph fits more modules on screen before readability collapses.
3. A user can identify type, priority, status, and module name without opening side panels.
4. A user can compare module maturity/specification across multiple cards quickly.
5. The card no longer relies on stacked metadata strips for AC / contract / grounded state.
6. The graph no longer feels inflated by layout boxes wider than the card itself.
7. Typography is more readable at overview zoom.
8. Decorative cyberpunk elements support the card instead of dominating it.
9. The metaphor reads as `Demystifier`, not generic node panel.

---

## 13. Non-Goals

Not part of the first Demystifier cut:
- clustering/group hulls
- 3D graph redesign
- right-panel feature redesign
- major data model changes
- changing backend payload shape
- replacing React Flow or dagre

---

## 14. Recommended Initial Implementation Defaults

These are suggested starting points, not fixed requirements.

Card defaults:
- width: ~`196px`
- min height: ~`164px`
- title clamp: 2 lines
- description clamp: 1 line or semantic footer only
- metrics grid: 2 columns x 2 rows

Layout defaults:
- `nodeWidth`: ~`220`
- `nodeHeight`: ~`180`
- `nodesep`: ~`64`
- `ranksep`: ~`104`

Visual defaults:
- keep type color accents
- reduce number of full-width divider bands
- keep corner chrome only if very subtle
- prefer one unified card background over multiple stacked shaded strips

---

## 15. Implementation Note

Branch for this work:
- `design`

Naming:
- use `Demystifier` in docs/spec discussions
- do not refer to the target primitive as “Super Trunfo” in the implementation-facing language

---

## 16. Next Cut

Immediate next implementation cut:
1. refactor `CyberNode.tsx` into the Demystifier anatomy
2. re-tune `layout.ts` to match the new physical footprint
3. run visual verification in the m1nd graph view
4. then do a follow-up polish pass on graph edge/background competition
