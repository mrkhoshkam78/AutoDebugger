# Auto Debugger V6

Browser-only static analysis debugger — Evidence-Driven Static Bug Analysis Engine.

## Run
Open `index.html` in a browser, or deploy this folder to **GitHub Pages**.

No server, no install, offline-first. Analysis runs in a **Web Worker**.

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
