# Auto Debugger V6

Browser-only static analysis debugger — Evidence-Driven Static Bug Analysis Engine.

## Run
Open `index.html` in a browser, or deploy this folder to **GitHub Pages**.

No server, no install, offline-first. Analysis runs in a **Web Worker**.

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
    strategies.js
    engines/debug-engine.js
    worker/analysis-worker.js
    benchmark-suite.js
    ...
```

## Constraint
Browser-Only + Web Worker + GitHub Pages compatible. No backend.
