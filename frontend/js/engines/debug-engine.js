/**
 * Auto Debugger V2.0 — Strategy-driven, context-aware engine
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
    this.strategiesRun = [];
    this.ctx = this._buildContext();
  }

  DebugEngine.prototype._buildContext = function () {
    var names = Object.keys(this.files);
    var langs = {};
    var has = { html: false, css: false, js: false, ts: false, python: false, json: false, php: false };
    for (var i = 0; i < names.length; i++) {
      var lang = SUPPORTED_EXTENSIONS[getExt(names[i])] || "unknown";
      langs[lang] = (langs[lang] || 0) + 1;
      if (lang === "html") has.html = true;
      else if (lang === "css") has.css = true;
      else if (lang === "javascript") has.js = true;
      else if (lang === "typescript") has.ts = true;
      else if (lang === "python") has.python = true;
      else if (lang === "json") has.json = true;
      else if (lang === "php") has.php = true;
    }
    return {
      fileCount: names.length,
      names: names,
      languages: langs,
      has: has,
      isWebUi: has.html || has.css || has.js || has.ts
    };
  };

  DebugEngine.prototype.run = function () {
    var sel = { selected: [], skipped: [], cap: 5, level: this.level };
    if (global.ADStrategies && global.ADStrategies.selectStrategies) {
      sel = global.ADStrategies.selectStrategies(this.category, this.level, this.ctx);
    }
    this.skipped = sel.skipped || [];
    this.strategiesRun = (sel.selected || []).map(function (s) { return s.id; });

    this.testResults = [{
      level: this.level,
      name: TEST_LEVELS[this.level] || "Unknown",
      status: "running",
      strategies_selected: this.strategiesRun.length,
      strategies_cap: sel.cap
    }];

    var methods = this._methodMap();
    for (var i = 0; i < (sel.selected || []).length; i++) {
      var s = sel.selected[i];
      var fn = methods[s.method];
      if (typeof fn === "function") {
        try { fn.call(this, s); } catch (e) { /* skip broken strategy */ }
      }
    }

    this.testResults[0].status = "completed";
    this.testResults[0].problems_found = this.problems.length;

    return {
      problems: this.problems,
      skipped: this.skipped,
      strategies_run: this.strategiesRun,
      strategies_count: this.strategiesRun.length,
      test_results: this.testResults,
      context: { fileCount: this.ctx.fileCount, languages: this.ctx.languages, has: this.ctx.has },
      summary: {
        total_problems: this.problems.length,
        by_severity: this._countSeverity(),
        by_status: this._countStatus(),
        files_analyzed: Object.keys(this.files),
        language: this.language,
        category: this.category,
        level: this.level,
        strategies_run: this.strategiesRun.length
      }
    };
  };

  DebugEngine.prototype._add = function (severity, file, line, section, description, why, expected, detected, recommendation, strategy, extras) {
    extras = extras || {};
    var confidence = extras.confidence != null ? extras.confidence : 0.75;
    if (confidence < 0.55 && severity === "critical") severity = "high";
    if (confidence < 0.4 && (severity === "critical" || severity === "high")) severity = "medium";
    if (confidence < 0.3) severity = "low";
    var status = extras.status || (confidence >= 0.85 ? "CONFIRMED" : confidence >= 0.65 ? "LIKELY" : "POSSIBLE");
    var ruleId = (strategy && strategy.id) || extras.ruleId || "";
    this.counter++;
    this.problems.push({
      problem_id: "P" + String(this.counter).padStart(4, "0"),
      severity: severity,
      status: status,
      category: (strategy && strategy.category) || this.category,
      file_name: file,
      line: line || 1,
      section: section || "",
      description: description,
      why_problematic: why,
      expected_behavior: expected,
      detected_behavior: detected,
      recommended_correction_area: recommendation,
      test_detected: (strategy && strategy.id) || "strategy",
      root_cause: extras.root_cause || recommendation,
      symptom: extras.symptom || description,
      evidence: extras.evidence || detected,
      impact: extras.impact || severity,
      confidence: confidence,
      rule_id: ruleId,
      detecting_strategies: [ruleId],
      related_categories: [(strategy && strategy.category) || this.category],
      test_level: this.level,
      simple: extras.simple || { id: (extras.simpleId || ruleId || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_") }
    });
  };

  DebugEngine.prototype._countSeverity = function () {
    var c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    this.problems.forEach(function (p) { c[p.severity] = (c[p.severity] || 0) + 1; });
    return c;
  };
  DebugEngine.prototype._countStatus = function () {
    var c = { CONFIRMED: 0, LIKELY: 0, POSSIBLE: 0 };
    this.problems.forEach(function (p) { c[p.status] = (c[p.status] || 0) + 1; });
    return c;
  };

  DebugEngine.prototype._eachFile = function (langFilter, cb) {
    var names = Object.keys(this.files);
    for (var i = 0; i < names.length; i++) {
      var fname = names[i];
      var lang = SUPPORTED_EXTENSIONS[getExt(fname)] || "unknown";
      if (langFilter && langFilter.length && langFilter.indexOf("*") === -1 && langFilter.indexOf(lang) === -1) continue;
      cb(fname, this.files[fname], lang);
    }
  };

  // ── Strategy method implementations ──
  DebugEngine.prototype._methodMap = function () {
    var self = this;
    return {
      emptyFile: function (s) {
        self._eachFile(null, function (fname, content) {
          if (!content || !String(content).trim()) {
            self._add("medium", fname, 1, "file", "Empty or blank file", "Empty files do nothing.", "Valid content.", "Empty.", "Add content or remove.", s,
              { confidence: 0.95, status: "CONFIRMED", simpleId: "empty_file" });
          }
        });
      },
      jsBalance: function (s) {
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          var o = (content.match(/[{[(]/g) || []).length;
          var c = (content.match(/[}\])]/g) || []).length;
          if (o !== c) {
            self._add("high", fname, 1, "structure", "Unbalanced braces/parentheses", "Usually causes parse errors.", "Balanced delimiters.", "Open " + o + " close " + c, "Fix matching brackets.", s,
              { confidence: 0.92, status: "CONFIRMED", simpleId: "js_unbalanced" });
          }
        });
      },
      jsDotSpace: function (s) {
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          if (/\.\s+\(/.test(content)) {
            self._add("medium", fname, 1, "syntax", "Malformed method call", "Space between . and ( is invalid.", "obj.method()", "Found '. ('", "Remove the space.", s,
              { confidence: 0.8, status: "LIKELY", simpleId: "js_dot_space" });
          }
        });
      },
      pyColon: function (s) {
        self._eachFile(["python"], function (fname, content) {
          var lines = content.split("\n");
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (/^(if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(line) && !line.endsWith(":") && !line.endsWith("\\") && line.charAt(0) !== "#") {
              if (/^(else|try|finally)\s*$/.test(line) || /^(if|elif|for|while|def|class|except|with)\b.+$/.test(line)) {
                self._add("critical", fname, i + 1, "syntax", "Possible missing colon", "Python compound statements need ':'.", "Ends with :", line.slice(0, 80), "Add colon.", s,
                  { confidence: 0.88, status: "CONFIRMED", simpleId: "py_missing_colon" });
              }
            }
          }
        });
      },
      pyIndent: function (s) {
        self._eachFile(["python"], function (fname, content) {
          if (content.indexOf("\t") !== -1 && content.indexOf("    ") !== -1) {
            self._add("medium", fname, 1, "style", "Mixed tabs and spaces", "Often causes IndentationError.", "Consistent indentation.", "Both found.", "Use spaces only.", s,
              { confidence: 0.9, status: "CONFIRMED", simpleId: "py_mixed_indent" });
          }
        });
      },
      pyBalance: function (s) {
        self._eachFile(["python"], function (fname, content) {
          var o = (content.match(/[{[(]/g) || []).length;
          var c = (content.match(/[}\])]/g) || []).length;
          if (o !== c) {
            self._add("high", fname, 1, "structure", "Unbalanced brackets (Python)", "Causes SyntaxError.", "Balanced.", "Open " + o + " close " + c, "Balance brackets.", s,
              { confidence: 0.85, status: "CONFIRMED", simpleId: "py_unbalanced" });
          }
        });
      },
      htmlUnclosed: function (s) {
        self._eachFile(["html"], function (fname, content) {
          var openTags = [], m, re = /<([a-zA-Z][\w-]*)\b[^>]*(?<!\/)\s*>/g;
          while ((m = re.exec(content))) openTags.push(m[1].toLowerCase());
          var closeTags = [];
          re = /<\/([a-zA-Z][\w-]*)\s*>/g;
          while ((m = re.exec(content))) closeTags.push(m[1].toLowerCase());
          var voidEls = { img:1,br:1,hr:1,input:1,meta:1,link:1,area:1,base:1,col:1,embed:1,source:1,track:1,wbr:1 };
          var net = {};
          openTags.forEach(function (t) { if (!voidEls[t]) net[t] = (net[t] || 0) + 1; });
          closeTags.forEach(function (t) { net[t] = (net[t] || 0) - 1; });
          Object.keys(net).forEach(function (tag) {
            if (net[tag] > 0) {
              self._add("high", fname, 1, "html", "Possibly unclosed <" + tag + ">", "Breaks layout.", "Matching close tag.", "Net open " + net[tag], "Close the tag.", s,
                { confidence: 0.78, status: "LIKELY", simpleId: "html_unclosed" });
            }
          });
        });
      },
      htmlDoctype: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (!/<!doctype/i.test(content) && /<html/i.test(content)) {
            self._add("low", fname, 1, "structure", "Missing DOCTYPE", "May trigger quirks mode.", "<!DOCTYPE html>", "None found.", "Add DOCTYPE first.", s,
              { confidence: 0.95, status: "CONFIRMED", simpleId: "html_doctype" });
          }
        });
      },
      cssBalance: function (s) {
        self._eachFile(["css"], function (fname, content) {
          var o = (content.match(/\{/g) || []).length, c = (content.match(/\}/g) || []).length;
          if (o !== c) {
            self._add("high", fname, 1, "css", "Unbalanced CSS braces", "Breaks cascade.", "Equal { }.", o + " vs " + c, "Balance braces.", s,
              { confidence: 0.93, status: "CONFIRMED", simpleId: "css_unbalanced" });
          }
        });
      },
      cssEmpty: function (s) {
        self._eachFile(["css"], function (fname, content) {
          if (/\{\s*\}/.test(content)) {
            self._add("low", fname, 1, "css", "Empty CSS rule", "Noise / incomplete style.", "Non-empty rules.", "Empty { }.", "Remove or complete.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "css_empty_rule" });
          }
        });
      },
      jsonValid: function (s) {
        self._eachFile(["json"], function (fname, content) {
          try { JSON.parse(content); } catch (e) {
            self._add("critical", fname, 1, "json", "Invalid JSON", "Apps cannot parse it.", "Valid JSON.", e.message, "Fix syntax.", s,
              { confidence: 0.98, status: "CONFIRMED", simpleId: "json_invalid" });
          }
        });
      },
      secEval: function (s) {
        self._eachFile(["javascript", "typescript", "html"], function (fname, content) {
          // Strip strings & comments to reduce false positives (e.g. docs matching eval() text)
          var code = content
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/[^\n]*/g, "")
            .replace(/\/(?:\\.|[^\\/])+\/[gimsuy]*/g, " ")
            .replace(/'(?:\\.|[^\\'])*'/g, "''")
            .replace(/"(?:\\.|[^\\"])*"/g, '""')
            .replace(/`(?:\\.|[^\\`])*`/g, "``");
          if (/\beval\s*\(/i.test(code)) {
            self._add("high", fname, 1, "security", "Use of eval()", "Security risk with untrusted input.", "Avoid eval with untrusted data.", "eval call in code", "Use safer alternatives.", s,
              { confidence: 0.9, status: "CONFIRMED", simpleId: "sec_eval" });
          }
        });
      },
      secInnerHTML: function (s) {
        self._eachFile(["javascript", "typescript", "html"], function (fname, content) {
          if (/innerHTML\s*=/i.test(content)) {
            self._add("high", fname, 1, "security", "innerHTML assignment", "XSS risk if data is untrusted.", "textContent or sanitize.", "innerHTML =", "Prefer safer APIs.", s,
              { confidence: 0.75, status: "LIKELY", simpleId: "sec_innerhtml" });
          }
        });
      },
      secDocWrite: function (s) {
        self._eachFile(["javascript", "typescript", "html"], function (fname, content) {
          if (/document\.write\s*\(/i.test(content)) {
            self._add("high", fname, 1, "security", "document.write()", "Unsafe with untrusted data.", "DOM methods.", "document.write(", "Replace.", s,
              { confidence: 0.8, status: "LIKELY", simpleId: "sec_docwrite" });
          }
        });
      },
      secPassword: function (s) {
        self._eachFile(null, function (fname, content) {
          if (/password\s*=\s*["'][^"']+["']/i.test(content)) {
            self._add("high", fname, 1, "security", "Hardcoded password-like string", "Secrets can leak.", "External secrets.", "password = '...'", "Move out of source.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "sec_password" });
          }
        });
      },
      secApiKey: function (s) {
        self._eachFile(null, function (fname, content) {
          if (/api[_-]?key\s*=\s*["'][^"']+["']/i.test(content)) {
            self._add("high", fname, 1, "security", "Hardcoded API key", "Keys can be abused.", "Env/config.", "api_key =", "Externalize.", s,
              { confidence: 0.85, status: "CONFIRMED", simpleId: "sec_apikey" });
          }
        });
      },
      secInlineJs: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (/\son\w+\s*=\s*["']/i.test(content)) {
            self._add("medium", fname, 1, "security", "Inline event handlers", "Harder to secure and maintain.", "addEventListener.", "onclick= etc.", "Move JS to scripts.", s,
              { confidence: 0.65, status: "LIKELY", simpleId: "sec_eval" });
          }
        });
      },
      secHttp: function (s) {
        self._eachFile(["html", "css", "javascript"], function (fname, content) {
          if (/http:\/\/(?!localhost)/i.test(content)) {
            self._add("medium", fname, 1, "security", "Insecure http:// resource", "Mixed content / MITM risk.", "https://", "http:// found", "Use HTTPS URLs.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "sec_apikey" });
          }
        });
      },
      crossRefs: function (s) {
        if (!self.graph || !self.graph.references) return;
        self.graph.references.forEach(function (ref) {
          if (!ref.missing) return;
          if (ref.type === "asset") {
            self._add("medium", ref.from, 1, "reference", "Possible missing file: " + ref.target, "Broken assets.", "File exists.", ref.target, "Add or fix path.", s,
              { confidence: 0.72, status: "LIKELY", simpleId: "missing_asset" });
          }
        });
      },
      domIds: function (s) {
        if (!self.ctx.has.html || !self.graph) return;
        var ids = self.graph.htmlIds;
        function hasId(id) {
          if (!ids) return false;
          if (typeof ids.has === "function") return ids.has(id);
          return !!ids[id];
        }
        var any = false;
        if (ids && typeof ids.forEach === "function") ids.forEach(function () { any = true; });
        else if (ids) any = Object.keys(ids).length > 0;
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          var re = /(?:getElementById|querySelector)\s*\(\s*['"]#?([^'"]+)['"]/g, m;
          while ((m = re.exec(content))) {
            if (m[1] && any && !hasId(m[1])) {
              self._add("medium", fname, 1, "dom", "Missing DOM element: " + m[1], "May cause null errors.", "Element exists.", "No id=" + m[1], "Add element or guard.", s,
                { confidence: 0.7, status: "LIKELY", simpleId: "missing_dom" });
            }
          }
        });
      },
      todoFixme: function (s) {
        self._eachFile(null, function (fname, content) {
          if (/\bTODO\b|\bFIXME\b/.test(content)) {
            self._add("info", fname, 1, "maintainability", "TODO/FIXME present", "May hide unfinished work.", "Resolved items.", "TODO/FIXME", "Finish or track.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "todo_fixme" });
          }
        });
      },
      entryPoint: function (s) {
        if (Object.keys(self.files).length <= 1) return;
        var has = Object.keys(self.files).some(function (f) {
          var b = f.split("/").pop().toLowerCase();
          return ["index.html","main.js","app.js","index.js","main.py","app.py"].indexOf(b) !== -1;
        });
        if (!has) {
          self._add("low", "project", 1, "structure", "No clear entry file", "Harder to know where to start.", "index.html / main.js", "None found", "Use a standard name.", s,
            { confidence: 0.5, status: "POSSIBLE", simpleId: "no_entry" });
        }
      },
      consoleDebug: function (s) {
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          if (/console\.(debug|log)\s*\(/i.test(content) && self.level >= 3) {
            self._add("info", fname, 1, "maintainability", "console.log/debug left in code", "Noisy in production.", "Remove or gate logs.", "console.log", "Strip for production.", s,
              { confidence: 0.55, status: "POSSIBLE", simpleId: "todo_fixme" });
          }
        });
      },
      dupFunctions: function (s) {
        var seen = {};
        if (!self.graph || !self.graph.functions) return;
        self.graph.functions.forEach(function (fn) {
          var k = fn.name;
          if (seen[k] && seen[k] !== fn.file) {
            self._add("low", fn.file, 1, "logic", "Duplicate function name: " + k, "May shadow another definition.", "Unique names or modules.", k + " in multiple files", "Rename or namespace.", s,
              { confidence: 0.6, status: "POSSIBLE", simpleId: "no_entry" });
          }
          seen[k] = fn.file;
        });
      },
      undefPatterns: function (s) {
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          if (/\bundefined\b\s*[!=]==|\w+\s*===\s*undefined/.test(content) && /=\s*undefined\b/.test(content)) {
            self._add("info", fname, 1, "logic", "Explicit undefined assignment pattern", "May indicate incomplete logic.", "Intentional null/undefined handling.", "undefined assignment", "Review intent.", s,
              { confidence: 0.4, status: "POSSIBLE", simpleId: "todo_fixme" });
          }
        });
      },
      imgAlt: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (/<img/i.test(content) && !/\salt\s*=/i.test(content)) {
            self._add("medium", fname, 1, "accessibility", "Images without alt", "Hurts accessibility.", "alt on images.", "img without alt", "Add alt text.", s,
              { confidence: 0.82, status: "LIKELY", simpleId: "img_alt" });
          }
        });
      },
      btnType: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (/<button\b(?![^>]*type=)/i.test(content)) {
            self._add("low", fname, 1, "ui", "Button without type", "Defaults to submit in forms.", 'type="button"', "button without type", "Set type explicitly.", s,
              { confidence: 0.65, status: "LIKELY", simpleId: "img_alt" });
          }
        });
      },
      inputLabel: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (/<input\b/i.test(content) && !/<label\b/i.test(content)) {
            self._add("medium", fname, 1, "accessibility", "Inputs without labels", "Harder for assistive tech.", "label for inputs", "input without label", "Add labels.", s,
              { confidence: 0.6, status: "POSSIBLE", simpleId: "img_alt" });
          }
        });
      },
      docTitle: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (!/<title\b[^>]*>[^<]+<\/title>/i.test(content)) {
            self._add("low", fname, 1, "ui", "Missing or empty title", "Tabs/bookmarks lack a name.", "Meaningful <title>", "No title text", "Add a title.", s,
              { confidence: 0.8, status: "LIKELY", simpleId: "html_doctype" });
          }
        });
      },
      pxFont: function (s) {
        self._eachFile(["css", "html"], function (fname, content) {
          if (/font-size\s*:\s*\d+px/i.test(content) && !/\b(rem|em)\b/i.test(content)) {
            self._add("low", fname, 1, "ux", "Hard-coded px font sizes", "Harder to scale text.", "rem/em preferred.", "px only", "Consider rem.", s,
              { confidence: 0.55, status: "POSSIBLE", simpleId: "px_font" });
          }
        });
      },
      outlineNone: function (s) {
        self._eachFile(["css"], function (fname, content) {
          if (/outline\s*:\s*none/i.test(content) && !/:focus/i.test(content)) {
            self._add("medium", fname, 1, "ux", "outline:none without focus style", "Keyboard users lose focus visibility.", "Visible focus style", "outline:none", "Provide :focus styles.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "px_font" });
          }
        });
      },
      smallTarget: function (s) {
        self._eachFile(["css"], function (fname, content) {
          if (/width\s*:\s*([0-2]?\d)px/i.test(content) && /height\s*:\s*([0-2]?\d)px/i.test(content)) {
            self._add("info", fname, 1, "ux", "Possibly very small click targets", "Hard to tap on mobile.", "≥44px targets", "Small width/height px", "Increase hit area.", s,
              { confidence: 0.45, status: "POSSIBLE", simpleId: "px_font" });
          }
        });
      },
      manyScripts: function (s) {
        self._eachFile(["html"], function (fname, content) {
          var n = (content.match(/<script/gi) || []).length;
          if (n > 5) {
            self._add("medium", fname, 1, "performance", "Many script tags", "Can slow first load.", "Bundle/defer", n + " scripts", "Bundle or defer.", s,
              { confidence: 0.6, status: "POSSIBLE", simpleId: "many_scripts" });
          }
        });
      },
      cssImport: function (s) {
        self._eachFile(["css"], function (fname, content) {
          if (/@import\s+/i.test(content)) {
            self._add("low", fname, 1, "performance", "CSS @import", "Can delay styles.", "Use link tags", "@import found", "Prefer <link>.", s,
              { confidence: 0.75, status: "LIKELY", simpleId: "css_import" });
          }
        });
      },
      inlineStyles: function (s) {
        self._eachFile(["html"], function (fname, content) {
          var n = (content.match(/\sstyle\s*=\s*["'][^"']{40,}/gi) || []).length;
          if (n >= 3) {
            self._add("info", fname, 1, "performance", "Heavy inline styles", "Harder to cache/maintain.", "External CSS", n + " long style attrs", "Move to stylesheet.", s,
              { confidence: 0.55, status: "POSSIBLE", simpleId: "css_import" });
          }
        });
      },
      largeFile: function (s) {
        self._eachFile(null, function (fname, content) {
          if (content && content.length > 200000) {
            self._add("info", fname, 1, "performance", "Very large source file", "Harder to maintain.", "Split modules", content.length + " bytes", "Split the file.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "many_modules" });
          }
        });
      },
      viewport: function (s) {
        if (!self.ctx.has.html) return;
        var found = false;
        Object.keys(self.files).forEach(function (n) {
          if (/viewport/i.test(self.files[n])) found = true;
        });
        if (!found) {
          self._add("high", "project", 1, "responsive", "Missing viewport meta", "Mobile layout may be wrong.", "viewport meta", "None", "Add viewport meta.", s,
            { confidence: 0.92, status: "CONFIRMED", simpleId: "viewport" });
        }
      },
      mediaQueries: function (s) {
        if (!self.ctx.has.html || !self.ctx.has.css) return;
        var found = false;
        Object.keys(self.files).forEach(function (n) {
          if (/@media/i.test(self.files[n])) found = true;
        });
        if (!found) {
          self._add("medium", "project", 1, "responsive", "No CSS media queries", "Layout may not adapt.", "@media rules", "None", "Add breakpoints.", s,
            { confidence: 0.7, status: "LIKELY", simpleId: "no_media" });
        }
      },
      fixedWidth: function (s) {
        self._eachFile(["css", "html"], function (fname, content) {
          if (/width\s*:\s*([1-9]\d{3,})px/i.test(content)) {
            self._add("medium", fname, 1, "responsive", "Very large fixed width", "May overflow on small screens.", "max-width / fluid", "width ≥1000px", "Use max-width or %.", s,
              { confidence: 0.65, status: "LIKELY", simpleId: "no_media" });
          }
        });
      },
      imgMaxWidth: function (s) {
        var hasImg = false, hasMax = false;
        Object.keys(self.files).forEach(function (n) {
          var c = self.files[n];
          if (/<img/i.test(c) || /\bimg\b/.test(c)) hasImg = true;
          if (/max-width\s*:\s*100%/i.test(c)) hasMax = true;
        });
        if (hasImg && !hasMax && self.ctx.has.css) {
          self._add("low", "project", 1, "responsive", "Images may lack max-width:100%", "Large images can overflow.", "img { max-width:100% }", "No max-width:100%", "Add responsive image CSS.", s,
            { confidence: 0.5, status: "POSSIBLE", simpleId: "no_media" });
        }
      },
      manyModules: function (s) {
        var n = Object.keys(self.files).filter(function (f) {
          return [".js", ".ts", ".jsx", ".tsx"].indexOf(getExt(f)) !== -1;
        }).length;
        if (n > 10) {
          self._add("info", "project", 1, "architecture", "Many JS modules (" + n + ")", "Ensure bundling is intentional.", "Clear module strategy", n + " files", "Review build setup.", s,
            { confidence: 0.45, status: "POSSIBLE", simpleId: "many_modules" });
        }
      },
      mixedLang: function (s) {
        var keys = Object.keys(self.ctx.languages || {});
        if (keys.length >= 4) {
          self._add("info", "project", 1, "architecture", "Many languages in one upload", "May be intentional multi-stack.", "Clear boundaries", keys.join(", "), "Confirm structure.", s,
            { confidence: 0.4, status: "POSSIBLE", simpleId: "many_modules" });
        }
      },
      deepPath: function (s) {
        Object.keys(self.files).forEach(function (n) {
          if (n.split("/").length > 6) {
            self._add("info", n, 1, "architecture", "Very deep file path", "Can hinder navigation.", "Shallower structure", n, "Flatten folders if possible.", s,
              { confidence: 0.5, status: "POSSIBLE", simpleId: "no_entry" });
          }
        });
      },
      dupBasename: function (s) {
        var bases = {};
        Object.keys(self.files).forEach(function (n) {
          var b = n.split("/").pop();
          if (bases[b] && bases[b] !== n) {
            self._add("low", n, 1, "architecture", "Duplicate basename: " + b, "Can confuse imports.", "Unique names", bases[b] + " & " + n, "Rename one file.", s,
              { confidence: 0.6, status: "LIKELY", simpleId: "no_entry" });
          }
          bases[b] = n;
        });
      },
      nestedLoops: function (s) {
        self._eachFile(["javascript", "typescript", "python"], function (fname, content) {
          if (/for\s*\([^)]*\)\s*\{[^}]*for\s*\(/.test(content) || /for .+ in .+:\s*\n\s+for /.test(content)) {
            self._add("info", fname, 1, "logic", "Nested loops detected", "May be costly on large data.", "Review complexity", "Nested for", "Consider complexity.", s,
              { confidence: 0.5, status: "POSSIBLE", simpleId: "todo_fixme" });
          }
        });
      },
      longFunction: function (s) {
        self._eachFile(["javascript", "typescript", "python"], function (fname, content) {
          var lines = content.split("\n");
          if (lines.length > 300) {
            self._add("info", fname, 1, "logic", "Very long file (function density risk)", "Hard to maintain.", "Smaller units", lines.length + " lines", "Split functions/modules.", s,
              { confidence: 0.45, status: "POSSIBLE", simpleId: "many_modules" });
          }
        });
      },
      magicNumbers: function (s) {
        self._eachFile(["javascript", "typescript", "python"], function (fname, content) {
          var nums = content.match(/\b\d{3,}\b/g);
          if (nums && nums.length > 15) {
            self._add("info", fname, 1, "logic", "Many magic numbers", "Named constants are clearer.", "Named constants", nums.length + " large literals", "Extract constants.", s,
              { confidence: 0.4, status: "POSSIBLE", simpleId: "todo_fixme" });
          }
        });
      },
      cssImportant: function (s) {
        self._eachFile(["css"], function (fname, content) {
          var n = (content.match(/!important/gi) || []).length;
          if (n >= 5) {
            self._add("low", fname, 1, "ui", "Many !important flags", "Harder to override styles.", "Reduce specificity wars", n + " !important", "Refactor specificity.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "css_empty_rule" });
          }
        });
      },
      cssIdSel: function (s) {
        self._eachFile(["css"], function (fname, content) {
          var n = (content.match(/#[a-zA-Z][\w-]*\s*\{/g) || []).length;
          if (n >= 8) {
            self._add("info", fname, 1, "ui", "Many ID selectors in CSS", "High specificity, less reuse.", "Prefer classes", n + " ID rules", "Prefer class selectors.", s,
              { confidence: 0.55, status: "POSSIBLE", simpleId: "css_empty_rule" });
          }
        });
      },
      tabIndex: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (/tabindex\s*=\s*["']?[1-9]/i.test(content)) {
            self._add("medium", fname, 1, "ux", "Positive tabindex", "Disrupts natural focus order.", "tabindex 0 or -1", "tabindex>0", "Avoid positive tabindex.", s,
              { confidence: 0.75, status: "LIKELY", simpleId: "px_font" });
          }
        });
      },
      metaDesc: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (!/name\s*=\s*["']description["']/i.test(content)) {
            self._add("info", fname, 1, "ui", "Missing meta description", "Weaker SEO snippets.", "meta description", "None", "Add meta description.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "html_doctype" });
          }
        });
      },
      htmlLang: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (/<html\b/i.test(content) && !/<html[^>]*\slang\s*=/i.test(content)) {
            self._add("low", fname, 1, "ui", "Missing html lang attribute", "Accessibility / SEO signal.", 'lang="en" or fa', "No lang on html", "Add lang attribute.", s,
              { confidence: 0.85, status: "CONFIRMED", simpleId: "html_doctype" });
          }
        });
      }
    };
  };

  global.ADDebugEngine = { DebugEngine: DebugEngine };
})(typeof window !== "undefined" ? window : globalThis);
