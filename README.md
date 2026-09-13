# Auto Debugger V6 Stage-3

Browser-only static analysis debugger — Evidence-Driven Static Bug Analysis Engine.

## Run
Open `index.html` in a browser, or deploy this folder to **GitHub Pages**.

No server, no install, offline-first. Analysis runs in a **Web Worker**.

## V6 Stage-3 focus
- **Multi-Engine Correlation** — normalize & correlate AST / Data-Flow / CFG / Symbolic / DOM / Test / Mutation / Dependency evidence
- **Evidence Graph** — nodes (source, sink, control, symbol, test…) and edges (reaches, controls, imports, propagates…)
- **Adaptive Analysis Orchestrator** — selects engines by candidate complexity (simple / medium / security / complex)
- **Adaptive Confidence** — stage-wise boost from real evidence; contradiction penalty
- **Contradiction Engine** — records disagreement (e.g. data-flow reach vs CFG unreachable) → may yield INCONCLUSIVE
- **Browser DOM Static Analysis** — selectors vs HTML ids/classes, lifecycle signals, safe textContent vs unsafe HTML sinks
- **DOM Data-Flow** — source → transform → DOM sink correlation (literal HTML alone ≠ confirmed XSS)
- **Git History Analysis** — only when metadata is supplied; otherwise `NOT_AVAILABLE` (no fake data)
- **Hotspot Ranking** — change frequency + bug frequency + complexity + centrality + security exposure (Hotspot ≠ Bug)
- **Root-Cause Intelligence** — candidates ranked with Evidence Graph support; CONFIRMED only with sufficient evidence
- **Unified Finding Schema** — problemId, classification, evidenceGraph, flow, hotspotScore, detectingStrategies, …

## V6 Stage-2 focus
- Automatic Test Generation (STATIC/SIMULATED scenarios — no fake runtime)
- Test-driven validation statuses: SUPPORTED / INCONCLUSIVE / …
- Mutation testing (virtual; kill/survive sensitivity)
- Dependency + API contract analysis on Module Graph
- Regression learning vs local baselines
- Root-cause ranking (symptom ≠ recommendation)
- Orchestrator: runs engines by candidate complexity

## V6 Stage-1 focus
- Deep Data Flow (assign / reassign / param / return / multi-hop, max ~6 hops)
- CFG (if/else, loops, return, try/catch, unreachable, always-true/false)
- Limited Symbolic Execution (null/undefined/true/false constants on paths)
- Module Graph (import/export edges; cross-file flow only along real edges)

## V6 focus
- Structural parsing + Code Model (symbols, imports/exports, calls, assignments)
- Lightweight data-flow (source → sink, limited hops)
- Source-to-sink security analysis (not keyword-only)
- Central Validation / Confidence / False-Positive gates
- Root-cause vs symptom separation
- Internal benchmark suite (`js/benchmark-suite.js`)

## Levels
| Level | Budget |
|-------|--------|
| Quick | ≤ 5 strategies |
| Full | 10–15 |
| Deep | 25–35 |
| Special | context-applicable deeper set |
| Test All | all applicable strategies |

## Structure
```
auto-debugger/
  index.html
  styles.css
  app.js
  js/
    analysis-standards.js   # Candidate → Validation → Confidence → Finding
    ast.js                  # Structural parser + Code Model + Data-Flow
    analysis-core.js        # Stage-1: CFG, Symbolic, Module Graph, Deep DF
    stage2-core.js          # Tests, Mutation, Deps, Regression, Root-Cause
    stage3-core.js          # Correlation, Evidence Graph, DOM, Git, Adaptive
    strategies.js
    engines/debug-engine.js
    worker/analysis-worker.js
    benchmark-suite.js
    ...
```

## Constraint
Browser-Only + Web Worker + GitHub Pages compatible. No backend / Docker / External API / Sandbox.
No real runtime execution is claimed. Git analysis requires caller-supplied metadata.
