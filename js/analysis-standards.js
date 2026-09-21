/**
 * Auto Debugger V6.0 — Analysis Standards
 * Evidence-driven pipeline: Candidate → Context → Evidence → Validation → Flow → RootCause → Confidence → FP Filter → Finding
 * Browser-only. No server.
 */
(function (global) {
  "use strict";

  /** Configurable scoring weights (not hard-coded truth of bugs — only of confidence). */
  var CONFIDENCE_WEIGHTS = {
    base: 40,
    strongEvidence: 30,
    astConfirmation: 20,
    dataFlowConfirmation: 20,
    crossFileConfirmation: 15,
    validationPass: 15,
    contradictoryEvidence: -25,
    missingContext: -30,
    heuristicOnly: -20,
    toolOrVendorFile: -40,
    stringOrCommentOnly: -50,
    weakSnippet: -15
  };

  var CONFIDENCE_THRESHOLDS = {
    confirmed: 90,
    high: 75,
    possible: 50
    // below possible → DO_NOT_REPORT
  };

  function isVendorFile(fname) {
    return /\.min\.js$/i.test(fname) || /(?:^|\/)jszip/i.test(fname) || /node_modules\//i.test(fname);
  }
  function isFixtureFile(fname) {
    return /(?:^|\/)(?:__tests__|fixtures?|mocks?|testdata)\//i.test(fname)
      || /\.test\.(js|ts|jsx|tsx)$/i.test(fname)
      || /\.spec\.(js|ts)$/i.test(fname);
  }

  function isToolSourceFile(fname) {
    var base = String(fname || "").split("/").pop() || "";
    return /^(?:debug-engine|strategies|ast|final-prompt|project-mapper|results-store|knowledge-db|analysis-worker|analysis-standards)(?:\.js)?$/i.test(base)
      || /\/engines\//i.test(fname)
      || /\/worker\//i.test(fname);
  }

  function isValidDomId(id) {
    return !!(id && /^[A-Za-z][\w-]*$/.test(id));
  }

  function stripNoise(content) {
    return String(content || "")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ")
      .replace(/\/(?:\\.|[^\\/\n])+\/[gimsuy]*/g, " ")
      .replace(/'(?:\\.|[^\\'])*'/g, "''")
      .replace(/"(?:\\.|[^\\"])*"/g, '""')
      .replace(/`(?:\\.|[^\\`])*`/g, "``");
  }

  function countDelimiters(content) {
    var src = String(content || "");
    var o = { paren: 0, bracket: 0, brace: 0 };
    var c = { paren: 0, bracket: 0, brace: 0 };
    var i = 0, n = src.length, mode = "code";
    while (i < n) {
      var ch = src.charAt(i), next = src.charAt(i + 1);
      if (mode === "code") {
        if (ch === "'") { mode = "squote"; i++; continue; }
        if (ch === '"') { mode = "dquote"; i++; continue; }
        if (ch === "`") { mode = "template"; i++; continue; }
        if (ch === "/" && next === "/") { mode = "linecomment"; i += 2; continue; }
        if (ch === "/" && next === "*") { mode = "blockcomment"; i += 2; continue; }
        if (ch === "/" && /[=(:,\[!&|?;{\n]\s*$/.test(src.slice(Math.max(0, i - 14), i))) {
          mode = "regex"; i++; continue;
        }
        if (ch === "(") o.paren++;
        else if (ch === ")") c.paren++;
        else if (ch === "[") o.bracket++;
        else if (ch === "]") c.bracket++;
        else if (ch === "{") o.brace++;
        else if (ch === "}") c.brace++;
        i++; continue;
      }
      if (mode === "squote") { if (ch === "\\") { i += 2; continue; } if (ch === "'") mode = "code"; i++; continue; }
      if (mode === "dquote") { if (ch === "\\") { i += 2; continue; } if (ch === '"') mode = "code"; i++; continue; }
      if (mode === "template") { if (ch === "\\") { i += 2; continue; } if (ch === "`") mode = "code"; i++; continue; }
      if (mode === "linecomment") { if (ch === "\n") mode = "code"; i++; continue; }
      if (mode === "blockcomment") { if (ch === "*" && next === "/") { mode = "code"; i += 2; continue; } i++; continue; }
      if (mode === "regex") {
        if (ch === "\\") { i += 2; continue; }
        if (ch === "/") { mode = "code"; i++; while (/[gimsuy]/.test(src.charAt(i))) i++; continue; }
        i++; continue;
      }
      i++;
    }
    return {
      open: o.paren + o.bracket + o.brace,
      close: c.paren + c.bracket + c.brace,
      paren: o.paren - c.paren,
      bracket: o.bracket - c.bracket,
      brace: o.brace - c.brace,
      balanced: o.paren === c.paren && o.bracket === c.bracket && o.brace === c.brace
    };
  }

  function shouldSkipSecurityKeywordScan(fname) {
    return isToolSourceFile(fname) || isVendorFile(fname);
  }

  function normalizeEvidenceList(ev) {
    if (!ev) return [];
    if (Array.isArray(ev)) {
      return ev.map(function (e) {
        if (typeof e === "string") {
          return { file: "", line: 0, endLine: 0, type: "static", snippet: e, explanation: e };
        }
        return {
          file: e.file || "",
          line: e.line || 0,
          endLine: e.endLine || e.line || 0,
          type: e.type || "static",
          snippet: e.snippet || e.detected || e.text || "",
          explanation: e.explanation || e.snippet || ""
        };
      });
    }
    if (typeof ev === "string") {
      return [{ file: "", line: 0, endLine: 0, type: "static", snippet: ev, explanation: ev }];
    }
    return [ev];
  }

  /**
   * Build candidate from legacy _add-style arguments or explicit object.
   */
  function createCandidate(opts) {
    opts = opts || {};
    var evidence = normalizeEvidenceList(opts.evidence);
    if (!evidence.length && opts.detected) {
      evidence = normalizeEvidenceList(opts.detected);
    }
    return {
      ruleId: opts.ruleId || opts.simpleId || "",
      strategyId: opts.strategyId || (opts.strategy && opts.strategy.id) || opts.ruleId || "",
      category: opts.category || "",
      section: opts.section || "",
      file: opts.file || "",
      line: opts.line || 1,
      endLine: opts.endLine || opts.line || 1,
      type: opts.type || opts.section || "generic",
      severityHint: opts.severity || "medium",
      description: opts.description || "",
      why: opts.why || "",
      expected: opts.expected || "",
      detected: opts.detected || "",
      recommendation: opts.recommendation || "",
      symptom: opts.symptom || opts.description || "",
      rootCause: opts.rootCause || opts.recommendation || "",
      impact: opts.impact || opts.severity || "",
      evidence: evidence,
      context: opts.context || {},
      metadata: opts.metadata || {},
      flags: opts.flags || {},
      simpleId: opts.simpleId || "",
      statusHint: opts.status || null,
      confidenceHint: opts.confidence != null ? opts.confidence : null
    };
  }

  function createCandidateFromAdd(severity, file, line, section, description, why, expected, detected, recommendation, strategy, extras, engineCtx) {
    extras = extras || {};
    var cat = (strategy && strategy.category) || "";
    return createCandidate({
      severity: severity,
      file: file,
      line: line,
      section: section,
      description: description,
      why: why,
      expected: expected,
      detected: detected,
      recommendation: recommendation,
      strategy: strategy,
      ruleId: (strategy && strategy.id) || extras.ruleId || "",
      simpleId: extras.simpleId || "",
      category: cat,
      evidence: extras.evidence || detected,
      rootCause: extras.root_cause || recommendation,
      symptom: extras.symptom || description,
      impact: extras.impact || severity,
      confidence: extras.confidence,
      status: extras.status,
      context: engineCtx || {},
      flags: {
        heuristicOnly: extras.heuristicOnly === true || (!extras.evidence && !!detected),
        requiresHtml: extras.requiresHtml === true,
        requiresJs: extras.requiresJs === true,
        securityKeyword: section === "security" || /sec_/i.test(extras.simpleId || ""),
        structureBalance: /unbalanced/i.test(description || "") || section === "structure"
      },
      metadata: { legacyAdd: true }
    });
  }

  function hasStrongEvidence(evidence) {
    for (var i = 0; i < evidence.length; i++) {
      var t = (evidence[i].type || "").toLowerCase();
      if (t === "ast" || t === "dataflow" || t === "validation" || t === "cross-file") return true;
      if ((evidence[i].snippet || "").length > 8) return true;
    }
    return evidence.length > 0;
  }

  /**
   * Context + false-positive oriented validation gate.
   */
  function validateCandidate(candidate, projectCtx) {
    projectCtx = projectCtx || candidate.context || {};
    var has = projectCtx.has || {};
    var validations = [];
    var ok = true;
    var contradictions = [];
    var scoreMods = [];

    var file = candidate.file || "";

    if (isVendorFile(file)) {
      validations.push({ type: "context", pass: false, detail: "Vendor/minified file skipped" });
      return { pass: false, doNotReport: true, notApplicable: false, validations: validations, contradictions: contradictions, scoreMods: scoreMods };
    }
    if (isFixtureFile(file) && candidate.flags && candidate.flags.securityKeyword) {
      validations.push({ type: "context", pass: false, detail: "Security pattern in test/fixture file" });
      scoreMods.push("heuristicOnly");
      // do not fully suppress all fixture issues, but cap confidence path
    }

    // Security keyword rules on tool sources are FP
    if (candidate.flags && candidate.flags.securityKeyword && isToolSourceFile(file)) {
      validations.push({ type: "context", pass: false, detail: "Security pattern on tool/rule definition file" });
      return { pass: false, doNotReport: true, notApplicable: false, validations: validations, contradictions: contradictions, scoreMods: scoreMods };
    }

    if (candidate.flags && candidate.flags.requiresHtml && !has.html) {
      validations.push({ type: "context", pass: false, detail: "Requires HTML context" });
      return { pass: false, doNotReport: false, notApplicable: true, validations: validations, contradictions: contradictions, scoreMods: scoreMods };
    }

    // Viewport-like rules without HTML
    if (/viewport/i.test(candidate.description || "") && !has.html) {
      validations.push({ type: "context", pass: false, detail: "Viewport rule without HTML" });
      return { pass: false, doNotReport: false, notApplicable: true, validations: validations, contradictions: contradictions, scoreMods: scoreMods };
    }

    if (!candidate.evidence || !candidate.evidence.length) {
      validations.push({ type: "evidence", pass: false, detail: "No structured evidence" });
      ok = false;
      scoreMods.push("missingEvidence");
    } else {
      validations.push({ type: "evidence", pass: true, detail: "Evidence present (" + candidate.evidence.length + ")" });
      if (hasStrongEvidence(candidate.evidence)) {
        scoreMods.push("strongEvidence");
        validations.push({ type: "evidence", pass: true, detail: "Strong evidence signal" });
      } else {
        scoreMods.push("weakSnippet");
      }
    }

    // Heuristic-only penalty
    if (candidate.flags && candidate.flags.heuristicOnly) {
      scoreMods.push("heuristicOnly");
      validations.push({ type: "validation", pass: true, detail: "Heuristic detection — confidence capped" });
    }

    // Structure balance on tool files: often FP from regex classes
    if (candidate.flags && candidate.flags.structureBalance && isToolSourceFile(file)) {
      contradictions.push("Delimiter balance on analysis tool source is unreliable");
      scoreMods.push("contradictoryEvidence");
      scoreMods.push("toolOrVendorFile");
      validations.push({ type: "validation", pass: false, detail: "Structure check on tool file unreliable" });
      ok = false;
    }

    // Missing project context
    if (!projectCtx.fileCount && !projectCtx.has) {
      scoreMods.push("missingContext");
    }

    if (ok) {
      validations.push({ type: "validation", pass: true, detail: "Minimum gate passed" });
      scoreMods.push("validationPass");
    }

    return {
      pass: ok,
      doNotReport: false,
      notApplicable: false,
      validations: validations,
      contradictions: contradictions,
      scoreMods: scoreMods
    };
  }

  function scoreConfidence(candidate, validationResult) {
    var w = CONFIDENCE_WEIGHTS;
    var score = w.base;
    var mods = (validationResult && validationResult.scoreMods) || [];

    for (var i = 0; i < mods.length; i++) {
      var m = mods[i];
      if (m === "strongEvidence") score += w.strongEvidence;
      else if (m === "validationPass") score += w.validationPass;
      else if (m === "heuristicOnly") score += w.heuristicOnly;
      else if (m === "missingEvidence" || m === "missingContext") score += w.missingContext;
      else if (m === "contradictoryEvidence") score += w.contradictoryEvidence;
      else if (m === "toolOrVendorFile") score += w.toolOrVendorFile;
      else if (m === "weakSnippet") score += w.weakSnippet;
      else if (m === "astConfirmation") score += w.astConfirmation;
      else if (m === "dataFlowConfirmation") score += w.dataFlowConfirmation;
      else if (m === "crossFileConfirmation") score += w.crossFileConfirmation;
    }

    // Evidence type bonuses
    var ev = candidate.evidence || [];
    for (var j = 0; j < ev.length; j++) {
      var t = (ev[j].type || "").toLowerCase();
      if (t === "ast") score += 8;
      if (t === "dataflow") score += 10;
      if (t === "cross-file") score += 8;
      if (t === "validation") score += 6;
    }

    // Optional legacy hint (soft, not authoritative)
    if (candidate.confidenceHint != null && typeof candidate.confidenceHint === "number") {
      score = Math.round(score * 0.7 + candidate.confidenceHint * 100 * 0.3);
    }

    if (score < 0) score = 0;
    if (score > 100) score = 100;
    return score;
  }

  function classifyFinding(candidate, confidenceScore, validationResult) {
    if (validationResult && validationResult.notApplicable) return "NOT_APPLICABLE";
    if (validationResult && validationResult.doNotReport) return "DO_NOT_REPORT";

    var section = (candidate.section || "").toLowerCase();
    var cat = (candidate.category || "").toLowerCase();
    var desc = (candidate.description || "").toLowerCase();

    if (confidenceScore < CONFIDENCE_THRESHOLDS.possible) return "DO_NOT_REPORT";

    if (section === "security" || cat.indexOf("security") !== -1) {
      // SECURITY_ISSUE only with strong score AND non-heuristic evidence
      var hasStrongEv = false;
      var ev = candidate.evidence || [];
      for (var i = 0; i < ev.length; i++) {
        var t = ((ev[i] && ev[i].type) || "").toLowerCase();
        if (t === "dataflow" || t === "validation" || t === "ast") { hasStrongEv = true; break; }
      }
      var heuristic = candidate.flags && candidate.flags.heuristicOnly;
      if (confidenceScore >= CONFIDENCE_THRESHOLDS.high && hasStrongEv && !heuristic) return "SECURITY_ISSUE";
      if (confidenceScore >= 90 && hasStrongEv) return "SECURITY_ISSUE";
      return "POSSIBLE_ISSUE";
    }

    if (section === "performance" || cat.indexOf("performance") !== -1) {
      return confidenceScore >= CONFIDENCE_THRESHOLDS.high ? "PERFORMANCE_ISSUE" : "POSSIBLE_ISSUE";
    }

    // Code smells
    if (/!important|empty css|todo|fixme|console\.log|duplicate basename|px font|many script/i.test(desc)) {
      return "CODE_SMELL";
    }

    if (candidate.flags && candidate.flags.heuristicOnly && confidenceScore < 90) {
      return "POSSIBLE_ISSUE";
    }
    if (confidenceScore >= CONFIDENCE_THRESHOLDS.confirmed) return "CONFIRMED_BUG";
    // high band without confirmed threshold: LIKELY-class possible, not auto CONFIRMED
    if (confidenceScore >= CONFIDENCE_THRESHOLDS.high) return "POSSIBLE_ISSUE";
    return "POSSIBLE_ISSUE";
  }

  function statusFromConfidence(score, classification) {
    if (classification === "NOT_APPLICABLE") return "NOT_APPLICABLE";
    if (classification === "CODE_SMELL") return score >= 75 ? "LIKELY" : "POSSIBLE";
    if (score >= CONFIDENCE_THRESHOLDS.confirmed) return "CONFIRMED";
    if (score >= CONFIDENCE_THRESHOLDS.high) return "LIKELY";
    if (score >= CONFIDENCE_THRESHOLDS.possible) return "POSSIBLE";
    return "DO_NOT_REPORT";
  }

  /**
   * Central gate: Candidate → Finding | null
   * KEYWORD ≠ BUG. Candidate ≠ Finding.
   */
  function finalizeFinding(candidate, projectCtx) {
    if (!candidate) return null;
    var validation = validateCandidate(candidate, projectCtx || candidate.context);
    if (validation.doNotReport) return null;
    if (validation.notApplicable) {
      // Optionally surface NOT_APPLICABLE; for UI noise we skip unless requested
      return null;
    }

    var score = scoreConfidence(candidate, validation);
    var classification = classifyFinding(candidate, score, validation);
    if (classification === "DO_NOT_REPORT") return null;

    var status = statusFromConfidence(score, classification);
    if (status === "DO_NOT_REPORT") return null;

    // Severity stays independent of confidence (from candidate hint)
    var severity = candidate.severityHint || "medium";
    if (classification === "CODE_SMELL" && (severity === "critical" || severity === "high")) {
      severity = "low";
    }
    if (classification === "POSSIBLE_ISSUE" && severity === "critical" && score < 80) {
      severity = "high";
    }

    var evidence = candidate.evidence || [];
    var evidenceSummary = evidence.map(function (e) {
      return (e.explanation || e.snippet || "").toString();
    }).filter(Boolean).join(" | ") || candidate.detected || "";

    // Conversational explanation (evidence-bound, no invented facts)
    if (typeof ADExplain !== "undefined" && ADExplain.enrichFinding) {
      try { ADExplain.enrichFinding(candidate); } catch (eExp) {}
    }

    // V6: Root-cause separation (symptom ≠ root)
    var symptom = candidate.symptom || candidate.description || "";
    var rootCause = candidate.rootCause || candidate.why || candidate.recommendation || "";
    if (rootCause === candidate.recommendation) {
      // Prefer why / detected as root when recommendation was used as fallback
      rootCause = candidate.why || candidate.detected || rootCause;
    }

    // Lightweight hypothesis for complex / low-evidence cases
    var hypotheses = [];
    if (score < 75 || (candidate.flags && candidate.flags.heuristicOnly)) {
      hypotheses.push({
        description: "Primary interpretation: " + (candidate.description || "issue"),
        supportingEvidence: evidence.slice(0, 3),
        contradictingEvidence: validation.contradictions || [],
        confidence: score / 100,
        validationMethod: "static-context",
        status: status
      });
    }

    var flow = candidate.metadata && candidate.metadata.flow ? candidate.metadata.flow : [];
    if (!flow.length && evidence.some(function (e) { return (e.type || "") === "dataflow"; })) {
      flow = evidence.filter(function (e) { return (e.type || "") === "dataflow"; });
    }

    return {
      // Compatible with existing Results Store / UI
      severity: severity,
      status: status,
      category: candidate.category || "",
      file_name: candidate.file,
      line: candidate.line || 1,
      endLine: candidate.endLine || candidate.line || 1,
      section: candidate.section || "",
      description: candidate.description,
      problem: candidate.description,
      why_problematic: candidate.why,
      expected_behavior: candidate.expected,
      detected_behavior: candidate.detected,
      recommended_correction_area: candidate.recommendation,
      recommendation: candidate.recommendation,
      test_detected: candidate.strategyId || candidate.ruleId || "strategy",
      root_cause: rootCause,
      rootCause: rootCause,
      symptom: symptom,
      conversational: candidate.conversational || "",
      simple_title: candidate.simple_title || symptom || "",
      evidence: evidenceSummary,
      evidence_list: evidence,
      validation: validation.validations || [],
      flow: flow,
      hypotheses: hypotheses,
      impact: candidate.impact || severity,
      confidence: Math.round(score) / 100,
      confidence_score: score,
      classification: classification,
      rule_id: candidate.ruleId || candidate.strategyId || "",
      detecting_strategies: candidate.strategyId ? [candidate.strategyId] : [],
      related_categories: candidate.category ? [candidate.category] : [],
      simple: { id: (candidate.simpleId || candidate.ruleId || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_") },
      // Pipeline metadata
      pipeline: "V6_EVIDENCE_DRIVEN"
    };
  }

  /** Legacy post-filter for any findings that bypassed finalize */
  function postValidateFindings(problems) {
    var out = [];
    for (var i = 0; i < (problems || []).length; i++) {
      var p = problems[i];
      if (!p) continue;
      if (p.pipeline === "V5_CANDIDATE_FINALIZE") {
        out.push(p);
        continue;
      }
      if (p.category === "Security" && (isToolSourceFile(p.file_name) || isVendorFile(p.file_name))) continue;
      if (isVendorFile(p.file_name) && p.category !== "Syntax") continue;
      if (p.section === "dom" && p.description && /Missing DOM element:/.test(p.description)) {
        var idm = p.description.match(/Missing DOM element:\s*(.+)$/);
        if (idm && !isValidDomId(idm[1].trim())) continue;
      }
      if (p.severity === "critical" && (p.confidence || 0) < 0.65) p.severity = "high";
      out.push(p);
    }
    return out;
  }

  global.ADStandards = {
    CONFIDENCE_WEIGHTS: CONFIDENCE_WEIGHTS,
    CONFIDENCE_THRESHOLDS: CONFIDENCE_THRESHOLDS,
    isVendorFile: isVendorFile,
    isFixtureFile: isFixtureFile,
    isToolSourceFile: isToolSourceFile,
    isValidDomId: isValidDomId,
    stripNoise: stripNoise,
    countDelimiters: countDelimiters,
    shouldSkipSecurityKeywordScan: shouldSkipSecurityKeywordScan,
    createCandidate: createCandidate,
    createCandidateFromAdd: createCandidateFromAdd,
    validateCandidate: validateCandidate,
    scoreConfidence: scoreConfidence,
    classifyFinding: classifyFinding,
    finalizeFinding: finalizeFinding,
    postValidateFindings: postValidateFindings
  };
})(typeof window !== "undefined" ? window : globalThis);
