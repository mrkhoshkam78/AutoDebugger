# Auto Debugger V1.1 — Browser-Only / Offline-First

Professional static-analysis debugger that runs **entirely in the browser**.

**No Python server · No Node server · No Docker · No cloud · No login**

Open `frontend/index.html` directly or deploy the `frontend/` folder to GitHub Pages.

## Quick Start

### Option 1 — Direct file
Open `frontend/index.html` in any modern browser (Chrome, Firefox, Edge, Safari).

### Option 2 — GitHub Pages
Push the `frontend/` folder and enable Pages. Fully offline-capable after first load.

### Option 3 — Optional static serve
```bash
npx serve frontend
# or: python3 -m http.server 8080 --directory frontend
```
(Not required for core functionality.)

## Architecture (V1.1)

```
Browser
  ├── File / ZIP upload (FileReader + JSZip)
  ├── Project Mapper      → internal graph (files, imports, DOM ids, refs)
  ├── Debug Engine        → Levels 1 / 2 / 3 static analysis
  ├── Test Engine         → integrated diagnostic suites
  ├── Root Cause Engine   → symptom vs probable root cause + confidence
  └── IndexedDB Knowledge → offline pattern store (no remote DB)
```

All analysis is **static**. Uploaded code is never executed in the page context.

## Features preserved & extended from V1

- Upload single files, multiple files, or ZIP projects
- Languages: HTML, CSS, JS/TS, Python, Java, C/C++, PHP, JSON, …
- Categories: Code/Logic, UI, UX, Performance, Syntax, Security, Responsive, Structure/Architecture
- Test levels 1 (Quick), 2 (Full), 3 (Deep)
- Structured reports with Problem ID, Severity, File, Line, Root cause, Symptom, Evidence, Impact, Confidence, Detecting test
- Filters by severity / file
- Modern responsive dashboard
- **New**: fully client-side, offline, IndexedDB learning, root-cause fields, local-only badge

## Project layout

```
auto-debugger/
├── frontend/                 ← THE APPLICATION (deploy this)
│   ├── index.html
│   ├── styles.css
│   ├── app.js                ← orchestrator (ES module)
│   └── js/
│       ├── lib/
│       │   ├── utils.js
│       │   └── jszip.min.js  ← vendored ZIP extractor
│       ├── project-mapper.js
│       ├── knowledge-db.js   ← IndexedDB
│       └── engines/
│           └── debug-engine.js
├── samples/                  ← test fixtures
├── backend/                  ← LEGACY (no longer required)
└── README.md
```

## Security

- No network upload of user source
- ZIP paths sanitized
- Size limits on files and extracted content
- No eval / new Function on user code
- Output is HTML-escaped when rendered

## IndexedDB schema

- Store: `patterns`
- Fields: language, category, severity, description, root_cause, patternKey, confidence, frequency, timestamp

## Limitations

- Python syntax checks are heuristic (no full AST in browser)
- No true runtime execution of uploaded code (by design)
- Very large ZIPs rejected to protect the tab
- Knowledge DB gracefully degrades if IndexedDB is blocked

## Migration from V1.0

- `backend/server.py` and `start.sh` are **no longer required**
- All analysis logic lives in `frontend/js/engines/debug-engine.js`
- API calls to localhost removed
- UI updated with local/offline indicators; core layout preserved
