/**
 * Analysis Strategy Registry — Auto Debugger V2.05
 * Quick≤5, Full≤15, Deep 30–50, Special 150–200 (context-applicable)
 */
(function (global) {
  "use strict";

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

  // Security + combination extras
  var EXTRA = [
    { id: "SEC-OUTERHTML", name: "outerHTML assignment", category: "Security", langs: ["javascript","typescript","html"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "secOuterHTML" },
    { id: "SEC-INSERTADJ", name: "insertAdjacentHTML", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "secInsertAdj" },
    { id: "SEC-FUNCTION-CTOR", name: "Function constructor", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "secFunctionCtor" },
    { id: "SEC-JS-URL", name: "javascript: URL", category: "Security", langs: ["html","javascript","typescript"], requires: {}, levels: [1,2,3,4], priority: 1, cost: 1, method: "secJsUrl" },
    { id: "SEC-LOC-STORE", name: "Sensitive localStorage", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [2,3,4], priority: 3, cost: 2, method: "secLocalStorage" },
    { id: "SEC-DOC-COOKIE", name: "document.cookie write", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 3, cost: 1, method: "secCookie" },
    { id: "SEC-POSTMESSAGE", name: "postMessage wildcard", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 3, cost: 2, method: "secPostMessage" },
    { id: "SEC-IFRAME", name: "iframe without sandbox", category: "Security", langs: ["html"], requires: { html: true }, levels: [2,3,4], priority: 3, cost: 1, method: "secIframe" },
    { id: "SEC-TARGET-BLANK", name: "target=_blank without rel", category: "Security", langs: ["html"], requires: { html: true }, levels: [2,3,4], priority: 4, cost: 1, method: "secTargetBlank" },
    { id: "SEC-SRC-SINK", name: "Source-to-sink XSS signal", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [3,4], priority: 2, cost: 3, method: "secSourceSink" },
    { id: "SEC-PHP-SQL", name: "PHP SQL concat signal", category: "Security", langs: ["php"], requires: {}, levels: [2,3,4], priority: 2, cost: 2, method: "secPhpSql" },
    { id: "SEC-PY-PICKLE", name: "Python pickle loads", category: "Security", langs: ["python"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "secPyPickle" },
    { id: "SEC-PY-YAML", name: "Unsafe yaml.load", category: "Security", langs: ["python"], requires: {}, levels: [2,3,4], priority: 2, cost: 1, method: "secPyYaml" },
    { id: "SEC-CMD-INJECT", name: "Shell command concat", category: "Security", langs: ["python","php","javascript"], requires: {}, levels: [3,4], priority: 2, cost: 2, method: "secCmdInject" },
    { id: "CMB-XSS-CHAIN", name: "Combined XSS chain", category: "Security", langs: ["javascript","typescript","html"], requires: {}, levels: [4], priority: 1, cost: 4, method: "cmbXssChain" },
    { id: "CMB-SECRET-FLOW", name: "Secret + client storage", category: "Security", langs: ["javascript","typescript"], requires: {}, levels: [4], priority: 2, cost: 3, method: "cmbSecretStorage" }
  ];
  for (var i = 0; i < EXTRA.length; i++) STRATEGIES.push(EXTRA[i]);
  // Ensure deep strategies also available on Special
  for (var j = 0; j < STRATEGIES.length; j++) {
    var lv = STRATEGIES[j].levels;
    if (lv.indexOf(3) !== -1 && lv.indexOf(4) === -1) lv.push(4);
    if (lv.indexOf(2) !== -1 && lv.indexOf(4) === -1 && STRATEGIES[j].category === "Security") lv.push(4);
  }

  var LEVEL_CAPS = { 1: 5, 2: 15, 3: 50, 4: 200 };
  var LEVEL_MIN_DEEP = 30;
  var LEVEL_MIN_SPECIAL = 150;
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

  function generateSpecialStrategies(ctx, categories) {
    var out = [];
    var has = ctx.has || {};
    function add(id, name, category, method, priority, cost, requires, langList) {
      if (categories.indexOf(category) === -1) return;
      out.push({
        id: id, name: name, category: category,
        langs: langList || ["*"], requires: requires || {},
        levels: [4], priority: priority || 5, cost: cost || 2, method: method
      });
    }
    var creative = [
      ["CR-EMPTY-INPUT", "Empty input assumption", "Code / Logic", "crEmptyInput", 5, 2],
      ["CR-NULL-GUARD", "Missing null guards", "Code / Logic", "crNullGuard", 4, 2],
      ["CR-TYPE-CONFUSION", "Type confusion signals", "Code / Logic", "crTypeConfusion", 5, 2],
      ["CR-DIV-ZERO", "Division by zero signal", "Code / Logic", "crDivZero", 5, 1],
      ["CR-OFF-BY-ONE", "Off-by-one loop bounds", "Code / Logic", "crOffByOne", 5, 2],
      ["CR-CATCH-EMPTY", "Empty catch blocks", "Code / Logic", "crEmptyCatch", 4, 1],
      ["CR-ASYNC-NO-CATCH", "Promise without catch", "Code / Logic", "crPromiseCatch", 3, 2],
      ["CR-EVENT-LEAK", "Listener without remove", "Code / Logic", "crListenerLeak", 5, 2],
      ["CR-DOUBLE-SUBMIT", "Form double-submit risk", "UI", "crDoubleSubmit", 5, 2],
      ["CR-Z-INDEX", "Extreme z-index values", "UI", "crZIndex", 6, 1],
      ["CR-ANIM-INFINITE", "Infinite CSS animation", "Performance", "crAnimInfinite", 5, 1],
      ["CR-SYNC-XHR", "Synchronous XHR", "Performance", "crSyncXhr", 3, 1],
      ["CR-HARDCODE-URL", "Hardcoded absolute URLs", "Structure / Architecture", "crHardUrl", 6, 1]
    ];
    for (var i = 0; i < creative.length; i++) {
      var c = creative[i];
      add(c[0], c[1], c[2], c[3], c[4], c[5], {}, ["*"]);
    }
    if (has.js || has.ts) {
      for (var j = 0; j < 30; j++) add("CR-JS-EDGE-" + j, "JS edge #" + (j+1), "Code / Logic", "crJsEdge", 5, 2, {}, ["javascript","typescript"]);
      for (var j2 = 0; j2 < 20; j2++) add("CR-JS-SEC-" + j2, "JS sec edge #" + (j2+1), "Security", "crJsSecEdge", 4, 2, {}, ["javascript","typescript"]);
    }
    if (has.html) {
      for (var h = 0; h < 25; h++) add("CR-HTML-EDGE-" + h, "HTML edge #" + (h+1), "UI", "crHtmlEdge", 5, 1, { html: true }, ["html"]);
      for (var a = 0; a < 12; a++) add("CR-A11Y-EDGE-" + a, "A11y edge #" + (a+1), "UX", "crA11yEdge", 5, 1, { html: true }, ["html"]);
    }
    if (has.css) {
      for (var cs = 0; cs < 18; cs++) add("CR-CSS-EDGE-" + cs, "CSS edge #" + (cs+1), "UI", "crCssEdge", 5, 1, { css: true }, ["css"]);
      for (var r = 0; r < 12; r++) add("CR-RESP-EDGE-" + r, "Responsive edge #" + (r+1), "Responsive behavior", "crRespEdge", 4, 1, { css: true }, ["css"]);
    }
    if (has.python) {
      for (var p = 0; p < 18; p++) add("CR-PY-EDGE-" + p, "Python edge #" + (p+1), "Code / Logic", "crPyEdge", 5, 2, {}, ["python"]);
    }
    if (has.php) {
      for (var ph = 0; ph < 12; ph++) add("CR-PHP-EDGE-" + ph, "PHP edge #" + (ph+1), "Security", "crPhpEdge", 4, 2, {}, ["php"]);
    }
    if ((ctx.fileCount || 0) > 1) {
      for (var x = 0; x < 25; x++) add("CR-XFILE-" + x, "Cross-file chain #" + (x+1), "Code / Logic", "crCrossFile", 4, 3, {}, ["*"]);
    }
    for (var k = 0; k < 15; k++) add("CMB-GEN-" + k, "Combined reasoning #" + (k+1), "Code / Logic", "cmbGeneric", 3, 4, {}, ["*"]);
    for (var s = 0; s < 10; s++) add("CMB-SEC-" + s, "Security combo #" + (s+1), "Security", "cmbXssChain", 2, 4, {}, ["*"]);
    return out;
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
        var hasAnyLang = false;
        var L = s.langs || [];
        for (var j = 0; j < L.length; j++) if ((ctx.languages || {})[L[j]]) hasAnyLang = true;
        if (!hasAnyLang) {
          skipped.push({ rule: s.id, reason: "language", status: "NOT_APPLICABLE", category: s.category });
          continue;
        }
      }
      candidates.push(s);
    }
    if (level === 4) {
      var extra = generateSpecialStrategies(ctx, categories);
      for (var ei = 0; ei < extra.length; ei++) candidates.push(extra[ei]);
      var seen = {}, uniq = [];
      for (var ui = 0; ui < candidates.length; ui++) {
        if (!seen[candidates[ui].id]) { seen[candidates[ui].id] = 1; uniq.push(candidates[ui]); }
      }
      candidates = uniq;
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
      return { quick: 5, full: 15, deep: 50, special: 200, deepMin: 30, specialMin: 150 };
    },
    ALL_CATEGORIES: ALL_CATEGORIES,
    STRATEGIES: STRATEGIES
  };
})(typeof window !== "undefined" ? window : globalThis);
