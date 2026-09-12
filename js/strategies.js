/**
 * Strategy Registry — Auto Debugger V3.0
 * Quality over quantity. Realistic unique strategies.
 * Quick ≤5 | Full ≤15 | Deep ≤35 | Special ≤80
 */
(function (global) {
  "use strict";

  /**
   * id, name, category, langs[], requires{}, levels[], priority (1=high), cost, method, description
   */
  var STRATEGIES = [
    // ── Syntax (core) ──
    { id: "SYN-EMPTY", name: "Empty file", category: "Syntax", langs: ["*"], requires: {}, levels: [1,2,3,4], priority: 1, cost: 1, method: "emptyFile", description: "Detect blank files" },
    { id: "SYN-JS-BALANCE", name: "JS/TS delimiter balance", category: "Syntax", langs: ["javascript","typescript"], requires: {}, levels: [1,2,3,4], priority: 1, cost: 1, method: "jsBalance", description: "Unbalanced braces/parens" },
    { id: "SYN-CSS-BALANCE", name: "CSS brace balance", category: "Syntax", langs: ["css"], requires: { css: true }, levels: [1,2,3,4], priority: 1, cost: 1, method: "cssBalance", description: "Unbalanced CSS braces" },
    { id: "SYN-PY-COLON", name: "Python missing colon", category: "Syntax", langs: ["python"], requires: {}, levels: [1,2,3,4], priority: 1, cost: 1, method: "pyColon", description: "Compound stmt without :" },
    { id: "SYN-PY-INDENT", name: "Python mixed indent", category: "Syntax", langs: ["python"], requires: {}, levels: [1,2,3,4], priority: 2, cost: 1, method: "pyIndent", description: "Tabs mixed with spaces" },
    { id: "SYN-PY-BALANCE", name: "Python bracket balance", category: "Syntax", langs: ["python"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "pyBalance", description: "Unbalanced brackets" },
    { id: "SYN-HTML-UNCLOSED", name: "HTML unclosed tags", category: "Syntax", langs: ["html"], requires: { html: true }, levels: [1,2,3,4], priority: 2, cost: 2, method: "htmlUnclosed", description: "Net-open tags" },
    { id: "SYN-HTML-DOCTYPE", name: "HTML DOCTYPE", category: "Syntax", langs: ["html"], requires: { html: true }, levels: [2,3,4], priority: 3, cost: 1, method: "htmlDoctype", description: "Missing DOCTYPE" },
    { id: "SYN-JSON", name: "JSON validity", category: "Syntax", langs: ["json"], requires: {}, levels: [1,2,3,4], priority: 1, cost: 1, method: "jsonValid", description: "Parse JSON" },
    { id: "SYN-JS-DOTSPACE", name: "JS malformed call", category: "Syntax", langs: ["javascript","typescript"], requires: {}, levels: [2,3,4], priority: 4, cost: 1, method: "jsDotSpace", description: "dot-space call pattern" },
    { id: "SYN-CSS-EMPTY", name: "Empty CSS rules", category: "Syntax", langs: ["css"], requires: { css: true }, levels: [3,4], priority: 5, cost: 1, method: "cssEmpty", description: "Empty { }" },

    // ── Security ──
    { id: "SEC-EVAL", name: "eval() usage", category: "Security", langs: ["javascript","typescript","html"], requires: {}, levels: [1,2,3,4], priority: 1, cost: 1, method: "secEval", description: "Dynamic code execution" },
    { id: "SEC-INNERHTML", name: "innerHTML assignment", category: "Security", langs: ["javascript","typescript","html"], requires: {}, levels: [1,2,3,4], priority: 2, cost: 1, method: "secInnerHTML", description: "DOM XSS sink" },
    { id: "SEC-OUTERHTML", name: "outerHTML assignment", category: "Security", langs: ["javascript","typescript","html"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "secOuterHTML", description: "outerHTML sink" },
    { id: "SEC-INSERTADJ", name: "insertAdjacentHTML", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "secInsertAdj", description: "HTML injection sink" },
    { id: "SEC-FUNCTION-CTOR", name: "Function constructor", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "secFunctionCtor", description: "eval-like constructor" },
    { id: "SEC-DOCWRITE", name: "document.write", category: "Security", langs: ["javascript","typescript","html"], requires: {}, levels: [2,3,4], priority: 3, cost: 1, method: "secDocWrite", description: "document.write sink" },
    { id: "SEC-JS-URL", name: "javascript: URL", category: "Security", langs: ["html","javascript","typescript"], requires: {}, levels: [1,2,3,4], priority: 1, cost: 1, method: "secJsUrl", description: "javascript: protocol" },
    { id: "SEC-APIKEY", name: "Hardcoded API key", category: "Security", langs: ["*"], requires: {}, levels: [1,2,3,4], priority: 1, cost: 1, method: "secApiKey", description: "Secret in source" },
    { id: "SEC-PASSWORD", name: "Hardcoded password", category: "Security", langs: ["*"], requires: {}, levels: [1,2,3,4], priority: 2, cost: 1, method: "secPassword", description: "Password literal" },
    { id: "SEC-LOC-STORE", name: "Sensitive localStorage", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [2,3,4], priority: 3, cost: 2, method: "secLocalStorage", description: "Secrets in storage" },
    { id: "SEC-SRC-SINK", name: "Source-to-sink XSS", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 2, cost: 3, method: "secSourceSink", description: "Input → HTML sink" },
    { id: "SEC-POSTMESSAGE", name: "postMessage wildcard", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 3, cost: 2, method: "secPostMessage", description: "targetOrigin *" },
    { id: "SEC-IFRAME", name: "iframe without sandbox", category: "Security", langs: ["html"], requires: { html: true }, levels: [2,3,4], priority: 3, cost: 1, method: "secIframe", description: "Unsandboxed iframe" },
    { id: "SEC-TARGET-BLANK", name: "target=_blank without noopener", category: "Security", langs: ["html"], requires: { html: true }, levels: [2,3,4], priority: 4, cost: 1, method: "secTargetBlank", description: "opener risk" },
    { id: "SEC-COOKIE", name: "document.cookie write", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 4, cost: 1, method: "secCookie", description: "Client cookie set" },
    { id: "SEC-CMD-INJECT", name: "Command injection signal", category: "Security", langs: ["python","php","javascript"], requires: {}, levels: [3,4], priority: 2, cost: 2, method: "secCmdInject", description: "Shell + user data" },
    { id: "SEC-PY-PICKLE", name: "Unsafe pickle", category: "Security", langs: ["python"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "secPyPickle", description: "pickle.load" },
    { id: "SEC-PY-YAML", name: "Unsafe yaml.load", category: "Security", langs: ["python"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "secPyYaml", description: "yaml without SafeLoader" },
    { id: "SEC-PHP-SQL", name: "PHP SQL concat", category: "Security", langs: ["php"], requires: {}, levels: [2,3,4], priority: 2, cost: 2, method: "secPhpSql", description: "User input in SQL" },
    { id: "CMB-XSS-CHAIN", name: "Cross-file XSS chain", category: "Security", langs: ["javascript","typescript","html"], requires: {}, levels: [4], priority: 1, cost: 4, method: "cmbXssChain", description: "Source file + sink file" },
    { id: "CMB-SECRET-FLOW", name: "Secret + storage combo", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [4], priority: 2, cost: 3, method: "cmbSecretStorage", description: "Hardcoded secret + localStorage" },

    // ── Code / Logic ──
    { id: "LOG-CROSS-REF", name: "Cross-file references", category: "Code / Logic", langs: ["*"], requires: {}, levels: [2,3,4], priority: 2, cost: 3, method: "crossRefs", description: "Missing assets/refs" },
    { id: "LOG-DOM-ID", name: "DOM id resolution", category: "Code / Logic", langs: ["javascript","typescript"], requires: { html: true, js: true }, levels: [2,3,4], priority: 2, cost: 3, method: "domIds", description: "Missing element ids" },
    { id: "LOG-TODO", name: "TODO/FIXME markers", category: "Code / Logic", langs: ["*"], requires: {}, levels: [2,3,4], priority: 5, cost: 1, method: "todoFixme", description: "Unfinished work markers" },
    { id: "LOG-ENTRY", name: "Entry point presence", category: "Code / Logic", langs: ["*"], requires: {}, levels: [3,4], priority: 6, cost: 1, method: "entryPoint", description: "No index/main" },
    { id: "LOG-CONSOLE", name: "console leftovers", category: "Code / Logic", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 6, cost: 1, method: "consoleDebug", description: "Debug logs left in" },
    { id: "LOG-DUP-FN", name: "Duplicate function names", category: "Code / Logic", langs: ["javascript","typescript","python"], requires: {}, levels: [3,4], priority: 4, cost: 3, method: "dupFunctions", description: "Same name multi-file" },
    { id: "CR-NULL-GUARD", name: "Missing null guards", category: "Code / Logic", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 3, cost: 2, method: "crNullGuard", description: "getElementById without check" },
    { id: "CR-EMPTY-CATCH", name: "Empty catch blocks", category: "Code / Logic", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 3, cost: 1, method: "crEmptyCatch", description: "Swallowed errors" },
    { id: "CR-PROMISE-CATCH", name: "Promise without catch", category: "Code / Logic", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 3, cost: 2, method: "crPromiseCatch", description: "Unhandled rejection risk" },
    { id: "CR-OFF-BY-ONE", name: "Off-by-one loop", category: "Code / Logic", langs: ["javascript","typescript"], requires: {}, levels: [4], priority: 4, cost: 2, method: "crOffByOne", description: "<= length loops" },
    { id: "CR-LISTENER-LEAK", name: "Listener without remove", category: "Code / Logic", langs: ["javascript","typescript"], requires: {}, levels: [4], priority: 5, cost: 2, method: "crListenerLeak", description: "addEventListener only" },
    { id: "CR-TYPE-EQ", name: "Loose equality", category: "Code / Logic", langs: ["javascript","typescript"], requires: {}, levels: [4], priority: 5, cost: 1, method: "crTypeConfusion", description: "Use of ==" },
    { id: "CR-EMPTY-INPUT", name: "Unguarded input value", category: "Code / Logic", langs: ["javascript","typescript"], requires: {}, levels: [4], priority: 5, cost: 2, method: "crEmptyInput", description: ".value without empty check" },
    { id: "DEEP-NESTED-LOOP", name: "Nested loops", category: "Code / Logic", langs: ["javascript","typescript","python"], requires: {}, levels: [4], priority: 5, cost: 3, method: "nestedLoops", description: "Complexity signal" },
    { id: "DEEP-LONG-FN", name: "Very long file", category: "Code / Logic", langs: ["javascript","typescript","python"], requires: {}, levels: [4], priority: 6, cost: 1, method: "longFunction", description: ">300 lines" },
    { id: "DEEP-MAGIC", name: "Magic number density", category: "Code / Logic", langs: ["javascript","typescript","python"], requires: {}, levels: [4], priority: 6, cost: 2, method: "magicNumbers", description: "Many numeric literals" },

    // ── UI / UX ──
    { id: "UI-IMG-ALT", name: "Image alt attributes", category: "UI", langs: ["html"], requires: { html: true }, levels: [1,2,3,4], priority: 2, cost: 1, method: "imgAlt", description: "Missing alt" },
    { id: "UI-TITLE", name: "Document title", category: "UI", langs: ["html"], requires: { html: true }, levels: [2,3,4], priority: 3, cost: 1, method: "docTitle", description: "Missing title" },
    { id: "UI-LANG", name: "html lang attribute", category: "UI", langs: ["html"], requires: { html: true }, levels: [2,3,4], priority: 4, cost: 1, method: "htmlLang", description: "Missing lang" },
    { id: "UI-BUTTON-TYPE", name: "Button type", category: "UI", langs: ["html"], requires: { html: true }, levels: [3,4], priority: 5, cost: 1, method: "btnType", description: "Button without type" },
    { id: "UI-LABEL-INPUT", name: "Input labels", category: "UI", langs: ["html"], requires: { html: true }, levels: [3,4], priority: 4, cost: 2, method: "inputLabel", description: "Inputs without label" },
    { id: "UI-META-DESC", name: "Meta description", category: "UI", langs: ["html"], requires: { html: true }, levels: [4], priority: 6, cost: 1, method: "metaDesc", description: "Missing meta description" },
    { id: "UX-PX-FONT", name: "Fixed px fonts", category: "UX", langs: ["css","html"], requires: { web: true }, levels: [2,3,4], priority: 4, cost: 1, method: "pxFont", description: "Only px font-size" },
    { id: "UX-OUTLINE", name: "outline:none without focus", category: "UX", langs: ["css"], requires: { css: true }, levels: [3,4], priority: 4, cost: 2, method: "outlineNone", description: "Keyboard focus lost" },
    { id: "UX-TABINDEX", name: "Positive tabindex", category: "UX", langs: ["html"], requires: { html: true }, levels: [3,4], priority: 5, cost: 1, method: "tabIndex", description: "tabindex > 0" },
    { id: "UX-SMALL-TARGET", name: "Small click targets", category: "UX", langs: ["css"], requires: { css: true }, levels: [4], priority: 5, cost: 2, method: "smallTarget", description: "Very small width/height" },
    { id: "CR-DOUBLE-SUBMIT", name: "Form double-submit", category: "UI", langs: ["html","javascript"], requires: {}, levels: [4], priority: 5, cost: 2, method: "crDoubleSubmit", description: "No submit guard" },
    { id: "CR-Z-INDEX", name: "Extreme z-index", category: "UI", langs: ["css","html"], requires: {}, levels: [4], priority: 6, cost: 1, method: "crZIndex", description: "z-index ≥ 10000" },
    { id: "DEEP-CSS-IMPORTANT", name: "Excessive !important", category: "UI", langs: ["css"], requires: { css: true }, levels: [4], priority: 5, cost: 1, method: "cssImportant", description: "Many !important" },
    { id: "DEEP-CSS-ID", name: "Heavy ID selectors", category: "UI", langs: ["css"], requires: { css: true }, levels: [4], priority: 6, cost: 1, method: "cssIdSel", description: "Many #id rules" },

    // ── Performance ──
    { id: "PERF-SCRIPTS", name: "Many script tags", category: "Performance", langs: ["html"], requires: { html: true }, levels: [2,3,4], priority: 3, cost: 1, method: "manyScripts", description: ">5 scripts" },
    { id: "PERF-IMPORT", name: "CSS @import", category: "Performance", langs: ["css"], requires: { css: true }, levels: [2,3,4], priority: 3, cost: 1, method: "cssImport", description: "@import delays" },
    { id: "PERF-INLINE", name: "Heavy inline styles", category: "Performance", langs: ["html"], requires: { html: true }, levels: [3,4], priority: 5, cost: 2, method: "inlineStyles", description: "Long style attrs" },
    { id: "PERF-LARGE", name: "Very large file", category: "Performance", langs: ["*"], requires: {}, levels: [3,4], priority: 6, cost: 1, method: "largeFile", description: ">200KB source" },
    { id: "PERF-SYNC-XHR", name: "Synchronous XHR", category: "Performance", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 2, cost: 1, method: "crSyncXhr", description: "xhr open false" },
    { id: "PERF-ANIM", name: "Infinite animation", category: "Performance", langs: ["css"], requires: { css: true }, levels: [4], priority: 5, cost: 1, method: "crAnimInfinite", description: "animation infinite" },

    // ── Responsive ──
    { id: "RESP-VIEWPORT", name: "Viewport meta", category: "Responsive behavior", langs: ["html"], requires: { html: true }, levels: [1,2,3,4], priority: 1, cost: 1, method: "viewport", description: "Missing viewport" },
    { id: "RESP-MEDIA", name: "CSS media queries", category: "Responsive behavior", langs: ["css"], requires: { html: true, css: true }, levels: [2,3,4], priority: 2, cost: 1, method: "mediaQueries", description: "No @media" },
    { id: "RESP-FIXED", name: "Fixed large widths", category: "Responsive behavior", langs: ["css","html"], requires: { web: true }, levels: [3,4], priority: 4, cost: 2, method: "fixedWidth", description: "width ≥1000px" },
    { id: "RESP-IMG-MAX", name: "Images max-width", category: "Responsive behavior", langs: ["css","html"], requires: { web: true }, levels: [4], priority: 5, cost: 2, method: "imgMaxWidth", description: "No max-width:100%" },

    // ── Architecture ──
    { id: "ARCH-MODULES", name: "Many JS modules", category: "Structure / Architecture", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 5, cost: 1, method: "manyModules", description: ">10 JS files" },
    { id: "ARCH-DUP-NAME", name: "Duplicate basenames", category: "Structure / Architecture", langs: ["*"], requires: {}, levels: [3,4], priority: 4, cost: 2, method: "dupBasename", description: "Same filename multi-path" },
    { id: "ARCH-DEEP-PATH", name: "Deep folder paths", category: "Structure / Architecture", langs: ["*"], requires: {}, levels: [4], priority: 7, cost: 1, method: "deepPath", description: "Path depth >6" },
    { id: "ARCH-MIXED", name: "Mixed language density", category: "Structure / Architecture", langs: ["*"], requires: {}, levels: [4], priority: 6, cost: 1, method: "mixedLang", description: "≥4 languages" },
    { id: "ARCH-HARD-URL", name: "Localhost URLs", category: "Structure / Architecture", langs: ["*"], requires: {}, levels: [4], priority: 6, cost: 1, method: "crHardUrl", description: "localhost in source" },
    { id: "CMB-GENERIC", name: "Entry + maintainability combo", category: "Code / Logic", langs: ["*"], requires: {}, levels: [4], priority: 4, cost: 3, method: "cmbGeneric", description: "Combined structure signals" }
  ];

  var LEVEL_CAPS = { 1: 5, 2: 15, 3: 35, 4: 80 };
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
    return false;
  }

  function selectStrategies(category, level, ctx) {
    level = Math.min(4, Math.max(1, parseInt(level, 10) || 1));
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
        var hasAny = false;
        var L = s.langs || [];
        for (var j = 0; j < L.length; j++) if ((ctx.languages || {})[L[j]]) hasAny = true;
        if (!hasAny) {
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
    candidates = candidates.slice(0, cap);
    return { selected: candidates, skipped: skipped, cap: cap, level: level };
  }

  global.ADStrategies = {
    selectStrategies: selectStrategies,
    getAllCategories: function () { return ALL_CATEGORIES.slice(); },
    getRegistry: function () { return STRATEGIES.slice(); },
    getCaps: function () {
      return { quick: 5, full: 15, deep: 35, special: 80 };
    },
    ALL_CATEGORIES: ALL_CATEGORIES,
    STRATEGIES: STRATEGIES
  };
})(typeof window !== "undefined" ? window : globalThis);
