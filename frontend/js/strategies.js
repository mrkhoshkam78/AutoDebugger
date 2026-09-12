/**
 * Analysis Strategy Registry — Auto Debugger V2.0
 * Controls which checks run per Test Level (Quick≤5, Full≤15, Deep 30–50).
 */
(function (global) {
  "use strict";

  /**
   * Each strategy:
   * id, name, category, langs[], requires{}, levels[], priority (1=highest),
   * cost (1-5), method (engine hook name)
   */
  var STRATEGIES = [
    // ── Syntax / structure (Quick core) ──
    { id: "SYN-EMPTY", name: "Empty file", category: "Syntax", langs: ["*"], requires: {}, levels: [1,2,3], priority: 1, cost: 1, method: "emptyFile" },
    { id: "SYN-JS-BALANCE", name: "JS bracket balance", category: "Syntax", langs: ["javascript","typescript"], requires: {}, levels: [1,2,3], priority: 1, cost: 1, method: "jsBalance" },
    { id: "SYN-PY-COLON", name: "Python missing colon", category: "Syntax", langs: ["python"], requires: {}, levels: [1,2,3], priority: 1, cost: 1, method: "pyColon" },
    { id: "SYN-PY-INDENT", name: "Python mixed indent", category: "Syntax", langs: ["python"], requires: {}, levels: [1,2,3], priority: 2, cost: 1, method: "pyIndent" },
    { id: "SYN-PY-BALANCE", name: "Python bracket balance", category: "Syntax", langs: ["python"], requires: {}, levels: [1,2,3], priority: 2, cost: 1, method: "pyBalance" },
    { id: "SYN-HTML-UNCLOSED", name: "HTML unclosed tags", category: "Syntax", langs: ["html"], requires: { html: true }, levels: [1,2,3], priority: 2, cost: 2, method: "htmlUnclosed" },
    { id: "SYN-HTML-DOCTYPE", name: "HTML DOCTYPE", category: "Syntax", langs: ["html"], requires: { html: true }, levels: [1,2,3], priority: 3, cost: 1, method: "htmlDoctype" },
    { id: "SYN-CSS-BALANCE", name: "CSS brace balance", category: "Syntax", langs: ["css"], requires: { css: true }, levels: [1,2,3], priority: 1, cost: 1, method: "cssBalance" },
    { id: "SYN-JSON", name: "JSON validity", category: "Syntax", langs: ["json"], requires: {}, levels: [1,2,3], priority: 1, cost: 1, method: "jsonValid" },
    { id: "SYN-JS-DOTSPACE", name: "JS malformed call", category: "Syntax", langs: ["javascript","typescript"], requires: {}, levels: [2,3], priority: 4, cost: 1, method: "jsDotSpace" },
    { id: "SYN-CSS-EMPTY", name: "CSS empty rules", category: "Syntax", langs: ["css"], requires: { css: true }, levels: [2,3], priority: 5, cost: 1, method: "cssEmpty" },

    // ── Security ──
    { id: "SEC-EVAL", name: "eval() usage", category: "Security", langs: ["javascript","typescript","html"], requires: {}, levels: [1,2,3], priority: 1, cost: 1, method: "secEval" },
    { id: "SEC-INNERHTML", name: "innerHTML assignment", category: "Security", langs: ["javascript","typescript","html"], requires: {}, levels: [1,2,3], priority: 2, cost: 1, method: "secInnerHTML" },
    { id: "SEC-DOCWRITE", name: "document.write", category: "Security", langs: ["javascript","typescript","html"], requires: {}, levels: [2,3], priority: 3, cost: 1, method: "secDocWrite" },
    { id: "SEC-PASSWORD", name: "Hardcoded password", category: "Security", langs: ["*"], requires: {}, levels: [1,2,3], priority: 2, cost: 1, method: "secPassword" },
    { id: "SEC-APIKEY", name: "Hardcoded API key", category: "Security", langs: ["*"], requires: {}, levels: [1,2,3], priority: 1, cost: 1, method: "secApiKey" },
    { id: "SEC-INLINE-JS", name: "Inline event handlers", category: "Security", langs: ["html"], requires: { html: true }, levels: [3], priority: 4, cost: 2, method: "secInlineJs" },
    { id: "SEC-HTTP-LINK", name: "Insecure http resources", category: "Security", langs: ["html","css","javascript"], requires: {}, levels: [3], priority: 5, cost: 2, method: "secHttp" },

    // ── Code / Logic ──
    { id: "LOG-CROSS-REF", name: "Cross-file references", category: "Code / Logic", langs: ["*"], requires: {}, levels: [2,3], priority: 2, cost: 3, method: "crossRefs" },
    { id: "LOG-DOM-ID", name: "DOM id resolution", category: "Code / Logic", langs: ["javascript","typescript"], requires: { html: true, js: true }, levels: [2,3], priority: 2, cost: 3, method: "domIds" },
    { id: "LOG-TODO", name: "TODO/FIXME markers", category: "Code / Logic", langs: ["*"], requires: {}, levels: [2,3], priority: 5, cost: 1, method: "todoFixme" },
    { id: "LOG-ENTRY", name: "Entry point presence", category: "Code / Logic", langs: ["*"], requires: {}, levels: [3], priority: 6, cost: 1, method: "entryPoint" },
    { id: "LOG-CONSOLE", name: "console.debug leftovers", category: "Code / Logic", langs: ["javascript","typescript"], requires: {}, levels: [3], priority: 6, cost: 1, method: "consoleDebug" },
    { id: "LOG-DUPLICATE-FN", name: "Duplicate function names", category: "Code / Logic", langs: ["javascript","typescript","python"], requires: {}, levels: [3], priority: 4, cost: 3, method: "dupFunctions" },
    { id: "LOG-UNDEF-VAR", name: "Obvious undefined patterns", category: "Code / Logic", langs: ["javascript","typescript"], requires: {}, levels: [3], priority: 4, cost: 2, method: "undefPatterns" },

    // ── UI ──
    { id: "UI-IMG-ALT", name: "Image alt attributes", category: "UI", langs: ["html"], requires: { html: true }, levels: [1,2,3], priority: 2, cost: 1, method: "imgAlt" },
    { id: "UI-BUTTON-TYPE", name: "Button type attribute", category: "UI", langs: ["html"], requires: { html: true }, levels: [3], priority: 5, cost: 1, method: "btnType" },
    { id: "UI-LABEL-INPUT", name: "Input without label", category: "UI", langs: ["html"], requires: { html: true }, levels: [3], priority: 4, cost: 2, method: "inputLabel" },
    { id: "UI-TITLE", name: "Missing document title", category: "UI", langs: ["html"], requires: { html: true }, levels: [2,3], priority: 3, cost: 1, method: "docTitle" },

    // ── UX ──
    { id: "UX-PX-FONT", name: "Fixed px typography", category: "UX", langs: ["css","html"], requires: { web: true }, levels: [2,3], priority: 4, cost: 1, method: "pxFont" },
    { id: "UX-FOCUS", name: "Outline:none without focus style", category: "UX", langs: ["css"], requires: { css: true }, levels: [3], priority: 5, cost: 2, method: "outlineNone" },
    { id: "UX-SMALL-TARGET", name: "Very small click targets", category: "UX", langs: ["css"], requires: { css: true }, levels: [3], priority: 5, cost: 2, method: "smallTarget" },

    // ── Performance ──
    { id: "PERF-SCRIPTS", name: "Many script tags", category: "Performance", langs: ["html"], requires: { html: true }, levels: [2,3], priority: 3, cost: 1, method: "manyScripts" },
    { id: "PERF-IMPORT", name: "CSS @import", category: "Performance", langs: ["css"], requires: { css: true }, levels: [2,3], priority: 3, cost: 1, method: "cssImport" },
    { id: "PERF-INLINE-STYLE", name: "Heavy inline styles", category: "Performance", langs: ["html"], requires: { html: true }, levels: [3], priority: 5, cost: 2, method: "inlineStyles" },
    { id: "PERF-LARGE-FILE", name: "Very large source file", category: "Performance", langs: ["*"], requires: {}, levels: [3], priority: 6, cost: 1, method: "largeFile" },

    // ── Responsive ──
    { id: "RESP-VIEWPORT", name: "Viewport meta", category: "Responsive behavior", langs: ["html"], requires: { html: true }, levels: [1,2,3], priority: 1, cost: 1, method: "viewport" },
    { id: "RESP-MEDIA", name: "CSS media queries", category: "Responsive behavior", langs: ["css"], requires: { html: true, css: true }, levels: [2,3], priority: 2, cost: 1, method: "mediaQueries" },
    { id: "RESP-FIXED-WIDTH", name: "Fixed large widths", category: "Responsive behavior", langs: ["css","html"], requires: { web: true }, levels: [3], priority: 4, cost: 2, method: "fixedWidth" },
    { id: "RESP-NO-MAX", name: "Images without max-width", category: "Responsive behavior", langs: ["css","html"], requires: { web: true }, levels: [3], priority: 5, cost: 2, method: "imgMaxWidth" },

    // ── Structure / Architecture ──
    { id: "ARCH-MODULES", name: "Many JS modules", category: "Structure / Architecture", langs: ["javascript","typescript"], requires: {}, levels: [3], priority: 5, cost: 1, method: "manyModules" },
    { id: "ARCH-MIXED-LANG", name: "Mixed language density", category: "Structure / Architecture", langs: ["*"], requires: {}, levels: [3], priority: 6, cost: 1, method: "mixedLang" },
    { id: "ARCH-DEEP-PATH", name: "Very deep folder paths", category: "Structure / Architecture", langs: ["*"], requires: {}, levels: [3], priority: 7, cost: 1, method: "deepPath" },
    { id: "ARCH-DUP-NAME", name: "Duplicate file basenames", category: "Structure / Architecture", langs: ["*"], requires: {}, levels: [3], priority: 4, cost: 2, method: "dupBasename" },

    // Deep-only advanced patterns
    { id: "DEEP-NESTED-LOOP", name: "Deeply nested loops (signal)", category: "Code / Logic", langs: ["javascript","typescript","python"], requires: {}, levels: [3], priority: 5, cost: 3, method: "nestedLoops" },
    { id: "DEEP-LONG-FN", name: "Very long functions", category: "Code / Logic", langs: ["javascript","typescript","python"], requires: {}, levels: [3], priority: 5, cost: 3, method: "longFunction" },
    { id: "DEEP-MAGIC-NUM", name: "Magic numbers concentration", category: "Code / Logic", langs: ["javascript","typescript","python"], requires: {}, levels: [3], priority: 6, cost: 2, method: "magicNumbers" },
    { id: "DEEP-CSS-IMPORTANT", name: "Excessive !important", category: "UI", langs: ["css"], requires: { css: true }, levels: [3], priority: 5, cost: 1, method: "cssImportant" },
    { id: "DEEP-CSS-ID-SEL", name: "Heavy ID selectors", category: "UI", langs: ["css"], requires: { css: true }, levels: [3], priority: 6, cost: 1, method: "cssIdSel" },
    { id: "DEEP-A11Y-TABINDEX", name: "Positive tabindex", category: "UX", langs: ["html"], requires: { html: true }, levels: [3], priority: 5, cost: 1, method: "tabIndex" },
    { id: "DEEP-META-DESC", name: "Missing meta description", category: "UI", langs: ["html"], requires: { html: true }, levels: [3], priority: 6, cost: 1, method: "metaDesc" },
    { id: "DEEP-LANG-ATTR", name: "Missing html lang", category: "UI", langs: ["html"], requires: { html: true }, levels: [2,3], priority: 4, cost: 1, method: "htmlLang" }
  ];

  var LEVEL_CAPS = { 1: 5, 2: 15, 3: 50 };
  var LEVEL_MIN_DEEP = 30;

  var ALL_CATEGORIES = [
    "Code / Logic", "UI", "UX", "Performance", "Syntax",
    "Security", "Responsive behavior", "Structure / Architecture"
  ];

  function contextOk(requires, ctx) {
    if (!requires) return true;
    var has = ctx.has || {};
    if (requires.html && !has.html) return false;
    if (requires.css && !has.css) return false;
    if (requires.js && !has.js && !has.ts) return false;
    if (requires.web && !(has.html || has.css || has.js || has.ts)) return false;
    return true;
  }

  function langOk(strategy, ctx) {
    var langs = strategy.langs || ["*"];
    if (langs.indexOf("*") !== -1) return true;
    var present = ctx.languages || {};
    for (var i = 0; i < langs.length; i++) {
      if (present[langs[i]]) return true;
    }
    // also if any file matches
    return false;
  }

  /**
   * Select strategies for a run.
   * category: specific or "Test All"
   * level: 1|2|3
   */
  function selectStrategies(category, level, ctx) {
    level = Math.min(3, Math.max(1, parseInt(level, 10) || 1));
    var cap = LEVEL_CAPS[level] || 5;
    var categories = category === "Test All" ? ALL_CATEGORIES.slice() : [category];

    var candidates = [];
    var skipped = [];

    for (var i = 0; i < STRATEGIES.length; i++) {
      var s = STRATEGIES[i];
      if (s.levels.indexOf(level) === -1) continue;
      if (categories.indexOf(s.category) === -1) continue;
      if (!contextOk(s.requires, ctx)) {
        skipped.push({ rule: s.id, reason: "context", status: "NOT_APPLICABLE", category: s.category });
        continue;
      }
      if (!langOk(s, ctx) && (s.langs || []).indexOf("*") === -1) {
        // allow if project has no language match for specialized strategies
        var hasAnyLang = false;
        var L = s.langs || [];
        for (var j = 0; j < L.length; j++) {
          if ((ctx.languages || {})[L[j]]) hasAnyLang = true;
        }
        if (!hasAnyLang) {
          skipped.push({ rule: s.id, reason: "language", status: "NOT_APPLICABLE", category: s.category });
          continue;
        }
      }
      candidates.push(s);
    }

    candidates.sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.cost - b.cost;
    });

    // Deep aims for at least 30 when enough candidates exist
    if (level === 3 && candidates.length > cap) {
      candidates = candidates.slice(0, cap);
    } else if (level === 3 && candidates.length < LEVEL_MIN_DEEP) {
      // already filtered; keep all applicable under 50
      candidates = candidates.slice(0, Math.min(candidates.length, cap));
    } else {
      candidates = candidates.slice(0, cap);
    }

    return { selected: candidates, skipped: skipped, cap: cap, level: level };
  }

  function getAllCategories() { return ALL_CATEGORIES.slice(); }
  function getRegistry() { return STRATEGIES.slice(); }
  function getCaps() { return { quick: LEVEL_CAPS[1], full: LEVEL_CAPS[2], deep: LEVEL_CAPS[3], deepMin: LEVEL_MIN_DEEP }; }

  global.ADStrategies = {
    selectStrategies: selectStrategies,
    getAllCategories: getAllCategories,
    getRegistry: getRegistry,
    getCaps: getCaps,
    ALL_CATEGORIES: ALL_CATEGORIES,
    STRATEGIES: STRATEGIES
  };
})(typeof window !== "undefined" ? window : globalThis);
