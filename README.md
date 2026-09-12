# Auto Debugger V3.05

Browser-only static analysis debugger.

## Run
Open `index.html` in a browser, or deploy this folder to **GitHub Pages**.

No server, no install, offline-first.

## Levels
| Level | Strategies (approx.) |
|-------|----------------------|
| Quick | ≤ 5 |
| Full | 10–15 |
| Deep | 25–35 |
| Special | 50–80 context-applicable |
| Test All | all applicable strategies |

## Structure
```
auto-debugger/
  index.html
  styles.css
  app.js
  media/
  js/
    analysis-standards.js
    ast.js
    strategies.js
    engines/debug-engine.js
    worker/analysis-worker.js
    ...
```
