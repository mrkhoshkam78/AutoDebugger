# Auto Debugger V11.6.0

Browser-only static analysis debugger — Evidence-Driven Static Bug Analysis Engine with specialized engines.

## Run
Open `index.html` in a browser, or deploy this folder to **GitHub Pages**.

No server, no install, offline-first. Analysis runs in a **Web Worker** with Pause / Resume / Cancel.

## V11.6.0 focus
- **UI fixes**: problem-list expand/collapse, file-list layout, hamburger menu visibility (mobile-only), settings page full design-system alignment + contrast
- **Deep / Special** budgets increased (~2×): Deep ≤55 strategies, Special ≤120
- **Syntax engine** upgraded: unreachable code, ASI return trap, duplicate keys, assignment-in-condition, bare except, duplicate HTML ids, template balance, JSON trailing comma, and more
- **Math / Calculations engine** upgraded: modulo-by-zero, float equality, overflow signals, unit mix, accumulator init, Math.random in security context, negative index, tax/discount double-apply
- Shared infrastructure (AST, Code Model, Validation, Correlation) kept non-duplicated

## Levels
| Level | Budget |
|-------|--------|
| Quick | ≤ 5 strategies |
| Full | 10–15 |
| Deep | ≤ 55 |
| Special | ≤ 120 |
| Test All | all applicable strategies |

## Constraint
Browser-Only + Web Worker + GitHub Pages compatible. No backend / Docker / External API / Sandbox.
No real runtime execution is claimed.
