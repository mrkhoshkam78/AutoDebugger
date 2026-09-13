/**
 * Auto Debugger V5.0 — Evidence-driven (Candidate → finalizeFinding)
 */
(function (global) {
  "use strict";
  var U = global.ADUtils || {};
  var getExt = U.getExt;
  var SUPPORTED_EXTENSIONS = U.SUPPORTED_EXTENSIONS || {};
  var TEST_LEVELS = U.TEST_LEVELS || { 1: "QUICK TEST", 2: "FULL CHECK", 3: "DEEP CHECK", 4: "SPECIAL" };

  function DebugEngine(files, language, category, level, projectGraph) {
    this.files = files || {};
    this.language = (language || "auto").toLowerCase();
    this.category = category || "Code / Logic";
    this.level = Math.min(4, Math.max(1, parseInt(level, 10) || 1));
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
    if (!this.astMap && globalThis.ADAst) {
      try { this.astMap = ADAst.analyzeProject(this.files); } catch (e) { this.astMap = null; }
    }
    // V6 Stage-1: Code Model + Deep Data-Flow + CFG + Symbolic + Module Graph
    this.codeModel = null;
    this.moduleGraph = null;
    this.cfgIssues = [];
    this.symbolicFindings = [];
    if (this.astMap && globalThis.ADCore && typeof ADCore.runStage1 === "function") {
      try {
        var s1 = ADCore.runStage1(this.files, this.astMap, { maxHops: 6 });
        this.codeModel = s1.codeModel;
        this.moduleGraph = s1.moduleGraph;
        this.cfgIssues = s1.cfgIssues || [];
        this.symbolicFindings = s1.symbolicFindings || [];
      } catch (e) { this.codeModel = null; }
    } else if (this.astMap && globalThis.ADAst && typeof ADAst.buildCodeModel === "function") {
      try { this.codeModel = ADAst.buildCodeModel(this.files, this.astMap); } catch (e) { this.codeModel = null; }
    }

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

    // Stage-1: emit CFG / symbolic findings as candidates (gated by finalizeFinding)
    this._emitStage1StructuralFindings();

    // Stage-2: Test Gen / Mutation / Dependency / Regression / Root-Cause (orchestrated)
    this.stage2 = null;
    if (typeof ADStage2 !== "undefined" && ADStage2.runStage2) {
      try {
        var pk = (typeof ADResultsStore !== "undefined" && ADResultsStore.projectKeyFromFiles)
          ? ADResultsStore.projectKeyFromFiles(this.files) : "default";
        this.stage2 = ADStage2.runStage2(
          { problems: this.problems },
          this.files,
          {
            codeModel: this.codeModel,
            moduleGraph: this.moduleGraph,
            astMap: this.astMap,
            cfgIssues: this.cfgIssues,
            symbolicFindings: this.symbolicFindings,
            projectKey: pk,
            version: "V6-Stage2",
            maxCandidates: 40
          }
        );
        // Promote high-confidence dependency findings through same gate
        this._emitStage2DependencyFindings();
      } catch (e2) { this.stage2 = { error: String(e2 && e2.message || e2) }; }
    }

    // Stage-3: Multi-Engine Correlation · Evidence Graph · DOM · Git · Adaptive
    this.stage3 = null;
    if (typeof ADStage3 !== "undefined" && ADStage3.runStage3) {
      try {
        this.stage3 = ADStage3.runStage3({
          files: this.files,
          codeModel: this.codeModel,
          moduleGraph: this.moduleGraph,
          cfgIssues: this.cfgIssues,
          symbolicFindings: this.symbolicFindings,
          problems: this.problems,
          stage2: this.stage2 || {},
          astMap: this.astMap,
          gitMeta: this.gitMeta || null,
          options: { version: "V6-Stage3" }
        });
        if (this.stage3 && this.stage3.problems) {
          this.problems = this.stage3.problems;
        }
        // Promote high-signal DOM findings not already covered
        this._emitStage3DomFindings();
      } catch (e3) {
        this.stage3 = { error: String(e3 && e3.message || e3) };
      }
    }

    if (typeof ADStandards !== "undefined" && ADStandards.postValidateFindings) {
      this.problems = ADStandards.postValidateFindings(this.problems);
    }
    this.testResults[0].status = "completed";
    this.testResults[0].problems_found = this.problems.length;

    return {
      pipelineStages: [
        "1:Project Understanding", "2:Structural Parsing", "3:Code Model",
        "4:Strategy Selection", "5:Candidate Detection", "6:Data Flow",
        "7:Control Flow", "8:Symbolic Check", "9:Cross-file Check",
        "10:Validation", "11:Test Generation", "12:Mutation", "13:Dependency/API",
        "14:Regression", "15:Root Cause Ranking", "16:Correlation", "17:Evidence Graph",
        "18:DOM Analysis", "19:Git/Hotspot", "20:Adaptive Confidence", "21:Final Finding"
      ],
      problems: this.problems,
      stage2: this.stage2 || null,
      stage3: this.stage3 || null,
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
        strategies_run: this.strategiesRun.length,
        stage3: this.stage3 ? this.stage3.summary : null
      }
    };
  };


  DebugEngine.prototype._emitStage3DomFindings = function () {
    if (!this.stage3 || !this.stage3.domFindings) return;
    var self = this;
    var strat = { id: "STAGE3-DOM", category: "Code / Logic", method: "stage3" };
    var seen = {};
    (this.problems || []).forEach(function (p) {
      seen[(p.file_name || p.file || "") + ":" + (p.line || 0)] = true;
    });
    (this.stage3.domFindings || []).forEach(function (d) {
      if (d.type === "dom_selector_valid" || d.type === "dom_safe_sink" || d.type === "dom_event" || d.type === "dom_create") return;
      if (d.type === "dom_dataflow_sink") return; // already covered by security strategies
      var key = (d.file || "") + ":" + (d.line || 0);
      if (seen[key]) return;
      seen[key] = true;
      var sev = d.type === "dom_selector_missing" ? "medium" : "low";
      var conf = d.strength || 0.55;
      self._add(sev, d.file, d.line || 1, "dom",
        d.explanation || d.detail || d.type,
        "Static DOM analysis",
        "Selector should resolve to an existing element or null-check before use",
        d.detail || d.type,
        d.type === "dom_selector_missing"
          ? "Verify the element exists in HTML or guard with null checks"
          : "Review DOM operation",
        strat,
        {
          confidence: conf,
          status: conf >= 0.7 ? "LIKELY" : "POSSIBLE",
          simpleId: d.type,
          evidence: [{ type: d.type, engine: "dom", file: d.file, line: d.line, snippet: d.detail, strength: conf }],
          symptom: d.explanation || d.detail,
          root_cause: d.type === "dom_selector_missing" ? "Selector does not match any id/class in project HTML" : "DOM static signal",
          classificationHint: d.type === "dom_selector_missing" ? "POSSIBLE_ISSUE" : "CODE_SMELL"
        }
      );
    });
  };

  DebugEngine.prototype._add = function (severity, file, line, section, description, why, expected, detected, recommendation, strategy, extras) {
    extras = extras || {};
    // V5.0: Rule → Candidate → finalizeFinding (Evidence + Context + Validation + Confidence)
    if (typeof ADStandards !== "undefined" && ADStandards.finalizeFinding && ADStandards.createCandidateFromAdd) {
      var candidate = ADStandards.createCandidateFromAdd(
        severity, file, line, section, description, why, expected, detected, recommendation, strategy, extras, this.ctx
      );
      // Prefer engine category when strategy category empty
      if (!candidate.category) candidate.category = this.category;
      var finding = ADStandards.finalizeFinding(candidate, this.ctx);
      if (!finding) return; // DO_NOT_REPORT / NOT_APPLICABLE / failed gate
      this.counter++;
      finding.problem_id = "P" + String(this.counter).padStart(4, "0");
      finding.test_level = this.level;
      if (!finding.category) finding.category = this.category;
      if (!finding.related_categories || !finding.related_categories.length) {
        finding.related_categories = [finding.category || this.category];
      }
      this.problems.push(finding);
      return;
    }
    // Legacy fallback (no ADStandards)
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

  /** Stage-2 dependency / API findings → candidates through finalizeFinding */
  DebugEngine.prototype._emitStage2DependencyFindings = function () {
    var self = this;
    if (!this.stage2) return;
    var strat = { id: "STAGE2-DEP", category: "Structure / Architecture", method: "stage2" };
    function emit(sev, file, line, section, desc, why, expected, detected, rec, extras) {
      self._add(sev, file, line, section, desc, why, expected, detected, rec, strat, extras || {});
    }
    (this.stage2.dependencyFindings || []).forEach(function (d) {
      if (!d || (d.confidence || 0) < 0.5) return; // drop weak smells from auto-emit
      if (d.kind === "unused_export") return; // code smell only — skip confirmed path
      var conf = d.confidence || 0.6;
      emit(
        d.severity || "medium",
        d.file || "project",
        d.line || 1,
        "dependency",
        d.detail || d.kind,
        "Module graph / symbol resolution signal",
        "Resolved consistent imports/exports",
        d.kind,
        "Fix import path or export list",
        {
          confidence: conf,
          status: conf >= 0.8 ? "LIKELY" : "POSSIBLE",
          simpleId: "dep_" + (d.kind || "issue"),
          evidence: [{ file: d.file || "", line: d.line || 1, type: "cross-file", snippet: d.detail || "", explanation: d.kind }],
          root_cause: d.detail || d.kind,
          symptom: d.kind,
          impact: d.severity || "medium"
        }
      );
    });
    (this.stage2.apiFindings || []).forEach(function (a) {
      if (!a || (a.confidence || 0) < 0.55) return;
      emit(
        a.severity || "low",
        a.file || "project",
        a.line || 1,
        "api-contract",
        a.detail || a.kind,
        "Caller/callee shape inconsistency (static heuristic)",
        "Matching parameter/return contracts",
        a.kind,
        "Align call sites with definitions",
        {
          confidence: a.confidence || 0.4,
          status: "POSSIBLE",
          simpleId: "api_" + (a.kind || "x"),
          evidence: [{ file: a.file || "", line: a.line || 1, type: "ast", snippet: a.detail || "", explanation: "API contract heuristic" }],
          root_cause: a.detail,
          symptom: a.kind,
          impact: "Possible runtime mismatch"
        }
      );
    });
  };

  /** Stage-1 structural findings from CFG + limited symbolic execution */
  DebugEngine.prototype._emitStage1StructuralFindings = function () {
    var self = this;
    var strat = { id: "STAGE1-CFG", category: "Code / Logic", method: "stage1" };
    function emit(sev, file, line, section, desc, why, expected, detected, rec, extras) {
      self._add(sev, file, line, section, desc, why, expected, detected, rec, strat, extras || {});
    }
    (this.cfgIssues || []).forEach(function (iss) {
      if (!iss || !iss.type) return;
      if (iss.type === "always_true" || iss.type === "always_false") {
        emit("medium", iss.file, iss.line || 1, "control-flow",
          iss.type === "always_true" ? "Always-true condition" : "Always-false / unreachable branch",
          iss.explanation || "Condition has constant value",
          "Use meaningful conditions or remove dead branch",
          iss.cond || iss.explanation,
          "Simplify control flow",
          {
            confidence: 0.78,
            status: "LIKELY",
            simpleId: "cfg_" + iss.type,
            evidence: [{
              file: iss.file, line: iss.line || 1, type: "controlflow",
              snippet: iss.cond || "", explanation: iss.explanation,
              controlPath: iss.controlPath || []
            }],
            root_cause: "Constant condition collapses branch reachability",
            symptom: iss.explanation,
            impact: "Dead code or misleading control flow"
          });
      } else if (iss.type === "unreachable") {
        emit("medium", iss.file, iss.line || 1, "control-flow",
          "Possibly unreachable code",
          iss.explanation || "Code after return/throw",
          "Remove or restructure control flow",
          "stmt after exit",
          "Delete dead code or fix control paths",
          {
            confidence: 0.7,
            status: "LIKELY",
            simpleId: "cfg_unreachable",
            evidence: [{
              file: iss.file, line: iss.line || 1, type: "controlflow",
              snippet: "", explanation: iss.explanation,
              controlPath: iss.controlPath || []
            }],
            root_cause: "Control flow exits before statement",
            symptom: "Unreachable statement",
            impact: "Dead code"
          });
      } else if (iss.type === "empty_catch") {
        emit("medium", iss.file, iss.line || 1, "control-flow",
          "Empty catch block",
          "Errors are swallowed — missing error path",
          "Handle or rethrow",
          "catch { }",
          "Log, recover, or rethrow",
          {
            confidence: 0.72,
            status: "LIKELY",
            simpleId: "cfg_empty_catch",
            evidence: [{
              file: iss.file, line: iss.line || 1, type: "controlflow",
              snippet: "catch", explanation: iss.explanation,
              controlPath: iss.controlPath || []
            }],
            root_cause: "Exception path discards error without handling",
            symptom: "Empty catch",
            impact: "Silent failures"
          });
      }
    });
    (this.symbolicFindings || []).forEach(function (f) {
      if (!f || !f.type) return;
      if (f.type === "null_deref") {
        emit("high", f.file, f.line || 1, "logic",
          "Possible null/undefined property access",
          f.explanation || (f.symbol + " may be null"),
          "Guard before property access",
          f.symbol + " is " + f.value,
          "Add null check before use",
          {
            confidence: 0.8,
            status: "LIKELY",
            simpleId: "sym_null_deref",
            evidence: [{
              file: f.file, line: f.line || 1, type: "symbolic",
              snippet: f.symbol, explanation: f.explanation,
              controlPath: f.controlPath || []
            }],
            root_cause: "Symbol " + f.symbol + " holds " + f.value + " and is used without a guard on this path",
            symptom: "Property access on possibly null value",
            impact: "Runtime TypeError"
          });
      } else if (f.type === "impossible_then") {
        emit("medium", f.file, f.line || 1, "control-flow",
          "Impossible conditional branch",
          f.explanation || "Branch contradicts known value",
          "Remove dead branch or fix assignment",
          f.symbol + "=" + f.value,
          "Align condition with actual values",
          {
            confidence: 0.82,
            status: "LIKELY",
            simpleId: "sym_impossible",
            evidence: [{
              file: f.file, line: f.line || 1, type: "symbolic",
              snippet: f.symbol, explanation: f.explanation,
              controlPath: f.controlPath || []
            }],
            root_cause: "Symbolic value " + f.symbol + "=" + f.value + " contradicts branch condition",
            symptom: "Unreachable then-branch",
            impact: "Dead code / logic error"
          });
      }
    });
  };

  /** Explicit candidate emission API for migrated rules */
  DebugEngine.prototype._emitCandidate = function (candidateOpts) {
    if (typeof ADStandards === "undefined" || !ADStandards.finalizeFinding) {
      return;
    }
    var candidate = ADStandards.createCandidate(candidateOpts || {});
    if (!candidate.category) candidate.category = this.category;
    candidate.context = this.ctx;
    var finding = ADStandards.finalizeFinding(candidate, this.ctx);
    if (!finding) return;
    this.counter++;
    finding.problem_id = "P" + String(this.counter).padStart(4, "0");
    finding.test_level = this.level;
    this.problems.push(finding);
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
  
  function stripNoise(content) {
    return String(content || "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/(?:\\.|[^\\/\n])+\/[gimsuy]*/g, " ")
      .replace(/'(?:\\.|[^\\'])*'/g, "''")
      .replace(/"(?:\\.|[^\\"])*"/g, '""')
      .replace(/`(?:\\.|[^\\`])*`/g, "``");
  }

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
          if (typeof ADStandards !== "undefined" && ADStandards.isVendorFile(fname)) return;
          if (typeof ADStandards !== "undefined") {
            var bal = ADStandards.countDelimiters(content);
            if (!bal.balanced) {
              var delta = Math.abs(bal.paren) + Math.abs(bal.bracket) + Math.abs(bal.brace);
              if (delta < 1) return;
              self._add("high", fname, 1, "structure", "Unbalanced braces/parentheses", "Usually causes parse errors.", "Balanced delimiters.",
                "Dparen=" + bal.paren + " Dbracket=" + bal.bracket + " Dbrace=" + bal.brace,
                "Fix matching brackets.", s,
                { confidence: delta >= 2 ? 0.88 : 0.72, status: delta >= 2 ? "CONFIRMED" : "LIKELY", simpleId: "js_unbalanced" });
            }
            return;
          }
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
          if (typeof ADStandards !== "undefined") {
            var bal = ADStandards.countDelimiters(content);
            if (!bal.balanced) {
              self._add("high", fname, 1, "structure", "Unbalanced brackets (Python)", "Causes SyntaxError.", "Balanced.",
                "Dparen=" + bal.paren + " Dbracket=" + bal.bracket + " Dbrace=" + bal.brace,
                "Balance brackets.", s,
                { confidence: 0.85, status: "CONFIRMED", simpleId: "py_unbalanced" });
            }
            return;
          }
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
          if (typeof ADStandards !== "undefined") {
            var bal = ADStandards.countDelimiters(content);
            if (!bal.balanced) {
              self._add("high", fname, 1, "css", "Unbalanced CSS braces", "Breaks cascade.", "Equal braces.",
                "Dbrace=" + bal.brace, "Balance braces.", s,
                { confidence: 0.9, status: "CONFIRMED", simpleId: "css_unbalanced" });
            }
            return;
          }
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
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          var code = content
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/[^\n]*/g, "")
            .replace(/\/(?:\\.|[^\\/])+\/[gimsuy]*/g, " ")
            .replace(/'(?:\\.|[^\\'])*'/g, "''")
            .replace(/"(?:\\.|[^\\"])*"/g, '""')
            .replace(/`(?:\\.|[^\\`])*`/g, "``");
          if (!/\beval\s*\(/i.test(code)) return;
          var flows = [];
          if (self.codeModel && globalThis.ADAst && ADAst.findFlowsForSink) {
            try { flows = ADAst.findFlowsForSink(self.codeModel, fname, "eval", null) || []; } catch (e) {}
          }
          var line = 1;
          var idx = content.search(/\beval\s*\(/);
          if (idx >= 0) line = content.slice(0, idx).split("\n").length;
          if (flows.length && !(flows[0].weak)) {
            var f0 = flows[0];
            var srcKind = (f0.source && f0.source.kind) || "user-input";
            self._add("critical", fname, line, "security",
              "eval() reachable from " + srcKind,
              "Untrusted data can reach eval → arbitrary code execution.",
              "Never pass user/URL/storage data to eval; use safe parsing.",
              "SOURCE(" + srcKind + ") → eval()",
              "Remove eval or hard-block untrusted inputs.", s,
              {
                confidence: 0.92,
                status: "CONFIRMED",
                simpleId: "sec_eval_flow",
                evidence: [
                  { file: fname, line: (f0.source && f0.source.line) || line, type: "dataflow", snippet: (f0.source && f0.source.evidence) || srcKind, explanation: "Source: " + srcKind },
                  { file: fname, line: line, type: "dataflow", snippet: "eval(", explanation: "Sink: eval" }
                ],
                root_cause: "User-controlled or external data flows into eval()",
                symptom: "Dynamic code execution with potentially untrusted input",
                impact: "Remote code execution / XSS"
              });
          } else {
            self._add("high", fname, line, "security", "Use of eval()",
              "eval executes strings as code; dangerous if any input is untrusted.",
              "Avoid eval; use JSON.parse or structured APIs.",
              "eval call in executable code",
              "Replace with safer alternatives.", s,
              {
                confidence: 0.72,
                status: "LIKELY",
                simpleId: "sec_eval",
                evidence: [{ file: fname, line: line, type: "ast", snippet: "eval(", explanation: "Sink present; no proven source→sink path" }],
                root_cause: "Dynamic code execution via eval",
                symptom: "eval() call in code",
                impact: "Potential RCE if input is attacker-controlled"
              });
          }
        });
      },
      secInnerHTML: function (s) {
        self._eachFile(["javascript", "typescript", "html"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          var code = content
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/[^\n]*/g, "")
            .replace(/'(?:\\.|[^\\'])*'/g, "''")
            .replace(/"(?:\\.|[^\\"])*"/g, '""')
            .replace(/`(?:\\.|[^\\`])*`/g, "``");
          if (!/innerHTML\s*=/i.test(code)) return;
          var flows = [];
          if (self.codeModel && globalThis.ADAst && ADAst.findFlowsForSink) {
            try { flows = ADAst.findFlowsForSink(self.codeModel, fname, "innerHTML", null) || []; } catch (e) {}
          }
          // Prefer codeModel deep flows (Stage-1)
          if (self.codeModel && self.codeModel.dataFlows) {
            var deep = self.codeModel.dataFlows.filter(function (f) {
              return f.file === fname && f.sink && f.sink.kind === "innerHTML" && !f.weak;
            });
            if (deep.length) flows = deep;
          }
          var line = 1;
          var idx = code.search(/innerHTML\s*=/);
          if (idx >= 0) {
            // map approx line via original
            var oidx = content.search(/innerHTML\s*=/);
            if (oidx >= 0) line = content.slice(0, oidx).split("\n").length;
          }
          if (flows.length && !(flows[0].weak)) {
            var f0 = flows[0];
            var srcKind = (f0.source && f0.source.kind) || "user-input";
            self._add("critical", fname, line, "security",
              "innerHTML assignment fed by " + srcKind,
              "Untrusted data written to DOM via innerHTML enables XSS.",
              "Use textContent or a sanitizer (e.g. DOMPurify).",
              "SOURCE(" + srcKind + ") → innerHTML",
              "Sanitize or avoid innerHTML for untrusted data.", s,
              {
                confidence: 0.9,
                status: "CONFIRMED",
                simpleId: "sec_innerhtml_flow",
                evidence: [
                  { file: fname, line: (f0.source && f0.source.line) || line, type: "dataflow", snippet: (f0.source && f0.source.evidence) || srcKind, explanation: "Source: " + srcKind },
                  { file: fname, line: line, type: "dataflow", snippet: "innerHTML =", explanation: "Sink: innerHTML", flowPath: f0.flowPath || [] }
                ],
                root_cause: "User/URL/storage/network data reaches innerHTML without sanitization",
                symptom: "DOM XSS sink with proven source",
                impact: "Cross-site scripting",
                metadata: { flow: f0.flowPath || [] }
              });
          } else {
            self._add("high", fname, line, "security", "innerHTML assignment",
              "XSS risk if the assigned value is untrusted.",
              "Prefer textContent or sanitize HTML.",
              "innerHTML =",
              "Prefer safer APIs.", s,
              {
                confidence: 0.7,
                status: "LIKELY",
                simpleId: "sec_innerhtml",
                evidence: [{ file: fname, line: line, type: "ast", snippet: "innerHTML =", explanation: "Sink present; flow not fully proven" }],
                root_cause: "Unsafe DOM write API",
                symptom: "innerHTML assignment",
                impact: "Potential XSS"
              });
          }
        });
      },
      secDocWrite: function (s) {
        self._eachFile(["javascript", "typescript", "html"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          if (/document\.write\s*\(/i.test(content)) {
            self._add("high", fname, 1, "security", "document.write()", "Unsafe with untrusted data.", "DOM methods.", "document.write(", "Replace.", s,
              { confidence: 0.8, status: "LIKELY", simpleId: "sec_docwrite" });
          }
        });
      },
      secPassword: function (s) {
        self._eachFile(null, function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          if (/password\s*=\s*["'][^"']+["']/i.test(content)) {
            self._add("high", fname, 1, "security", "Hardcoded password-like string", "Secrets can leak.", "External secrets.", "password = '...'", "Move out of source.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "sec_password" });
          }
        });
      },
      secApiKey: function (s) {
        self._eachFile(null, function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
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
          if (typeof ADStandards !== "undefined" && ADStandards.isVendorFile(fname)) return;
          var re = /getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/g, m;
          while ((m = re.exec(content))) {
            var id = m[1];
            if (typeof ADStandards !== "undefined" && !ADStandards.isValidDomId(id)) continue;
            if (any && !hasId(id)) {
              self._add("medium", fname, 1, "dom", "Missing DOM element: " + id, "May cause null errors.", "Element exists.", "No id=" + id, "Add element or guard.", s,
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

      secOuterHTML: function (s) {
        self._eachFile(["javascript", "typescript", "html"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          var code = stripNoise(content);
          if (/\.outerHTML\s*=/i.test(code)) {
            self._add("high", fname, 1, "security", "outerHTML assignment",
              "SOURCE→SINK: dynamic HTML may reach the DOM via outerHTML.",
              "Avoid assigning untrusted data to outerHTML.",
              "outerHTML =", "Sanitize or use text APIs.", s,
              { confidence: 0.78, status: "LIKELY", simpleId: "sec_innerhtml",
                evidence: "Source: dynamic value → Sink: outerHTML → Impact: XSS" });
          }
        });
      },
      secInsertAdj: function (s) {
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          var code = stripNoise(content);
          if (/insertAdjacentHTML\s*\(/i.test(code)) {
            self._add("high", fname, 1, "security", "insertAdjacentHTML usage",
              "Untrusted HTML can be injected into the page.",
              "Sanitize HTML or avoid insertAdjacentHTML.",
              "insertAdjacentHTML(", "Use safer DOM APIs.", s,
              { confidence: 0.8, status: "LIKELY", simpleId: "sec_innerhtml",
                evidence: "Sink: insertAdjacentHTML → DOM XSS risk" });
          }
        });
      },
      secFunctionCtor: function (s) {
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          var code = stripNoise(content);
          if (/\bnew\s+Function\s*\(/i.test(code) || /\bFunction\s*\(\s*["']/i.test(code)) {
            self._add("high", fname, 1, "security", "Function constructor",
              "Similar to eval: can execute dynamic strings as code.",
              "Avoid Function constructor with untrusted input.",
              "new Function(", "Use declarative logic.", s,
              { confidence: 0.88, status: "CONFIRMED", simpleId: "sec_eval",
                evidence: "Sink: Function() dynamic execution" });
          }
        });
      },
      secJsUrl: function (s) {
        self._eachFile(["html", "javascript", "typescript"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          if (/javascript\s*:/i.test(content) && !/content=["'][^"']*javascript:/i.test(content)) {
            // still check code path
            var code = stripNoise(content);
            if (/javascript\s*:/i.test(code) || /href\s*=\s*["']javascript:/i.test(content)) {
              self._add("high", fname, 1, "security", "javascript: URL",
                "Can run script when a link is activated.",
                "Use https links or event handlers.",
                "javascript:", "Remove javascript: URLs.", s,
                { confidence: 0.85, status: "CONFIRMED", simpleId: "sec_eval",
                  evidence: "Sink: javascript: URL handler" });
            }
          }
        });
      },
      secLocalStorage: function (s) {
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          var code = stripNoise(content);
          if (/localStorage\.setItem\s*\(/i.test(code) && /(token|password|secret|auth|session|api[_-]?key)/i.test(content)) {
            self._add("high", fname, 1, "security", "Sensitive data in localStorage",
              "SOURCE: secret-like value → SINK: localStorage (readable by XSS).",
              "Prefer httpOnly cookies or secure storage.",
              "localStorage.setItem + sensitive key", "Do not store secrets client-side.", s,
              { confidence: 0.72, status: "LIKELY", simpleId: "sec_apikey",
                evidence: "Source: token/password → Sink: localStorage" });
          }
        });
      },
      secCookie: function (s) {
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          var code = stripNoise(content);
          if (/document\.cookie\s*=/i.test(code)) {
            self._add("medium", fname, 1, "security", "document.cookie assignment",
              "Client-side cookie writes may miss Secure/HttpOnly flags.",
              "Set cookies from the server when possible.",
              "document.cookie =", "Review cookie security flags.", s,
              { confidence: 0.65, status: "LIKELY", simpleId: "sec_password" });
          }
        });
      },
      secPostMessage: function (s) {
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          var code = stripNoise(content);
          if (/postMessage\s*\([^)]*,\s*["']\*["']/i.test(code)) {
            self._add("high", fname, 1, "security", "postMessage with wildcard origin",
              "Any window can receive the message.",
              "Specify a concrete target origin.",
              "postMessage(..., '*')", "Replace * with exact origin.", s,
              { confidence: 0.9, status: "CONFIRMED", simpleId: "sec_eval",
                evidence: "Sink: postMessage targetOrigin=*" });
          }
        });
      },
      secIframe: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (/<iframe\b/i.test(content) && !/sandbox\s*=/i.test(content)) {
            self._add("medium", fname, 1, "security", "iframe without sandbox",
              "Embedded frames can increase attack surface.",
              "Add sandbox attribute when possible.",
              "iframe without sandbox", "Add sandbox restrictions.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "sec_innerhtml" });
          }
        });
      },
      secTargetBlank: function (s) {
        self._eachFile(["html"], function (fname, content) {
          if (/target\s*=\s*["']_blank["']/i.test(content) && !/rel\s*=\s*["'][^"']*noopener/i.test(content)) {
            self._add("medium", fname, 1, "security", "target=_blank without rel=noopener",
              "Opened page may access window.opener.",
              'rel="noopener noreferrer"',
              "target=_blank", "Add rel=noopener.", s,
              { confidence: 0.8, status: "LIKELY", simpleId: "sec_innerhtml" });
          }
        });
      },
      secSourceSink: function (s) {
        self._eachFile(["javascript", "typescript"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          var code = stripNoise(content);
          var hasSource = /(location\.hash|location\.search|document\.URL|document\.referrer|\.value\b|getElementById\([^)]+\)\.value)/i.test(code);
          var hasSink = /(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\s*=/i.test(code) || /(innerHTML|insertAdjacentHTML)\s*\(/i.test(code);
          if (hasSource && hasSink) {
            self._add("critical", fname, 1, "security", "Possible user input to HTML sink",
              "SOURCE (URL/input) may reach SINK (HTML write) without clear sanitization.",
              "Validate and encode before DOM write.",
              "source+sink patterns in same file", "Sanitize between source and sink.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "sec_innerhtml",
                evidence: "Source: location/input → Sink: innerHTML/write → Impact: XSS" });
          }
        });
      },
      secPhpSql: function (s) {
        self._eachFile(["php"], function (fname, content) {
          var code = stripNoise(content);
          if (/(mysqli_query|mysql_query|->query)\s*\(\s*["'].*\$_(GET|POST|REQUEST)/i.test(content) ||
              /(\$_GET|\$_POST|\$_REQUEST).*(\.|\{).*SELECT|INSERT|UPDATE|DELETE/i.test(content)) {
            self._add("critical", fname, 1, "security", "Possible SQL string with user input",
              "User input concatenated into SQL is a classic injection risk.",
              "Use prepared statements.",
              "$_GET/POST near SQL", "Parameterized queries.", s,
              { confidence: 0.75, status: "LIKELY", simpleId: "sec_eval",
                evidence: "Source: $_GET/POST → Sink: SQL query" });
          }
        });
      },
      secPyPickle: function (s) {
        self._eachFile(["python"], function (fname, content) {
          if (/pickle\.loads?\s*\(/i.test(content)) {
            self._add("high", fname, 1, "security", "pickle.load/loads usage",
              "Untrusted pickle data can execute code.",
              "Avoid pickle for untrusted data.",
              "pickle.load", "Use safe formats (JSON).", s,
              { confidence: 0.85, status: "CONFIRMED", simpleId: "sec_eval" });
          }
        });
      },
      secPyYaml: function (s) {
        self._eachFile(["python"], function (fname, content) {
          if (/yaml\.load\s*\(/i.test(content) && !/Loader\s*=\s*yaml\.SafeLoader/i.test(content)) {
            self._add("high", fname, 1, "security", "yaml.load without SafeLoader",
              "Unsafe YAML loading can lead to code execution.",
              "yaml.safe_load or SafeLoader",
              "yaml.load(", "Use safe_load.", s,
              { confidence: 0.8, status: "LIKELY", simpleId: "sec_eval" });
          }
        });
      },
      secCmdInject: function (s) {
        self._eachFile(["python", "php", "javascript"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.shouldSkipSecurityKeywordScan(fname)) return;
          var code = stripNoise(content);
          if (/(os\.system|subprocess\.(call|Popen|run)|shell_exec|exec\s*\(|child_process)/i.test(code) &&
              /(\+|`|\$\{|\$_GET|\$_POST|req\.|request\.)/i.test(content)) {
            self._add("critical", fname, 1, "security", "Possible command injection signal",
              "User-influenced data may reach a shell command.",
              "Avoid shell=True; sanitize arguments.",
              "shell/exec + concat/user data", "Use argument arrays, no shell.", s,
              { confidence: 0.65, status: "LIKELY", simpleId: "sec_eval",
                evidence: "Source: user/concat → Sink: shell/exec" });
          }
        });
      },
      cmbXssChain: function (s) {
        // Stage-1: only report cross-file when module graph has a real edge + flow
        var flows = (self.codeModel && self.codeModel.dataFlows) || [];
        var xf = flows.filter(function (f) { return f.crossFile && !f.weak; });
        if (xf.length) {
          xf.forEach(function (f0) {
            var srcKind = (f0.source && f0.source.kind) || "user-input";
            var sinkKind = (f0.sink && f0.sink.kind) || "sink";
            self._add("high", f0.file || f0.sourceFile || "project", (f0.sink && f0.sink.line) || 1, "security",
              "Cross-file " + srcKind + " → " + sinkKind,
              "Untrusted data propagates across modules into a dangerous sink.",
              "Sanitize at module boundary or remove sink.",
              "SOURCE(" + (f0.sourceFile || "") + ") → import/export → SINK(" + (f0.file || "") + ")",
              "Trace dependency edge and sanitize.", s,
              {
                confidence: 0.78,
                status: "LIKELY",
                simpleId: "sec_xss_crossfile",
                evidence: [
                  { file: f0.sourceFile || "", line: (f0.source && f0.source.line) || 0, type: "dataflow", snippet: srcKind, explanation: "Source module" },
                  { file: f0.file || "", line: (f0.sink && f0.sink.line) || 0, type: "cross-file", snippet: sinkKind, explanation: "Sink module via import edge", flowPath: f0.flowPath || [] }
                ],
                root_cause: "Real module dependency carries " + srcKind + " toward " + sinkKind + " without sanitization evidence",
                symptom: "Cross-file source-to-sink path",
                impact: "XSS / injection across modules"
              });
          });
          return;
        }
        // No real edge: do NOT invent cross-file bug from independent source+sink files
      },
      cmbSecretStorage: function (s) {
        var hasSecret = false, hasStore = false, f1 = "project", f2 = "project";
        Object.keys(self.files).forEach(function (n) {
          var c = self.files[n];
          if (/(api[_-]?key|secret|password|token)\s*=\s*["']/i.test(c)) { hasSecret = true; f1 = n; }
          if (/localStorage\.setItem|sessionStorage\.setItem/i.test(c)) { hasStore = true; f2 = n; }
        });
        if (hasSecret && hasStore) {
          self._add("high", f1, 1, "security", "Secrets pattern + browser storage",
            "Hardcoded secrets combined with client storage increases exposure.",
            "Remove secrets from client code.",
            "secret-like + localStorage", "Externalize secrets.", s,
            { confidence: 0.7, status: "LIKELY", simpleId: "sec_apikey",
              evidence: "Secret signal (" + f1 + ") + storage (" + f2 + ")" });
        }
      },
      // Creative Special handlers (real lightweight checks)
      crEmptyInput: function (s) {
        self._eachFile(["javascript","typescript"], function (fname, content) {
          if (/\.value\b/.test(content) && !/if\s*\(.*\.value/.test(content) && !/\.value\s*\|\|/.test(content)) {
            self._add("info", fname, 1, "logic", "Input value used without empty check",
              "Empty user input may cause unexpected behavior.",
              "Validate empty strings.", " .value without guard", "Check for empty input.", s,
              { confidence: 0.4, status: "POSSIBLE", simpleId: "todo_fixme" });
          }
        });
      },
      crNullGuard: function (s) {
        self._eachFile(["javascript","typescript"], function (fname, content) {
          if (/getElementById\s*\([^)]+\)\s*\./.test(content) && !/\?\.|if\s*\(.*getElementById/.test(content)) {
            self._add("medium", fname, 1, "logic", "DOM node used without null check",
              "Missing element leads to runtime TypeError.",
              "Guard null results.", "getElementById(...).", "Add null checks.", s,
              { confidence: 0.6, status: "POSSIBLE", simpleId: "missing_dom" });
          }
        });
      },
      crTypeConfusion: function (s) {
        self._eachFile(["javascript","typescript"], function (fname, content) {
          if (/==\s*null|!=\s*null|==\s*undefined/.test(content) && /==\s*[^=]/.test(content)) {
            self._add("info", fname, 1, "logic", "Loose equality usage",
              "Loose == can mix types unexpectedly.",
              "Prefer ===", "Loose ==", "Use strict equality.", s,
              { confidence: 0.45, status: "POSSIBLE", simpleId: "todo_fixme" });
          }
        });
      },
      crDivZero: function (s) {
        self._eachFile(["javascript","typescript","python"], function (fname, content) {
          if (/\/\s*(0|0\.0)\b/.test(content) || /\/\s*[a-zA-Z_]\w*\s*;/.test(content) && /length/.test(content)) {
            self._add("info", fname, 1, "logic", "Possible division risk",
              "Division may fail or yield Infinity.",
              "Guard denominators.", "division pattern", "Check for zero.", s,
              { confidence: 0.35, status: "POSSIBLE", simpleId: "todo_fixme" });
          }
        });
      },
      crOffByOne: function (s) {
        self._eachFile(["javascript","typescript"], function (fname, content) {
          if (/for\s*\([^;]+;\s*\w+\s*<=\s*\w+\.length/.test(content)) {
            self._add("medium", fname, 1, "logic", "Loop uses <= length",
              "May read one past the last index.",
              "Use < length", "<= length", "Prefer < array.length.", s,
              { confidence: 0.7, status: "LIKELY", simpleId: "todo_fixme" });
          }
        });
      },
      crEmptyCatch: function (s) {
        self._eachFile(["javascript","typescript"], function (fname, content) {
          if (typeof ADStandards !== "undefined" && ADStandards.isVendorFile(fname)) return;
          if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content)) {
            self._add("medium", fname, 1, "logic", "Empty catch block",
              "Errors may be swallowed silently.",
              "Log or handle errors.", "catch {}", "Handle the error.", s,
              { confidence: 0.85, status: "CONFIRMED", simpleId: "todo_fixme" });
          }
        });
      },
      crPromiseCatch: function (s) {
        self._eachFile(["javascript","typescript"], function (fname, content) {
          if (/\.then\s*\(/.test(content) && !/\.catch\s*\(/.test(content) && !/try\s*\{/.test(content)) {
            self._add("medium", fname, 1, "logic", "Promise without catch",
              "Rejected promises may become unhandled.",
              "Add .catch or try/await.", ".then without .catch", "Handle rejections.", s,
              { confidence: 0.55, status: "POSSIBLE", simpleId: "todo_fixme" });
          }
        });
      },
      crListenerLeak: function (s) {
        self._eachFile(["javascript","typescript"], function (fname, content) {
          if (/addEventListener\s*\(/.test(content) && !/removeEventListener\s*\(/.test(content)) {
            self._add("info", fname, 1, "logic", "addEventListener without remove",
              "Long-lived listeners may retain memory.",
              "Remove listeners when done.", "addEventListener only", "Pair with removeEventListener.", s,
              { confidence: 0.45, status: "POSSIBLE", simpleId: "todo_fixme" });
          }
        });
      },
      crDoubleSubmit: function (s) {
        self._eachFile(["html","javascript"], function (fname, content) {
          if (/<form\b/i.test(content) && !/once|disabled|submitting/i.test(content)) {
            self._add("info", fname, 1, "ui", "Form may allow double submit",
              "Users may click submit twice.",
              "Disable button after submit.", "form without guard", "Prevent double submit.", s,
              { confidence: 0.35, status: "POSSIBLE", simpleId: "img_alt" });
          }
        });
      },
      crZIndex: function (s) {
        self._eachFile(["css","html"], function (fname, content) {
          if (/z-index\s*:\s*[1-9]\d{4,}/i.test(content)) {
            self._add("info", fname, 1, "ui", "Extremely high z-index",
              "Can create stacking chaos.",
              "Use moderate scale.", "z-index ≥10000", "Normalize z-index scale.", s,
              { confidence: 0.6, status: "LIKELY", simpleId: "css_empty_rule" });
          }
        });
      },
      crAnimInfinite: function (s) {
        self._eachFile(["css"], function (fname, content) {
          if (/animation[^;]*infinite/i.test(content)) {
            self._add("info", fname, 1, "performance", "Infinite CSS animation",
              "Always-on animation can cost battery/CPU.",
              "Pause when off-screen.", "animation: infinite", "Limit continuous animation.", s,
              { confidence: 0.5, status: "POSSIBLE", simpleId: "css_import" });
          }
        });
      },
      crSyncXhr: function (s) {
        self._eachFile(["javascript","typescript"], function (fname, content) {
          if (/open\s*\([^,]+,[^,]+,\s*false\s*\)/i.test(content)) {
            self._add("high", fname, 1, "performance", "Synchronous XHR",
              "Blocks the UI thread.",
              "Use async requests.", "xhr open(..., false)", "Switch to async.", s,
              { confidence: 0.9, status: "CONFIRMED", simpleId: "many_scripts" });
          }
        });
      },
      crHardUrl: function (s) {
        self._eachFile(null, function (fname, content) {
          if (/https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(content)) {
            self._add("info", fname, 1, "architecture", "Localhost URL in source",
              "May break outside local env.",
              "Configurable base URL.", "localhost URL", "Use env config.", s,
              { confidence: 0.55, status: "POSSIBLE", simpleId: "no_entry" });
          }
        });
      },
      crJsEdge: function (s) { /* mapped variants reuse null/promise patterns */
        if (/EDGE-0/.test(s.id) || /EDGE-1/.test(s.id)) return this.crNullGuard(s);
        if (/EDGE-2/.test(s.id)) return this.crPromiseCatch(s);
        if (/EDGE-3/.test(s.id)) return this.crEmptyCatch(s);
        if (/EDGE-4/.test(s.id)) return this.crListenerLeak(s);
        if (/EDGE-5/.test(s.id)) return this.crOffByOne(s);
      },
      crJsSecEdge: function (s) {
        if (/SEC-0/.test(s.id)) return this.secSourceSink(s);
        if (/SEC-1/.test(s.id)) return this.secLocalStorage(s);
        if (/SEC-2/.test(s.id)) return this.secPostMessage(s);
      },
      crHtmlEdge: function (s) {
        if (/EDGE-0/.test(s.id)) return this.imgAlt(s);
        if (/EDGE-1/.test(s.id)) return this.docTitle(s);
        if (/EDGE-2/.test(s.id)) return this.htmlLang(s);
        if (/EDGE-3/.test(s.id)) return this.secTargetBlank(s);
      },
      crA11yEdge: function (s) {
        if (/EDGE-0/.test(s.id)) return this.imgAlt(s);
        if (/EDGE-1/.test(s.id)) return this.inputLabel(s);
        if (/EDGE-2/.test(s.id)) return this.tabIndex(s);
      },
      crCssEdge: function (s) {
        if (/EDGE-0/.test(s.id)) return this.cssImportant(s);
        if (/EDGE-1/.test(s.id)) return this.cssEmpty(s);
        if (/EDGE-2/.test(s.id)) return this.outlineNone(s);
      },
      crRespEdge: function (s) {
        if (/EDGE-0/.test(s.id)) return this.mediaQueries(s);
        if (/EDGE-1/.test(s.id)) return this.fixedWidth(s);
        if (/EDGE-2/.test(s.id)) return this.viewport(s);
      },
      crPyEdge: function (s) {
        if (/EDGE-0/.test(s.id)) return this.pyIndent(s);
        if (/EDGE-1/.test(s.id)) return this.secPyPickle(s);
      },
      crPhpEdge: function (s) {
        return this.secPhpSql(s);
      },
      crCrossFile: function (s) {
        return this.crossRefs(s);
      },
      cmbGeneric: function (s) {
        // combine entry + todo signals
        this.entryPoint(s);
        this.todoFixme(s);
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
