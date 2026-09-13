/**
 * Auto Debugger V6 Stage-2 Core
 * Test Generation · Mutation · Dependency/API Contract · Regression · Root-Cause Ranking · Orchestrator
 * Browser-only. Static/Simulated — never claims real runtime execution.
 */
(function (global) {
  "use strict";

  var MAX_TESTS_PER_CANDIDATE = 4;
  var MAX_MUTATIONS_PER_FILE = 8;
  var MAX_MUTATIONS_TOTAL = 24;

  // ─── helpers ───
  function uid(prefix) {
    return (prefix || "T") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function fingerprintFinding(f) {
    return [
      f.rule_id || f.simple && f.simple.id || "",
      f.file_name || f.file || "",
      f.line || 0,
      (f.description || f.problem || "").slice(0, 60)
    ].join("|");
  }

  // ═══════════════════════════════════════════
  // AUTOMATIC TEST GENERATION (static scenarios)
  // ═══════════════════════════════════════════
  function generateTestsForCandidate(candidate, codeModel) {
    var tests = [];
    var section = (candidate.section || candidate.type || "").toLowerCase();
    var desc = (candidate.description || "").toLowerCase();
    var simpleId = (candidate.simpleId || candidate.ruleId || "").toLowerCase();
    var file = candidate.file || candidate.file_name || "";
    var line = candidate.line || 1;

    function add(input, expected, reasoning, conf) {
      if (tests.length >= MAX_TESTS_PER_CANDIDATE) return;
      tests.push({
        testId: uid("TG"),
        target: file + ":" + line,
        input: input,
        state: input,
        expectedBehavior: expected,
        targetBug: candidate.description || simpleId,
        reasoning: reasoning,
        confidence: conf || 0.55,
        kind: "STATIC_TEST",
        execution: "SIMULATED", // never claim real run
        section: section
      });
    }

    // Security / XSS / eval
    if (section === "security" || /innerhtml|eval|xss|sink|source/i.test(desc + simpleId)) {
      add({ type: "string", value: "<img src=x onerror=alert(1)>" }, "must not reach DOM sink unsanitized", "malicious HTML payload", 0.7);
      add({ type: "string", value: "" }, "empty input should not crash; sink should stay safe", "empty string boundary", 0.55);
      add({ type: "string", value: "javascript:alert(1)" }, "javascript: URL must not execute via sink", "special protocol", 0.65);
    }

    // Null / undefined paths
    if (/null|undefined|deref|getelementbyid|missing.?dom/i.test(desc + simpleId) || section === "logic") {
      add({ type: "null", value: null }, "guard or safe no-op; no TypeError", "null input", 0.7);
      add({ type: "undefined", value: undefined }, "guard or safe no-op", "undefined input", 0.65);
    }

    // Control flow / unreachable / constant conditions
    if (/control-flow|unreachable|always.?true|always.?false|impossible/i.test(section + desc + simpleId)) {
      add({ type: "branch", value: "constant-true" }, "dead branch should be removed or condition fixed", "constant condition", 0.6);
      add({ type: "branch", value: "after-return" }, "code after return must not execute", "unreachable path", 0.65);
    }

    // Empty catch / error path
    if (/catch|error.?path|empty.?catch/i.test(desc + simpleId)) {
      add({ type: "error", value: "throw new Error('sim')" }, "error must be handled or rethrown", "error path", 0.6);
    }

    // Async / promise
    if (/promise|async|await|fetch/i.test(desc + simpleId)) {
      add({ type: "async", value: "reject" }, "rejection must be handled", "async failure", 0.6);
    }

    // Numeric boundaries (generic)
    if (/off.?by.?one|boundary|length|index/i.test(desc + simpleId)) {
      add({ type: "number", value: 0 }, "zero boundary", "zero", 0.5);
      add({ type: "number", value: -1 }, "negative index/value", "negative", 0.55);
    }

    // Fallback: at least one generic test for any candidate with file
    if (!tests.length && file) {
      add({ type: "unknown", value: "probe" }, "behavior should match expected safe path", "generic probe", 0.4);
    }

    return tests;
  }

  /**
   * Simulated validation: does NOT execute user code.
   * Infers support from evidence types + test reasoning alignment.
   */
  function simulateTestValidation(candidate, tests) {
    var results = [];
    var evidenceTypes = {};
    var rawEv = candidate.evidence_list || candidate.evidence || [];
    if (typeof rawEv === "string") rawEv = [{ type: "static", snippet: rawEv }];
    if (!Array.isArray(rawEv)) rawEv = [];
    rawEv.forEach(function (e) {
      var t = (typeof e === "string" ? "static" : (e.type || "static")).toLowerCase();
      evidenceTypes[t] = (evidenceTypes[t] || 0) + 1;
    });
    var hasFlow = !!(evidenceTypes.dataflow || evidenceTypes["cross-file"]);
    var hasCfg = !!(evidenceTypes.controlflow || evidenceTypes.symbolic);
    var hasAst = !!(evidenceTypes.ast);

    tests.forEach(function (t) {
      var status = "INCONCLUSIVE";
      var support = 0;
      // Strong structural evidence + targeted test → SUPPORTED (not auto CONFIRMED)
      if (hasFlow && /sink|xss|eval|html|payload/i.test(t.reasoning || "")) {
        status = "SUPPORTED";
        support = 0.75;
      } else if (hasCfg && /unreachable|branch|null|error/i.test(t.reasoning || "")) {
        status = "SUPPORTED";
        support = 0.7;
      } else if (hasAst && t.confidence >= 0.6) {
        status = "SUPPORTED";
        support = 0.55;
      } else if ((candidate.confidenceHint || candidate.confidence || 0) >= 0.85 && hasFlow) {
        status = "SUPPORTED";
        support = 0.65;
      } else if (t.confidence < 0.45) {
        status = "INCONCLUSIVE";
        support = 0.3;
      } else {
        status = "INCONCLUSIVE";
        support = 0.4;
      }
      // Single weak test never CONFIRMED
      results.push({
        testId: t.testId,
        status: status, // never CONFIRMED from one simulated test alone
        support: support,
        expectedBehavior: t.expectedBehavior,
        detectedBehavior: "SIMULATED_STATIC_MODEL",
        kind: t.kind,
        execution: "SIMULATED"
      });
    });

    var supported = results.filter(function (r) { return r.status === "SUPPORTED"; }).length;
    var overall = "INCONCLUSIVE";
    if (supported >= 2 && (hasFlow || hasCfg)) overall = "SUPPORTED";
    else if (supported >= 1 && hasFlow && hasCfg) overall = "SUPPORTED";
    else if (!tests.length) overall = "NOT_APPLICABLE";

    return {
      overall: overall, // CONFIRMED only possible after multi-evidence central gate
      results: results,
      supportedCount: supported,
      testCount: tests.length
    };
  }

  // ═══════════════════════════════════════════
  // MUTATION TESTING (virtual, no file overwrite)
  // ═══════════════════════════════════════════
  var MUTATION_OPS = [
    { type: "remove_condition", re: /\bif\s*\(([^)]+)\)/, apply: function (m) { return "if (true /*mut:" + m[1].slice(0, 20) + "*/)"; }, target: "condition" },
    { type: "negate_condition", re: /\bif\s*\(([^)]+)\)/, apply: function (m) { return "if (!(" + m[1] + "))"; }, target: "condition" },
    { type: "change_operator_eq", re: /([!=]=)([^=])/, apply: function (m) { return (m[1] === "==" ? "!=" : "==") + m[2]; }, target: "operator" },
    { type: "change_operator_cmp", re: /([<>]=?)/, apply: function (m) {
      var map = { "<": ">", ">": "<", "<=": ">=", ">=": "<=" };
      return map[m[1]] || m[1];
    }, target: "boundary" },
    { type: "remove_null_check", re: /(\w+)\s*!=\s*null|\b(\w+)\s*!==\s*null/, apply: function () { return "true"; }, target: "null-check" },
    { type: "remove_return", re: /\breturn\s+([^;]+);/, apply: function (m) { return "/* mut-removed-return " + m[1].slice(0, 30) + " */"; }, target: "return" },
    { type: "change_return_zero", re: /\breturn\s+(\d+)\s*;/, apply: function () { return "return 0;"; }, target: "return" },
    { type: "boundary_off_by_one", re: /(\w+)\.length\s*-\s*1/, apply: function (m) { return m[1] + ".length"; }, target: "boundary" }
  ];

  function generateMutations(files, options) {
    options = options || {};
    var maxTotal = options.maxTotal || MAX_MUTATIONS_TOTAL;
    var maxPerFile = options.maxPerFile || MAX_MUTATIONS_PER_FILE;
    var mutations = [];
    var names = Object.keys(files || {});

    names.forEach(function (fname) {
      var ext = (fname.split(".").pop() || "").toLowerCase();
      if (["js", "ts", "jsx", "tsx", "mjs"].indexOf(ext) === -1) return;
      if (mutations.length >= maxTotal) return;
      var content = files[fname] || "";
      var perFile = 0;
      MUTATION_OPS.forEach(function (op) {
        if (perFile >= maxPerFile || mutations.length >= maxTotal) return;
        var re = new RegExp(op.re.source, "g");
        var m;
        var count = 0;
        while ((m = re.exec(content)) && count < 2) {
          if (perFile >= maxPerFile || mutations.length >= maxTotal) break;
          var line = content.slice(0, m.index).split("\n").length;
          var original = m[0];
          var mutated;
          try { mutated = op.apply(m); } catch (e) { continue; }
          if (!mutated || mutated === original) continue;
          mutations.push({
            mutationId: uid("MU"),
            file: fname,
            line: line,
            mutationType: op.type,
            target: op.target,
            original: original.slice(0, 80),
            mutated: String(mutated).slice(0, 80),
            affectedAnalysis: [],
            detectedBy: [],
            status: "PENDING"
          });
          perFile++;
          count++;
        }
      });
    });
    return mutations;
  }

  /**
   * Analyze whether current findings / CFG would "kill" the mutation (static sensitivity).
   * Survived = analyzer may be blind to that change class.
   */
  function evaluateMutations(mutations, problems, cfgIssues, symbolicFindings) {
    return (mutations || []).map(function (mu) {
      var killed = false;
      var by = [];
      // If we have CFG always_true/false near same line → sensitive to condition mutations
      (cfgIssues || []).forEach(function (iss) {
        if (iss.file === mu.file && Math.abs((iss.line || 0) - mu.line) <= 3) {
          if (/condition|operator|null-check/.test(mu.target) && /always_|null_|unreachable|empty_catch/.test(iss.type)) {
            killed = true;
            by.push("cfg:" + iss.type);
          }
        }
      });
      (symbolicFindings || []).forEach(function (sf) {
        if (sf.file === mu.file && Math.abs((sf.line || 0) - mu.line) <= 3) {
          killed = true;
          by.push("symbolic:" + sf.type);
        }
      });
      (problems || []).forEach(function (p) {
        if ((p.file_name || p.file) === mu.file && Math.abs((p.line || 0) - mu.line) <= 5) {
          if (/control-flow|logic|null/i.test(p.section || p.description || "")) {
            killed = true;
            by.push("finding:" + (p.rule_id || p.simple && p.simple.id || "x"));
          }
        }
      });
      // Condition removal mutations: if no nearby control finding → SURVIVED (blind spot signal)
      mu.status = killed ? "KILLED" : "SURVIVED";
      mu.detectedBy = by;
      mu.affectedAnalysis = by.slice();
      mu.blindSpot = !killed && /condition|null-check|return|boundary/.test(mu.target);
      return mu;
    });
  }

  // ═══════════════════════════════════════════
  // DEPENDENCY + API CONTRACT (from Module Graph)
  // ═══════════════════════════════════════════
  function analyzeDependencies(moduleGraph, files, astMap) {
    var findings = [];
    if (!moduleGraph) return findings;
    var modules = moduleGraph.modules || {};
    var edges = moduleGraph.edges || [];
    var names = Object.keys(modules);

    // unresolved imports
    names.forEach(function (n) {
      (modules[n].imports || []).forEach(function (imp) {
        if (imp.spec && !imp.resolved && !/^https?:|^\//.test(imp.spec) && imp.spec.charAt(0) === ".") {
          findings.push({
            kind: "unresolved_import",
            file: n,
            line: imp.line || 1,
            detail: "Unresolved relative import: " + imp.spec,
            severity: "medium",
            confidence: 0.75
          });
        }
      });
    });

    // unused exports (exported but never imported by symbol edge)
    var importedSyms = {};
    (moduleGraph.symbolEdges || []).forEach(function (se) {
      importedSyms[se.from + "::" + se.symbol] = true;
    });
    names.forEach(function (n) {
      (moduleGraph.exportedSymbols[n] || []).forEach(function (sym) {
        if (!importedSyms[n + "::" + sym] && names.length > 1) {
          // only hint if project has multiple modules
          findings.push({
            kind: "unused_export",
            file: n,
            line: 1,
            detail: "Exported symbol may be unused: " + sym,
            severity: "low",
            confidence: 0.45,
            classificationHint: "CODE_SMELL"
          });
        }
      });
    });

    // circular dependency (simple DFS)
    var adj = {};
    edges.forEach(function (e) {
      adj[e.from] = adj[e.from] || [];
      adj[e.from].push(e.to);
    });
    var visited = {};
    var stack = {};
    function dfs(node, path) {
      if (stack[node]) {
        findings.push({
          kind: "circular_dependency",
          file: node,
          line: 1,
          detail: "Circular dependency involving: " + path.concat([node]).join(" → "),
          severity: "medium",
          confidence: 0.8
        });
        return;
      }
      if (visited[node]) return;
      visited[node] = true;
      stack[node] = true;
      (adj[node] || []).forEach(function (n) { dfs(n, path.concat([node])); });
      stack[node] = false;
    }
    names.forEach(function (n) { dfs(n, []); });

    // symbol mismatch: import name not in exporter exports
    (moduleGraph.symbolEdges || []).forEach(function (se) {
      var exports = moduleGraph.exportedSymbols[se.from] || [];
      if (exports.length && exports.indexOf(se.symbol) === -1 && se.symbol !== "default") {
        findings.push({
          kind: "symbol_mismatch",
          file: se.to,
          line: 1,
          detail: "Imported symbol '" + se.symbol + "' not found in exports of " + se.from,
          severity: "high",
          confidence: 0.7
        });
      }
    });

    return findings;
  }

  function analyzeApiContracts(astMap, files) {
    var findings = [];
    // Lightweight: function arity mismatch call vs definition (same file)
    Object.keys(astMap || {}).forEach(function (fname) {
      var a = astMap[fname];
      if (!a) return;
      var fnArity = {};
      // approximate from content
      var content = files[fname] || "";
      var fnRe = /function\s+(\w+)\s*\(([^)]*)\)|(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;
      var m;
      while ((m = fnRe.exec(content))) {
        var name = m[1] || m[3];
        var params = (m[2] || m[4] || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        if (name) fnArity[name] = params.length;
      }
      // calls with too many/few args — very rough
      var callRe = /\b(\w+)\s*\(([^)]*)\)/g;
      while ((m = callRe.exec(content))) {
        var cn = m[1];
        if (!fnArity.hasOwnProperty(cn)) continue;
        if (/^(if|for|while|switch|catch|function|return)$/.test(cn)) continue;
        var args = (m[2] || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        // only flag if clearly more args than params by 2+ (avoid FP)
        if (args.length >= fnArity[cn] + 2 && fnArity[cn] <= 2) {
          findings.push({
            kind: "arity_mismatch",
            file: fname,
            line: content.slice(0, m.index).split("\n").length,
            detail: "Call " + cn + "(" + args.length + " args) vs defined " + fnArity[cn] + " params",
            severity: "low",
            confidence: 0.4,
            classificationHint: "POSSIBLE_ISSUE"
          });
        }
      }
    });
    return findings;
  }

  // ═══════════════════════════════════════════
  // REGRESSION LEARNING (baseline comparison)
  // ═══════════════════════════════════════════
  // In-memory + optional ResultsStore baselines (version-aware)
  var memoryBaselines = {}; // projectKey → { version, findings: [], ts }

  function saveBaseline(projectKey, findings, version) {
    var fpList = (findings || []).map(function (f) {
      return {
        fp: fingerprintFinding(f),
        rule_id: f.rule_id || "",
        file: f.file_name || "",
        line: f.line || 0,
        description: (f.description || "").slice(0, 100),
        classification: f.classification || "",
        confidence: f.confidence || 0,
        status: f.status || ""
      };
    });
    memoryBaselines[projectKey] = {
      version: version || "V6-Stage2",
      findings: fpList,
      ts: Date.now()
    };
    // Persist via ResultsStore meta if available (browser)
    if (global.ADResultsStore && typeof global.ADResultsStore.saveBaseline === "function") {
      try { global.ADResultsStore.saveBaseline(projectKey, memoryBaselines[projectKey]); } catch (e) {}
    }
    return memoryBaselines[projectKey];
  }

  function loadBaseline(projectKey) {
    if (memoryBaselines[projectKey]) return memoryBaselines[projectKey];
    return null;
  }

  function compareRegression(projectKey, currentFindings) {
    var baseline = loadBaseline(projectKey);
    var report = {
      hasBaseline: !!baseline,
      unchanged: [],
      fixed: [],
      reintroduced: [],
      changed: [],
      newFindings: [],
      knownFP: []
    };
    if (!baseline) {
      report.newFindings = (currentFindings || []).map(fingerprintFinding);
      return report;
    }
    var baseMap = {};
    (baseline.findings || []).forEach(function (b) { baseMap[b.fp] = b; });
    var curMap = {};
    (currentFindings || []).forEach(function (f) {
      var fp = fingerprintFinding(f);
      curMap[fp] = f;
      if (baseMap[fp]) {
        var prev = baseMap[fp];
        if ((f.classification || "") !== (prev.classification || "") ||
            Math.abs((f.confidence || 0) - (prev.confidence || 0)) > 0.15) {
          report.changed.push({ fp: fp, from: prev, to: { classification: f.classification, confidence: f.confidence } });
        } else {
          report.unchanged.push(fp);
        }
      } else {
        report.newFindings.push(fp);
      }
    });
    Object.keys(baseMap).forEach(function (fp) {
      if (!curMap[fp]) report.fixed.push(fp);
    });
    return report;
  }

  // ═══════════════════════════════════════════
  // ROOT-CAUSE RANKING
  // ═══════════════════════════════════════════
  function rankRootCauses(finding, context) {
    context = context || {};
    var candidates = [];
    var evidenceList = finding.evidence_list || [];
    var hasFlow = evidenceList.some(function (e) { return (e.type || "") === "dataflow" || (e.type || "") === "cross-file"; });
    var hasCfg = evidenceList.some(function (e) { return (e.type || "") === "controlflow" || (e.type || "") === "symbolic"; });
    var hasAst = evidenceList.some(function (e) { return (e.type || "") === "ast"; });
    var validation = finding.validation || [];
    var valPass = validation.some(function (v) { return v.pass; });

    function add(label, score, layer, evidenceNote) {
      candidates.push({
        label: label,
        score: Math.max(0, Math.min(100, score)),
        layer: layer, // symptom | immediate | contributing | root
        evidenceNote: evidenceNote,
        status: score >= 75 ? "LIKELY" : score >= 50 ? "POSSIBLE" : "INCONCLUSIVE"
      });
    }

    var symptom = finding.symptom || finding.description || "Observed issue";
    add(symptom, 30, "symptom", "user-visible symptom");

    var immediate = finding.detected_behavior || finding.detected || finding.description || "";
    add(immediate.slice(0, 120) || "Immediate manifestation", 45 + (hasAst ? 10 : 0), "immediate", "detected pattern");

    if (hasFlow) {
      add(
        finding.root_cause || finding.rootCause || "Untrusted data reaches dangerous sink without sanitization",
        70 + (valPass ? 10 : 0),
        "root",
        "data-flow evidence"
      );
    }
    if (hasCfg) {
      add(
        "Control-flow structure allows unsafe or dead path",
        60 + (hasCfg ? 10 : 0),
        "contributing",
        "CFG/symbolic evidence"
      );
    }
    if (finding.root_cause || finding.rootCause) {
      var rc = finding.root_cause || finding.rootCause;
      // Don't use recommendation as root
      if (rc !== finding.recommendation && rc !== finding.recommended_correction_area) {
        add(rc, 55 + (hasFlow ? 20 : 0) + (hasCfg ? 10 : 0) + (valPass ? 10 : 0), "root", "stated root cause");
      }
    }
    if (context.testValidation && context.testValidation.overall === "SUPPORTED") {
      add("Behavior supported by static test scenarios", 50, "contributing", "test generation");
    }
    if (context.dependencyRelated) {
      add("Module boundary / dependency carries risk", 55, "contributing", "dependency graph");
    }

    candidates.sort(function (a, b) { return b.score - a.score; });
    var top = candidates[0] || null;
    // Never force CONFIRMED from ranking alone
    return {
      ranked: candidates.slice(0, 5),
      top: top,
      selectedRootCause: top && top.score >= 60 ? top.label : (finding.root_cause || finding.rootCause || ""),
      status: top && top.score >= 75 && (hasFlow || hasCfg) ? "LIKELY" : "INCONCLUSIVE"
    };
  }

  // ═══════════════════════════════════════════
  // ORCHESTRATOR
  // ═══════════════════════════════════════════
  function assessComplexity(candidate) {
    var score = 0;
    var section = (candidate.section || "").toLowerCase();
    var desc = (candidate.description || "").toLowerCase();
    if (section === "security") score += 3;
    if (/cross|flow|source|sink|eval|xss/i.test(desc)) score += 2;
    if (/null|async|promise|race/i.test(desc)) score += 1;
    if ((candidate.evidence_list || candidate.evidence || []).length >= 2) score += 1;
    if ((candidate.confidenceHint || candidate.confidence || 0) < 0.6) score += 1;
    return score; // 0 simple … 8+ complex
  }

  function orchestrateCandidate(candidate, ctx) {
    ctx = ctx || {};
    var complexity = assessComplexity(candidate);
    var plan = {
      testGeneration: false,
      mutation: false,
      dependency: false,
      apiContract: false,
      regression: false,
      rootCauseRanking: true // always light ranking
    };
    // Simple: minimal
    if (complexity <= 2) {
      plan.testGeneration = /security|null|logic|control/.test((candidate.section || "").toLowerCase());
    } else if (complexity <= 4) {
      plan.testGeneration = true;
      plan.dependency = !!(ctx.moduleGraph && (ctx.moduleGraph.edges || []).length);
    } else {
      plan.testGeneration = true;
      plan.mutation = true;
      plan.dependency = true;
      plan.apiContract = true;
      plan.regression = true;
    }
    // Security always gets tests
    if ((candidate.section || "").toLowerCase() === "security") plan.testGeneration = true;

    var out = {
      plan: plan,
      complexity: complexity,
      tests: [],
      testValidation: null,
      rootCause: null
    };

    if (plan.testGeneration) {
      out.tests = generateTestsForCandidate(candidate, ctx.codeModel);
      out.testValidation = simulateTestValidation(candidate, out.tests);
    }
    if (plan.rootCauseRanking) {
      out.rootCause = rankRootCauses(candidate, {
        testValidation: out.testValidation,
        dependencyRelated: plan.dependency
      });
    }
    return out;
  }

  /**
   * Run Stage-2 enrichment over engine problems (post Stage-1).
   * Mutates findings with tests / validation / rootCause ranking metadata.
   * Also returns dependency/api/mutation/regression reports.
   */
  function runStage2(engineResult, files, options) {
    options = options || {};
    var problems = (engineResult && engineResult.problems) || [];
    var codeModel = options.codeModel || null;
    var moduleGraph = options.moduleGraph || (codeModel && codeModel.moduleGraph) || null;
    var astMap = options.astMap || null;
    var cfgIssues = options.cfgIssues || [];
    var symbolicFindings = options.symbolicFindings || [];
    var projectKey = options.projectKey || "default";

    var enrichment = [];
    var allTests = [];

    // Orchestrate per finding (cap for performance)
    var limit = Math.min(problems.length, options.maxCandidates || 40);
    for (var i = 0; i < limit; i++) {
      var p = problems[i];
      var cand = {
        section: p.section,
        description: p.description,
        simpleId: p.simple && p.simple.id,
        ruleId: p.rule_id,
        file: p.file_name,
        file_name: p.file_name,
        line: p.line,
        evidence_list: p.evidence_list || [],
        evidence: p.evidence,
        confidence: p.confidence,
        confidenceHint: p.confidence,
        validation: p.validation,
        root_cause: p.root_cause,
        rootCause: p.root_cause,
        symptom: p.symptom,
        recommendation: p.recommended_correction_area,
        detected_behavior: p.detected_behavior
      };
      var orch = orchestrateCandidate(cand, { codeModel: codeModel, moduleGraph: moduleGraph });
      allTests = allTests.concat(orch.tests);

      // Attach to finding (non-breaking)
      p.generated_tests = orch.tests;
      p.test_validation = orch.testValidation;
      p.root_cause_ranking = orch.rootCause;
      if (orch.rootCause && orch.rootCause.selectedRootCause) {
        // Prefer ranked root when stronger than recommendation fallback
        if (!p.root_cause || p.root_cause === p.recommended_correction_area) {
          p.root_cause = orch.rootCause.selectedRootCause;
        }
      }
      // Multi-evidence: boost confidence slightly only if SUPPORTED tests + existing flow/cfg
      if (orch.testValidation && orch.testValidation.overall === "SUPPORTED" && (p.confidence || 0) < 0.95) {
        var ev = p.evidence_list || [];
        var strong = ev.some(function (e) {
          var t = (e.type || "").toLowerCase();
          return t === "dataflow" || t === "controlflow" || t === "symbolic" || t === "cross-file";
        });
        if (strong) {
          p.confidence = Math.min(0.98, (p.confidence || 0.5) + 0.05);
          p.confidence_score = Math.round(p.confidence * 100);
        }
      }
      enrichment.push({ problem_id: p.problem_id, plan: orch.plan, complexity: orch.complexity });
    }

    // Dependency + API (once)
    var depFindings = analyzeDependencies(moduleGraph, files, astMap);
    var apiFindings = analyzeApiContracts(astMap, files);

    // Mutations (once, limited)
    var mutations = generateMutations(files, { maxTotal: MAX_MUTATIONS_TOTAL });
    mutations = evaluateMutations(mutations, problems, cfgIssues, symbolicFindings);
    var killed = mutations.filter(function (m) { return m.status === "KILLED"; }).length;
    var survived = mutations.filter(function (m) { return m.status === "SURVIVED"; }).length;

    // Regression
    var regression = compareRegression(projectKey, problems);
    // Update baseline after comparison
    saveBaseline(projectKey, problems, options.version || "V6-Stage2");

    return {
      enrichment: enrichment,
      generatedTests: allTests,
      dependencyFindings: depFindings,
      apiFindings: apiFindings,
      mutations: {
        total: mutations.length,
        killed: killed,
        survived: survived,
        items: mutations,
        killRatio: mutations.length ? killed / mutations.length : 0
      },
      regression: regression,
      version: "V6-Stage2"
    };
  }

  global.ADStage2 = {
    generateTestsForCandidate: generateTestsForCandidate,
    simulateTestValidation: simulateTestValidation,
    generateMutations: generateMutations,
    evaluateMutations: evaluateMutations,
    analyzeDependencies: analyzeDependencies,
    analyzeApiContracts: analyzeApiContracts,
    saveBaseline: saveBaseline,
    loadBaseline: loadBaseline,
    compareRegression: compareRegression,
    rankRootCauses: rankRootCauses,
    orchestrateCandidate: orchestrateCandidate,
    runStage2: runStage2,
    // test helpers
    _memoryBaselines: memoryBaselines,
    fingerprintFinding: fingerprintFinding
  };
})(typeof window !== "undefined" ? window : globalThis);
