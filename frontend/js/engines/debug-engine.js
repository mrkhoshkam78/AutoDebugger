/**
 * Auto Debugger V1.05 — Context-aware engine + false-positive control
 * Classic script; uses global.ADUtils
 */
(function (global) {
  "use strict";
  var U = global.ADUtils || {};
  var getExt = U.getExt;
  var SUPPORTED_EXTENSIONS = U.SUPPORTED_EXTENSIONS || {};
  var TEST_LEVELS = U.TEST_LEVELS || { 1: "QUICK TEST", 2: "FULL CHECK", 3: "DEEP CHECK" };

  function DebugEngine(files, language, category, level, projectGraph) {
    this.files = files || {};
    this.language = (language || "auto").toLowerCase();
    this.category = category || "Code / Logic";
    this.level = Math.min(3, Math.max(1, parseInt(level, 10) || 1));
    this.graph = projectGraph || null;
    this.problems = [];
    this.skipped = [];
    this.counter = 0;
    this.testResults = [];
    this.ctx = this._buildContext();
  }

  DebugEngine.prototype._buildContext = function () {
    var names = Object.keys(this.files);
    var langs = {};
    var has = { html: false, css: false, js: false, ts: false, python: false, json: false, php: false, other: false };
    for (var i = 0; i < names.length; i++) {
      var ext = getExt(names[i]);
      var lang = SUPPORTED_EXTENSIONS[ext] || "unknown";
      langs[lang] = (langs[lang] || 0) + 1;
      if (lang === "html") has.html = true;
      else if (lang === "css") has.css = true;
      else if (lang === "javascript") has.js = true;
      else if (lang === "typescript") has.ts = true;
      else if (lang === "python") has.python = true;
      else if (lang === "json") has.json = true;
      else if (lang === "php") has.php = true;
      else has.other = true;
    }
    return {
      fileCount: names.length,
      names: names,
      languages: langs,
      has: has,
      isWebUi: has.html || has.css || has.js || has.ts,
      isScriptOnly: !has.html && !has.css && (has.js || has.ts || has.python || has.php)
    };
  };

  DebugEngine.prototype.run = function () {
    this.testResults.push({
      level: this.level,
      name: TEST_LEVELS[this.level] || "Unknown",
      status: "running"
    });

    if (this.level >= 1) this._level1();
    if (this.level >= 2) this._level2();
    if (this.level >= 3) this._level3();

    this.testResults[this.testResults.length - 1].status = "completed";
    this.testResults[this.testResults.length - 1].problems_found = this.problems.length;

    return {
      problems: this.problems,
      skipped: this.skipped,
      test_results: this.testResults,
      context: {
        fileCount: this.ctx.fileCount,
        languages: this.ctx.languages,
        has: this.ctx.has
      },
      summary: {
        total_problems: this.problems.length,
        by_severity: this._countSeverity(),
        by_status: this._countStatus(),
        files_analyzed: Object.keys(this.files),
        language: this.language,
        category: this.category,
        level: this.level
      }
    };
  };

  /**
   * @param {object} opts
   * opts.requires — e.g. { html: true } meaning HTML must exist
   * opts.ruleId — stable id for explanation lookup
   * opts.status — CONFIRMED | LIKELY | POSSIBLE (default by confidence)
   */
  DebugEngine.prototype._add = function (severity, file, line, section, description, why, expected, detected, recommendation, test, extras) {
    extras = extras || {};
    var requires = extras.requires || null;
    if (requires) {
      var skip = this._checkRequirements(requires, extras.ruleId || description);
      if (skip) {
        this.skipped.push(skip);
        return;
      }
    }

    var confidence = extras.confidence != null ? extras.confidence : this._defaultConfidence(severity, test);
    // Cap severity by confidence — no critical without strong evidence
    if (confidence < 0.55 && severity === "critical") severity = "high";
    if (confidence < 0.4 && (severity === "critical" || severity === "high")) severity = "medium";
    if (confidence < 0.3) severity = "low";

    var status = extras.status || this._statusFromConfidence(confidence);

    this.counter++;
    this.problems.push({
      problem_id: "P" + String(this.counter).padStart(4, "0"),
      severity: severity,
      status: status,
      category: this.category,
      file_name: file,
      line: line || 1,
      section: section || "",
      description: description,
      why_problematic: why,
      expected_behavior: expected,
      detected_behavior: detected,
      recommended_correction_area: recommendation,
      test_detected: test,
      root_cause: extras.root_cause || recommendation,
      symptom: extras.symptom || description,
      evidence: extras.evidence || detected,
      impact: extras.impact || this._defaultImpact(severity),
      confidence: confidence,
      rule_id: extras.ruleId || "",
      // Simple explanation keys / fallback text (i18n applied in UI)
      simple: extras.simple || null
    });
  };

  DebugEngine.prototype._checkRequirements = function (requires, ruleLabel) {
    var has = this.ctx.has;
    if (requires.html && !has.html) {
      return { rule: ruleLabel, reason: "no_html", status: "NOT_APPLICABLE" };
    }
    if (requires.css && !has.css) {
      return { rule: ruleLabel, reason: "no_css", status: "NOT_APPLICABLE" };
    }
    if (requires.js && !has.js && !has.ts) {
      return { rule: ruleLabel, reason: "no_js", status: "NOT_APPLICABLE" };
    }
    if (requires.web && !this.ctx.isWebUi) {
      return { rule: ruleLabel, reason: "not_web_project", status: "NOT_APPLICABLE" };
    }
    if (requires.html_and_css && !(has.html && has.css)) {
      return { rule: ruleLabel, reason: "need_html_and_css", status: "SKIPPED" };
    }
    return null;
  };

  DebugEngine.prototype._statusFromConfidence = function (c) {
    if (c >= 0.85) return "CONFIRMED";
    if (c >= 0.65) return "LIKELY";
    return "POSSIBLE";
  };

  DebugEngine.prototype._defaultImpact = function (sev) {
    return {
      critical: "Blocks execution / severe security risk",
      high: "Likely runtime failure or significant defect",
      medium: "Degrades quality or reliability",
      low: "Style / maintainability concern",
      info: "Informational observation"
    }[sev] || "Unknown";
  };

  DebugEngine.prototype._defaultConfidence = function (sev, test) {
    if (test && test.indexOf("L1") === 0 && (sev === "critical" || sev === "high")) return 0.9;
    if (test && test.indexOf("L3") === 0) return 0.65;
    return 0.75;
  };

  DebugEngine.prototype._countSeverity = function () {
    var c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (var i = 0; i < this.problems.length; i++) {
      var s = this.problems[i].severity;
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  };

  DebugEngine.prototype._countStatus = function () {
    var c = { CONFIRMED: 0, LIKELY: 0, POSSIBLE: 0 };
    for (var i = 0; i < this.problems.length; i++) {
      var s = this.problems[i].status || "LIKELY";
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  };

  // ───────── LEVEL 1 ─────────
  DebugEngine.prototype._level1 = function () {
    var test = "L1-Quick-Syntax-Structure";
    var names = Object.keys(this.files);
    for (var i = 0; i < names.length; i++) {
      var fname = names[i];
      var content = this.files[fname];
      if (!content || !String(content).trim()) {
        this._add("medium", fname, 1, "file", "Empty or blank file",
          "Empty files provide no functionality.",
          "File should contain valid source code.",
          "Empty or whitespace only.",
          "Add content or remove the file.", test,
          { ruleId: "empty_file", confidence: 0.95, status: "CONFIRMED",
            simple: { id: "empty_file" } });
        continue;
      }
      var ext = getExt(fname);
      var lang = SUPPORTED_EXTENSIONS[ext] || this.language;

      if (lang === "javascript" || lang === "typescript") this._jsQuick(fname, content, test);
      else if (lang === "python") this._pyQuick(fname, content, test);
      else if (lang === "html") this._htmlQuick(fname, content, test);
      else if (lang === "css") this._cssQuick(fname, content, test);
      else if (lang === "json") this._jsonQuick(fname, content, test);

      if (/security/i.test(this.category)) this._securityQuick(fname, content, test);
    }
  };

  DebugEngine.prototype._jsQuick = function (fname, content, test) {
    var opens = (content.match(/[{[(]/g) || []).length;
    var closes = (content.match(/[}\])]/g) || []).length;
    if (opens !== closes) {
      this._add("high", fname, 1, "structure",
        "Unbalanced braces, parentheses or brackets",
        "Unbalanced delimiters usually cause parse or runtime errors.",
        "Matching opening and closing delimiters.",
        "Open ~" + opens + ", close ~" + closes,
        "Find and fix mismatched { } ( ) [ ]", test,
        { ruleId: "js_unbalanced", confidence: 0.92, status: "CONFIRMED",
          simple: { id: "js_unbalanced" }, evidence: "Δ=" + (opens - closes) });
    }
    if (/\.\s+\(/.test(content)) {
      this._add("medium", fname, 1, "syntax",
        "Possible malformed method call (dot space paren)",
        "Space between . and ( is invalid in JS method calls.",
        "obj.method()", "Found pattern '. ('",
        "Remove the space between . and (", test,
        { ruleId: "js_dot_space", confidence: 0.8, status: "LIKELY",
          simple: { id: "js_dot_space" } });
    }
  };

  DebugEngine.prototype._pyQuick = function (fname, content, test) {
    if (content.indexOf("\t") !== -1 && content.indexOf("    ") !== -1) {
      this._add("medium", fname, 1, "style",
        "Mixed tabs and spaces for indentation",
        "Python mixes of tabs and spaces often cause IndentationError.",
        "Use only spaces or only tabs.",
        "Both tab and space indentation found.",
        "Convert indentation to spaces (recommended).", test,
        { ruleId: "py_mixed_indent", confidence: 0.9, status: "CONFIRMED",
          simple: { id: "py_mixed_indent" } });
    }
    var lines = content.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (/^(if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(s) &&
          !s.endsWith(":") && !s.endsWith("\\") && s.charAt(0) !== "#") {
        if (/^(else|try|finally)\s*$/.test(s) || /^(if|elif|for|while|def|class|except|with)\b.+$/.test(s)) {
          this._add("critical", fname, i + 1, "syntax",
            "Possible missing colon after compound statement",
            "Python compound statements need a trailing colon.",
            "Header line ends with ':'",
            s.slice(0, 100),
            "Add ':' at the end of the line.", test,
            { ruleId: "py_missing_colon", confidence: 0.88, status: "CONFIRMED",
              simple: { id: "py_missing_colon" } });
        }
      }
    }
    var o = (content.match(/[{[(]/g) || []).length;
    var c = (content.match(/[}\])]/g) || []).length;
    if (o !== c) {
      this._add("high", fname, 1, "structure",
        "Unbalanced brackets/braces/parentheses",
        "Unbalanced delimiters cause SyntaxError in Python.",
        "Balanced delimiters.", "Open " + o + " vs close " + c,
        "Balance brackets.", test,
        { ruleId: "py_unbalanced", confidence: 0.85, status: "CONFIRMED",
          simple: { id: "py_unbalanced" } });
    }
  };

  DebugEngine.prototype._htmlQuick = function (fname, content, test) {
    // Only meaningful when HTML exists (we are already in HTML file)
    var openTags = [];
    var reOpen = /<([a-zA-Z][\w-]*)\b[^>]*(?<!\/)\s*>/g;
    var m;
    while ((m = reOpen.exec(content))) openTags.push(m[1].toLowerCase());
    var closeTags = [];
    var reClose = /<\/([a-zA-Z][\w-]*)\s*>/g;
    while ((m = reClose.exec(content))) closeTags.push(m[1].toLowerCase());
    var voidEls = { img:1, br:1, hr:1, input:1, meta:1, link:1, area:1, base:1, col:1, embed:1, source:1, track:1, wbr:1 };
    var net = {};
    for (var i = 0; i < openTags.length; i++) {
      var t = openTags[i];
      if (!voidEls[t]) net[t] = (net[t] || 0) + 1;
    }
    for (var j = 0; j < closeTags.length; j++) {
      var tc = closeTags[j];
      net[tc] = (net[tc] || 0) - 1;
    }
    for (var tag in net) {
      if (net[tag] > 0) {
        this._add("high", fname, 1, "html",
          "Possibly unclosed <" + tag + "> tag(s)",
          "Unclosed tags break page structure and styling.",
          "Matching closing tag for <" + tag + ">.",
          "Net open count for " + tag + ": " + net[tag],
          "Add the missing </" + tag + ">.", test,
          { ruleId: "html_unclosed", confidence: 0.78, status: "LIKELY",
            simple: { id: "html_unclosed", tag: tag } });
      }
    }
    if (!/<!doctype/i.test(content) && /<html/i.test(content)) {
      this._add("low", fname, 1, "structure",
        "Missing DOCTYPE declaration",
        "Without DOCTYPE some browsers use quirks mode and layout can differ.",
        "<!DOCTYPE html> at the top.",
        "No DOCTYPE found.",
        "Add <!DOCTYPE html> as the first line.", test,
        { ruleId: "html_doctype", confidence: 0.95, status: "CONFIRMED",
          simple: { id: "html_doctype" } });
    }
  };

  DebugEngine.prototype._cssQuick = function (fname, content, test) {
    var opens = (content.match(/\{/g) || []).length;
    var closes = (content.match(/\}/g) || []).length;
    if (opens !== closes) {
      this._add("high", fname, 1, "css",
        "Unbalanced curly braces in CSS",
        "Mismatched braces break following style rules.",
        "Equal number of { and }.",
        "{ " + opens + " vs } " + closes,
        "Balance the braces.", test,
        { ruleId: "css_unbalanced", confidence: 0.93, status: "CONFIRMED",
          simple: { id: "css_unbalanced" } });
    }
    if (/\{\s*\}/.test(content)) {
      this._add("low", fname, 1, "css",
        "Empty CSS rule set(s) found",
        "Empty rules add noise and may mean incomplete styles.",
        "Rules with at least one declaration, or remove them.",
        "Empty { } found.",
        "Remove or complete empty rules.", test,
        { ruleId: "css_empty_rule", confidence: 0.7, status: "LIKELY",
          simple: { id: "css_empty_rule" } });
    }
  };

  DebugEngine.prototype._jsonQuick = function (fname, content, test) {
    try {
      JSON.parse(content);
    } catch (e) {
      this._add("critical", fname, 1, "json",
        "Invalid JSON: " + e.message,
        "Invalid JSON cannot be read by most applications.",
        "Valid JSON syntax.",
        String(e.message),
        "Fix quotes, commas, or brackets.", test,
        { ruleId: "json_invalid", confidence: 0.98, status: "CONFIRMED",
          simple: { id: "json_invalid" } });
    }
  };

  DebugEngine.prototype._securityQuick = function (fname, content, test) {
    var patterns = [
      [/eval\s*\(/i, "Use of eval()", "eval can run untrusted code (XSS/injection risk).",
       "Avoid eval with untrusted input.", "sec_eval", 0.9],
      [/innerHTML\s*=/i, "Assignment to innerHTML", "innerHTML with user data can enable XSS.",
       "Prefer textContent or sanitized HTML.", "sec_innerhtml", 0.75],
      [/document\.write\s*\(/i, "document.write()", "document.write is unsafe with untrusted data.",
       "Use safer DOM methods.", "sec_docwrite", 0.8],
      [/password\s*=\s*["'][^"']+["']/i, "Hardcoded password-like string", "Secrets in source can be leaked.",
       "Move secrets out of source code.", "sec_password", 0.7],
      [/api[_-]?key\s*=\s*["'][^"']+["']/i, "Hardcoded API key", "API keys in source are a security risk.",
       "Use environment or secure config.", "sec_apikey", 0.85]
    ];
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (p[0].test(content)) {
        this._add("high", fname, 1, "security", p[1], p[2],
          "Avoid dangerous APIs or hardcoded secrets.",
          "Matched: " + p[0], p[3], test,
          { ruleId: p[4], confidence: p[5], status: p[5] >= 0.85 ? "CONFIRMED" : "LIKELY",
            simple: { id: p[4] } });
      }
    }
  };

  // ───────── LEVEL 2 ─────────
  DebugEngine.prototype._level2 = function () {
    var test = "L2-Full-Relations-Deps";
    if (Object.keys(this.files).length > 1) this._crossFileRefs(test);

    var names = Object.keys(this.files);
    for (var i = 0; i < names.length; i++) {
      var fname = names[i];
      var content = this.files[fname];
      var lang = SUPPORTED_EXTENSIONS[getExt(fname)] || this.language;
      if (lang === "javascript" || lang === "typescript" || lang === "html") {
        this._jsHtmlInteraction(fname, content, test);
      }
      if (/ui|ux/i.test(this.category)) this._uiUx(fname, content, test);
      if (/performance/i.test(this.category)) this._perf(fname, content, test);
    }
  };

  DebugEngine.prototype._crossFileRefs = function (test) {
    if (!this.graph || !this.graph.references) return;
    // Only flag asset refs when HTML present; DOM refs need HTML
    for (var i = 0; i < this.graph.references.length; i++) {
      var ref = this.graph.references[i];
      if (!ref.missing) continue;
      if (ref.type === "asset") {
        this._add("medium", ref.from, 1, "reference",
          "Possible missing referenced file: " + ref.target,
          "Broken links cause missing images, scripts, or styles.",
          "Referenced file exists in the project.",
          "Reference '" + ref.target + "' not found.",
          "Add the file or fix the path.", test,
          { ruleId: "missing_asset", confidence: 0.72, status: "LIKELY",
            requires: { html: true },
            simple: { id: "missing_asset", target: ref.target } });
      }
      if (ref.type === "dom") {
        this._add("medium", ref.from, 1, "dom",
          "Possible missing DOM element: " + ref.target,
          "Looking up a missing element returns null and can crash scripts.",
          "Element with this id exists in HTML.",
          "No matching id='" + ref.target + "' in uploaded HTML.",
          "Add the element or guard the query.", test,
          { ruleId: "missing_dom", confidence: 0.68, status: "LIKELY",
            requires: { html: true, js: true },
            simple: { id: "missing_dom", target: ref.target } });
      }
    }
  };

  DebugEngine.prototype._jsHtmlInteraction = function (fname, content, test) {
    if (!this.graph || !this.ctx.has.html) return; // context: need HTML to validate DOM ids
    var ids = this.graph.htmlIds || {};
    var hasIds = typeof ids.has === "function" ? true : Object.keys(ids).length > 0;
    // Support Set or object
    function hasId(id) {
      if (!ids) return false;
      if (typeof ids.has === "function") return ids.has(id);
      return !!ids[id];
    }
    var anyHtmlIds = false;
    if (typeof ids.forEach === "function") {
      ids.forEach(function () { anyHtmlIds = true; });
    } else {
      anyHtmlIds = Object.keys(ids).length > 0;
    }

    var re = /(?:getElementById|querySelector)\s*\(\s*['"]#?([^'"]+)['"]/g;
    var m;
    while ((m = re.exec(content))) {
      var sel = m[1];
      if (sel && anyHtmlIds && !hasId(sel)) {
        this._add("medium", fname, 1, "dom",
          "Possible missing DOM element for selector/id: " + sel,
          "Null element access often causes runtime errors.",
          "Target element exists in HTML.",
          "No id='" + sel + "' in uploaded HTML.",
          "Verify the element or add a null check.", test,
          { ruleId: "missing_dom", confidence: 0.7, status: "LIKELY",
            requires: { html: true },
            simple: { id: "missing_dom", target: sel } });
      }
    }
  };

  DebugEngine.prototype._uiUx = function (fname, content, test) {
    var isHtml = /\.html?$/i.test(fname);
    var isCss = getExt(fname) === ".css";
    if (!isHtml && !isCss) return;

    // img alt — only if HTML has img
    if (isHtml && /<img/i.test(content) && !/\salt\s*=/i.test(content)) {
      this._add("medium", fname, 1, "accessibility",
        "Images without alt attributes",
        "Missing alt text hurts accessibility and SEO.",
        "Every meaningful image has an alt attribute.",
        "img without alt found.",
        "Add alt=\"description\" to images.", test,
        { ruleId: "img_alt", confidence: 0.82, status: "LIKELY",
          requires: { html: true },
          simple: { id: "img_alt" } });
    }

    // px fonts — only meaningful for CSS or style in HTML; not a bug if no UI context
    if ((isCss || isHtml) && /font-size\s*:\s*\d+px/i.test(content) && !/\b(rem|em)\b/i.test(content)) {
      this._add("low", fname, 1, "ux",
        "Hard-coded px font sizes only",
        "Fixed px sizes make text scaling harder for some users.",
        "Prefer relative units (rem/em) for text.",
        "Only px font-size found.",
        "Consider rem for typography.", test,
        { ruleId: "px_font", confidence: 0.55, status: "POSSIBLE",
          requires: { web: true },
          simple: { id: "px_font" } });
    }
  };

  DebugEngine.prototype._perf = function (fname, content, test) {
    if (!this.ctx.has.html && !/\.html?$/i.test(fname)) {
      // script tag count only relevant in HTML context
      return;
    }
    var scriptCount = (content.match(/<script/gi) || []).length;
    if (scriptCount > 5) {
      this._add("medium", fname, 1, "performance",
        "Many script tags",
        "Many scripts can slow page load.",
        "Bundle or defer non-critical scripts.",
        "Found " + scriptCount + " script tags.",
        "Consider bundling or async/defer.", test,
        { ruleId: "many_scripts", confidence: 0.6, status: "POSSIBLE",
          requires: { html: true },
          simple: { id: "many_scripts", count: scriptCount } });
    }
    if (/@import\s+/i.test(content) && (getExt(fname) === ".css" || this.ctx.has.css)) {
      this._add("low", fname, 1, "performance",
        "CSS @import detected",
        "@import can delay loading of stylesheets.",
        "Prefer <link> in HTML over @import.",
        "@import found.",
        "Replace @import with link tags when possible.", test,
        { ruleId: "css_import", confidence: 0.75, status: "LIKELY",
          requires: { css: true },
          simple: { id: "css_import" } });
    }
  };

  // ───────── LEVEL 3 ─────────
  DebugEngine.prototype._level3 = function () {
    var test = "L3-Deep-Architecture-Edge";
    this._architecture(test);
    this._edgeCases(test);
    // Responsive rules ONLY when HTML/CSS web context exists
    if (/responsive/i.test(this.category) || this.ctx.isWebUi) {
      this._responsive(test);
    } else {
      this.skipped.push({ rule: "responsive_checks", reason: "not_web_project", status: "NOT_APPLICABLE" });
    }
    if (/structure|architecture/i.test(this.category)) this._structureDeep(test);
  };

  DebugEngine.prototype._architecture = function (test) {
    var jsFiles = Object.keys(this.files).filter(function (f) {
      return [".js", ".ts", ".jsx", ".tsx"].indexOf(getExt(f)) !== -1;
    });
    if (jsFiles.length > 10) {
      this._add("info", "project", 1, "architecture",
        "Large number of JS modules",
        "Many files may need a clear bundling strategy.",
        "Clear module boundaries.",
        jsFiles.length + " JS/TS files.",
        "Ensure module system is intentional.", test,
        { ruleId: "many_modules", confidence: 0.45, status: "POSSIBLE",
          simple: { id: "many_modules", count: jsFiles.length } });
    }
  };

  DebugEngine.prototype._edgeCases = function (test) {
    var names = Object.keys(this.files);
    for (var i = 0; i < names.length; i++) {
      var fname = names[i];
      var content = this.files[fname];
      if (/\bTODO\b|\bFIXME\b/.test(content)) {
        this._add("info", fname, 1, "maintainability",
          "TODO/FIXME comments present",
          "Unresolved TODOs may mark incomplete work.",
          "Track or resolve remaining items.",
          "TODO or FIXME found.",
          "Address or ticket remaining work.", test,
          { ruleId: "todo_fixme", confidence: 0.7, status: "LIKELY",
            simple: { id: "todo_fixme" } });
      }
    }
  };

  DebugEngine.prototype._responsive = function (test) {
    // CONTEXT: viewport only applies when HTML exists
    if (!this.ctx.has.html) {
      this.skipped.push({ rule: "viewport_meta", reason: "no_html", status: "NOT_APPLICABLE" });
      this.skipped.push({ rule: "media_queries", reason: "no_html", status: "NOT_APPLICABLE" });
      return;
    }

    var hasViewport = false;
    var hasMedia = false;
    var names = Object.keys(this.files);
    for (var i = 0; i < names.length; i++) {
      var content = this.files[names[i]];
      if (/viewport/i.test(content)) hasViewport = true;
      if (/@media/i.test(content)) hasMedia = true;
    }

    if (!hasViewport) {
      this._add("high", "project", 1, "responsive",
        "Missing viewport meta tag",
        "Without viewport, phones may show a desktop-width page.",
        'meta name="viewport" content="width=device-width, initial-scale=1"',
        "No viewport meta in any HTML.",
        "Add viewport meta in the HTML head.", test,
        { ruleId: "viewport", confidence: 0.92, status: "CONFIRMED",
          requires: { html: true },
          simple: { id: "viewport" } });
    }

    if (!hasMedia && this.ctx.has.css) {
      this._add("medium", "project", 1, "responsive",
        "No CSS media queries detected",
        "Without media queries the layout may not adapt to small screens.",
        "Use @media breakpoints for mobile/tablet.",
        "No @media found.",
        "Add media queries for common breakpoints.", test,
        { ruleId: "no_media", confidence: 0.7, status: "LIKELY",
          requires: { html: true, css: true },
          simple: { id: "no_media" } });
    } else if (!hasMedia && !this.ctx.has.css) {
      this.skipped.push({ rule: "media_queries", reason: "no_css", status: "SKIPPED" });
    }
  };

  DebugEngine.prototype._structureDeep = function (test) {
    if (Object.keys(this.files).length <= 1) return;
    var hasEntry = Object.keys(this.files).some(function (f) {
      var b = f.split("/").pop().toLowerCase();
      return ["index.html", "main.js", "app.js", "index.js", "main.py", "app.py"].indexOf(b) !== -1;
    });
    if (!hasEntry) {
      this._add("low", "project", 1, "structure",
        "No obvious entry-point file detected",
        "Projects usually have a clear starting file.",
        "A clear entry file (e.g. index.html).",
        "No standard entry filename found.",
        "Name the main file clearly.", test,
        { ruleId: "no_entry", confidence: 0.5, status: "POSSIBLE",
          simple: { id: "no_entry" } });
    }
  };

  global.ADDebugEngine = { DebugEngine: DebugEngine };
})(typeof window !== "undefined" ? window : globalThis);
