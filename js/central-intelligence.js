/**
 * Auto Debugger V10.1.0 — Central Intelligence (Meta-Review Engine)
 * Runs AFTER specialized engines + correlation.
 *
 * 8 meta capabilities + 20 Debug Principles (enforced as gates):
 *  1. Evidence First
 *  2. Symptom ≠ Root Cause
 *  3. Reproduce Before Fix-Prompt
 *  4. One Variable (no multi-cause inflation)
 *  5. Source → Sink Data Path
 *  6. Falsify Assumptions
 *  7. Narrow Scope
 *  8. Isolate Environment (vendor/fixture)
 *  9. Recognize False Positives
 * 10. Minimal Safe Fix readiness only
 * 11. Regression awareness (do not over-claim)
 * 12. Honest Confidence
 * 13. Log/Evidence before Guess
 * 14. Before/After state in evidence
 * 15. Edge inputs considered in scoring
 * 16. Dependencies / cross-file
 * 17. Conditional reproducibility caution
 * 18. Prefer diff against healthy patterns
 * 19. Side-effect / non-scope protection
 * 20. Close only when Evidence no longer supports the symptom as confirmed
 *
 * Rules: never invent bugs; only re-weigh existing evidence.
 * Browser-only. No external APIs.
 */
(function (global) {
  "use strict";

  var SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

  /** 20 Debug Principles — enforced as scoring/status gates (not decoration). */
  var DEBUG_PRINCIPLES = [
    { id: 1,  key: "evidence_first",           title: "Evidence First" },
    { id: 2,  key: "symptom_ne_root",          title: "Symptom ≠ Root Cause" },
    { id: 3,  key: "reproduce_before_prompt",  title: "Reproduce Before Fix-Prompt" },
    { id: 4,  key: "one_variable",             title: "One Variable" },
    { id: 5,  key: "source_sink_path",         title: "Source → Sink Path" },
    { id: 6,  key: "falsify_assumptions",      title: "Falsify Assumptions" },
    { id: 7,  key: "narrow_scope",             title: "Narrow Scope" },
    { id: 8,  key: "isolate_environment",      title: "Isolate Environment" },
    { id: 9,  key: "recognize_fp",             title: "Recognize False Positives" },
    { id: 10, key: "minimal_safe_fix",         title: "Minimal Safe Fix" },
    { id: 11, key: "regression_awareness",     title: "Regression Awareness" },
    { id: 12, key: "honest_confidence",        title: "Honest Confidence" },
    { id: 13, key: "evidence_before_guess",    title: "Evidence Before Guess" },
    { id: 14, key: "before_after_state",       title: "Before/After State" },
    { id: 15, key: "edge_inputs",              title: "Edge Inputs" },
    { id: 16, key: "dependencies",             title: "Dependencies" },
    { id: 17, key: "conditional_repro",        title: "Conditional Reproducibility" },
    { id: 18, key: "healthy_diff",             title: "Healthy Pattern Diff" },
    { id: 19, key: "side_effect_guard",        title: "Side-Effect Guard" },
    { id: 20, key: "close_on_evidence",        title: "Close Only On Evidence" }
  ];

  function hasEvidenceType(p, types) {
    var ev = p.evidence;
    if (!ev) return false;
    var list = Array.isArray(ev) ? ev : [ev];
    var set = {};
    for (var i = 0; i < types.length; i++) set[types[i]] = true;
    for (var j = 0; j < list.length; j++) {
      var e = list[j];
      if (!e) continue;
      if (typeof e === "string") {
        if (set.static || set.string) return true;
        continue;
      }
      var t = String(e.type || "").toLowerCase();
      if (set[t]) return true;
    }
    return false;
  }

  function blobOf(p) {
    return [
      p.description || "", p.symptom || "", p.root_cause || p.rootCause || "",
      p.detected_behavior || "", p.recommendation || "", (p.simple && p.simple.id) || "",
      p.rule_id || ""
    ].join(" ").toLowerCase();
  }

  /**
   * Apply the 20 Debug Principles as hard gates on each finding.
   * Mutates findings in place; returns principle violation notes.
   */
  function applyDebugPrinciples(problems) {
    var notes = [];
    problems.forEach(function (p) {
      var violated = [];
      var conf = confOf(p);
      var heuristic = isHeuristicOnly(p);
      var hasFlow = hasEvidenceType(p, ["dataflow"]);
      var hasValidation = hasEvidenceType(p, ["validation"]);
      var hasAst = hasEvidenceType(p, ["ast", "symbolic", "cross-file"]);
      var hasStrong = hasFlow || hasValidation || (hasAst && conf >= 0.7);
      var blob = blobOf(p);
      var line = p.line || 0;

      // 1 Evidence First — no evidence → demote hard
      if (!p.evidence || (Array.isArray(p.evidence) && !p.evidence.length)) {
        conf = Math.min(conf, 0.35);
        p.status = "POSSIBLE";
        violated.push(1);
      }

      // 13 Evidence before guess — pure heuristic / keyword
      if (heuristic && !hasStrong) {
        conf = Math.min(conf, 0.52);
        if (p.status === "CONFIRMED") p.status = "POSSIBLE";
        violated.push(13);
      }

      // 5 Source → Sink — security without dataflow cannot be critical/confirmed
      if (/security|xss|innerhtml|eval/i.test((p.category || "") + " " + blob)) {
        if (!hasFlow) {
          if (p.severity === "critical") p.severity = "medium";
          if (p.severity === "high" && conf < 0.7) p.severity = "medium";
          if (p.status === "CONFIRMED") p.status = "POSSIBLE";
          conf = Math.min(conf, 0.55);
          p._ci_suppress_prompt = true;
          violated.push(5);
        }
      }

      // 9 Recognize FP — UI percent display, co-occurrence, line-1 security
      if (/percent|scaled value|× percent|convention mismatch|math_percent/i.test(blob)) {
        if (/math\.round|progress|style\.width|slider|confidence|seek|duration|\*\s*100.*%/i.test(blob)) {
          p._ci_principle_fp = "ui_display_percent";
          conf = 0;
          violated.push(9);
        } else if (heuristic && !hasValidation) {
          conf = Math.min(conf, 0.5);
          p.status = "POSSIBLE";
          violated.push(9);
        }
      }
      if (line <= 1 && /security|xss|user input|source.*sink/i.test(blob) && !hasFlow) {
        p._ci_principle_fp = "line1_unproven_security";
        conf = Math.min(conf, 0.35);
        p.status = "POSSIBLE";
        p.severity = "low";
        p._ci_suppress_prompt = true;
        violated.push(9);
      }
      if (/dom html sink|dom static signal|requires data-flow/i.test(blob) && !hasFlow) {
        p.severity = "low";
        p.status = "POSSIBLE";
        conf = Math.min(conf, 0.45);
        p._ci_suppress_prompt = true;
        violated.push(9);
      }

      // 2 Symptom ≠ Root Cause — missing root_cause → not prompt-ready
      var rc = String(p.root_cause || p.rootCause || "").trim();
      if (!rc || rc === "—" || rc.length < 6) {
        p._ci_suppress_prompt = true;
        if (p.status === "CONFIRMED" && conf < 0.9) p.status = "LIKELY";
        violated.push(2);
      }

      // 3 + 10 + 20 Reproduce / Minimal Fix / Close on evidence — prompt only if strong
      if (!(hasStrong && conf >= 0.75 && (p.status === "CONFIRMED" || p.status === "LIKELY"))) {
        // leave suppress if already set; do not force ready
        if (heuristic) p._ci_suppress_prompt = true;
        if (!hasStrong) violated.push(3);
      }

      // 6 Falsify assumptions — "may"/"possible"/"potential" language → not CONFIRMED
      if (/\b(may|possible|potential|might|could)\b/i.test(blob) && p.status === "CONFIRMED" && !hasFlow) {
        p.status = "POSSIBLE";
        conf = Math.min(conf, 0.55);
        violated.push(6);
      }

      // 7 Narrow scope — vague whole-file claims on line 1
      if (line <= 1 && /entire file|whole file|source\+sink patterns/i.test(blob) && !hasFlow) {
        conf = Math.min(conf, 0.4);
        p.status = "POSSIBLE";
        violated.push(7);
      }

      // 8 Isolate environment — vendor/fixture handled later in FP sentinel; mark here
      var fname = p.file_name || p.file || "";
      if (isVendorOrTool(fname) || isFixture(fname)) {
        violated.push(8);
      }

      // 12 Honest confidence — never keep CONFIRMED below 0.8 without dataflow
      if (p.status === "CONFIRMED" && conf < 0.8 && !hasFlow) {
        p.status = conf >= 0.65 ? "LIKELY" : "POSSIBLE";
        violated.push(12);
      }

      // 4 One variable — multi-claim descriptions get slight demotion
      if ((blob.match(/\b(and|also|plus)\b/g) || []).length >= 3 && heuristic) {
        conf = Math.min(conf, conf - 0.05);
        violated.push(4);
      }

      // 16 Dependencies — cross-file evidence boost already elsewhere; mark if claimed without cross-file ev
      if (/cross-file|related_files|multi-file/i.test(blob) && !hasEvidenceType(p, ["cross-file", "dataflow"])) {
        conf = Math.min(conf, 0.6);
        violated.push(16);
      }

      // 14 Before/after — validation evidence preferred; if math without validation demote
      if (/math|percent|calculation/i.test((p.category || "") + blob) && !hasValidation && heuristic) {
        conf = Math.min(conf, 0.55);
        p.status = "POSSIBLE";
        violated.push(14);
      }

      // 19 Side-effect guard — advisory noise not for auto-fix prompt
      if (p.severity === "info" || (p.severity === "low" && conf < 0.5)) {
        p._ci_suppress_prompt = true;
        violated.push(19);
      }

      // Apply confidence
      if (conf <= 0.05) {
        p._ci_principle_drop = true;
      }
      p.confidence = Math.round(Math.max(0, conf) * 1000) / 1000;
      if (violated.length) {
        p._ci_principles_violated = violated;
        notes.push({ id: p.problem_id || locKey(p), principles: violated });
      }
      p._ci_principles_applied = true;
    });

    // Drop principle-killed items
    var kept = [];
    problems.forEach(function (p) {
      if (p._ci_principle_drop) return;
      kept.push(p);
    });
    // Replace array contents
    problems.length = 0;
    for (var i = 0; i < kept.length; i++) problems.push(kept[i]);

    return notes;
  }


  function confOf(p) {
    var c = p && p.confidence;
    if (c == null) return 0.5;
    return c > 1 ? c / 100 : c;
  }

  function locKey(p) {
    return (p.file_name || p.file || "") + "|" + (p.line || 0);
  }

  function rootKey(p) {
    var r = String(p.root_cause || p.rootCause || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100);
    if (r && r !== "—" && r.length > 8) return r;
    return (p.category || "") + "|" + (p.rule_id || (p.simple && p.simple.id) || "").toLowerCase();
  }

  function evidenceStrength(p) {
    var ev = p.evidence;
    var score = 0;
    if (!ev) return 0;
    var list = Array.isArray(ev) ? ev : [ev];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e) continue;
      if (typeof e === "string") {
        if (e.length > 12) score += 0.08;
        continue;
      }
      var t = String(e.type || "").toLowerCase();
      if (t === "dataflow" || t === "validation") score += 0.22;
      else if (t === "ast" || t === "symbolic" || t === "cross-file") score += 0.15;
      else if (t === "static") score += 0.06;
      else score += 0.05;
      if ((e.snippet || "").length > 10) score += 0.04;
      if (e.flowPath && e.flowPath.length) score += 0.08;
    }
    return Math.min(1, score);
  }

  function isHeuristicOnly(p) {
    var ev = p.evidence;
    if (!ev || (Array.isArray(ev) && !ev.length)) return true;
    var list = Array.isArray(ev) ? ev : [ev];
    var strong = false;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e) continue;
      var t = String(typeof e === "object" ? (e.type || "") : "").toLowerCase();
      if (t === "dataflow" || t === "validation" || t === "ast" || t === "symbolic" || t === "cross-file") strong = true;
    }
    return !strong;
  }

  function isVendorOrTool(fname) {
    fname = String(fname || "");
    return /\.min\.js$/i.test(fname)
      || /node_modules\//i.test(fname)
      || /(?:^|\/)(?:jszip|debug-engine|strategies|analysis-worker|analysis-standards)\.js$/i.test(fname)
      || /\/engines\//i.test(fname)
      || /\/worker\//i.test(fname);
  }

  function isFixture(fname) {
    return /(?:^|\/)(?:__tests__|fixtures?|mocks?|testdata)\//i.test(fname)
      || /\.(?:test|spec)\.(js|ts|jsx|tsx)$/i.test(fname);
  }

  // ── 1. Meta-Consistency Check ──────────────────────────────────
  function metaConsistency(problems) {
    var byLoc = Object.create(null);
    problems.forEach(function (p, idx) {
      var k = locKey(p);
      if (!byLoc[k]) byLoc[k] = [];
      byLoc[k].push({ p: p, idx: idx });
    });
    var notes = [];
    Object.keys(byLoc).forEach(function (k) {
      var group = byLoc[k];
      if (group.length < 2) return;
      var hasUnreachable = group.some(function (g) {
        return /unreachable|dead code|impossible/i.test(g.p.description || "")
          || /unreachable|dead/i.test(g.p.root_cause || "");
      });
      var hasReach = group.some(function (g) {
        return /reaches|dataflow|source.*sink/i.test(g.p.description || "")
          || (g.p.flow && g.p.flow.length);
      });
      if (hasUnreachable && hasReach) {
        group.forEach(function (g) {
          g.p.confidence = Math.max(0.25, confOf(g.p) - 0.2);
          g.p._ci_consistency = "conflict_unreachable_vs_reach";
          if (g.p.status === "CONFIRMED") g.p.status = "LIKELY";
        });
        notes.push({ type: "consistency", loc: k, detail: "unreachable vs reach conflict — confidence reduced" });
      }
    });
    return notes;
  }

  // ── 2. Cross-File Correlation Intelligence ─────────────────────
  function crossFileIntelligence(problems, context) {
    var notes = [];
    var fileCount = (context && context.fileCount) || 0;
    problems.forEach(function (p) {
      var related = p.related_files || p.relatedFiles || [];
      var flow = p.flow || [];
      var multiFileEv = false;
      var ev = p.evidence;
      if (Array.isArray(ev)) {
        var files = {};
        ev.forEach(function (e) {
          if (e && e.file) files[e.file] = 1;
        });
        multiFileEv = Object.keys(files).length > 1;
      }
      if (multiFileEv || (related && related.length > 1) || flow.length > 2) {
        p.confidence = Math.min(0.98, confOf(p) + 0.06);
        p._ci_crossfile = "boosted";
        notes.push({ type: "crossfile", id: p.problem_id, detail: "multi-file evidence boost" });
      } else if (fileCount > 3 && isHeuristicOnly(p) && /security|storage/i.test(p.category || "")) {
        // Single-file heuristic security/storage in large project — slight caution
        p.confidence = Math.max(0.3, confOf(p) - 0.05);
        p._ci_crossfile = "single_file_caution";
      }
    });
    return notes;
  }

  // ── 3. Root-Cause Unification ──────────────────────────────────
  function unifyRootCauses(problems) {
    var map = Object.create(null);
    var order = [];
    problems.forEach(function (p) {
      var k = rootKey(p);
      if (!map[k]) {
        map[k] = { key: k, primary: p, members: [] };
        order.push(k);
      }
      map[k].members.push(p);
    });
    var groups = [];
    order.forEach(function (k) {
      var g = map[k];
      if (g.members.length < 2) return;
      // Mark secondary findings as unified under primary
      var primary = g.members[0];
      var bestConf = confOf(primary);
      var bestSev = SEV_RANK[primary.severity] != null ? SEV_RANK[primary.severity] : 9;
      g.members.forEach(function (m) {
        var c = confOf(m);
        var s = SEV_RANK[m.severity] != null ? SEV_RANK[m.severity] : 9;
        if (s < bestSev || (s === bestSev && c > bestConf)) {
          primary = m;
          bestConf = c;
          bestSev = s;
        }
      });
      g.members.forEach(function (m) {
        if (m === primary) {
          m._ci_unified_primary = true;
          m._ci_group_size = g.members.length;
        } else {
          m._ci_unified_under = primary.problem_id || primary.description;
          m._ci_secondary = true;
          // Slight confidence align toward group, but keep visible unless very weak
          if (confOf(m) < 0.45) m._ci_suppress_prompt = true;
        }
      });
      groups.push({
        root: primary.root_cause || primary.rootCause || k,
        size: g.members.length,
        primaryId: primary.problem_id,
        severity: primary.severity
      });
    });
    return groups;
  }

  // ── 4. Evidence Strength Re-Scoring ────────────────────────────
  function rescoreEvidence(problems) {
    problems.forEach(function (p) {
      var base = confOf(p);
      var strength = evidenceStrength(p);
      var heuristic = isHeuristicOnly(p);
      var next = base;
      var hasDataflow = false;
      var ev = p.evidence;
      if (Array.isArray(ev)) {
        hasDataflow = ev.some(function (e) {
          return e && typeof e === "object" && /dataflow|validation/i.test(e.type || "");
        });
      }
      if (strength >= 0.45 && hasDataflow) next = Math.min(0.98, base + 0.1);
      else if (strength >= 0.25) next = Math.min(0.92, base + 0.04);
      else if (heuristic) next = Math.max(0.18, base - 0.18);
      // Hard caps: pure heuristic never reaches CONFIRMED band
      if (heuristic && !hasDataflow) {
        if (next > 0.55) next = 0.55;
        if (/security/i.test(p.category || "") || /innerHTML|eval|XSS/i.test(p.description || "")) {
          if (next > 0.5) next = 0.5;
          if (p.severity === "critical") p.severity = "medium";
          if (p.severity === "high") p.severity = "medium";
        }
      }
      // Math percent without validation must stay POSSIBLE
      if (/math_percent|percent convention|× percent|scaled value may be/i.test(
            (p.simple && p.simple.id) + " " + (p.description || "") + " " + (p.rule_id || ""))) {
        if (!hasDataflow) {
          next = Math.min(next, 0.55);
          p.status = "POSSIBLE";
        }
      }
      p.confidence = Math.round(next * 1000) / 1000;
      p._ci_evidence_strength = Math.round(strength * 100) / 100;
      p._ci_heuristic = heuristic;
      p._ci_has_dataflow = hasDataflow;
      // Align status — never auto-promote heuristic to CONFIRMED
      if (p.confidence >= 0.88 && hasDataflow && !heuristic) p.status = "CONFIRMED";
      else if (p.confidence >= 0.85 && !heuristic) {
        if (p.status !== "CONFIRMED") p.status = "CONFIRMED";
      } else if (p.confidence >= 0.65 && p.status === "POSSIBLE" && !heuristic) p.status = "LIKELY";
      else if (p.confidence < 0.55 && p.status === "CONFIRMED") p.status = "LIKELY";
      else if (p.confidence < 0.4) p.status = "POSSIBLE";
      if (heuristic && !hasDataflow && p.status === "CONFIRMED") p.status = "POSSIBLE";
    });
  }

  // ── 5. False-Positive Sentinel ─────────────────────────────────
  function falsePositiveSentinel(problems) {
    var suppressed = 0;
    var out = [];
    var seenDomSink = Object.create(null);

    problems.forEach(function (p) {
      var fname = p.file_name || p.file || "";
      var drop = false;
      var reason = "";
      var blob = ((p.description || "") + " " + (p.symptom || "") + " " + (p.detected_behavior || "") + " " + (p.root_cause || "")).toLowerCase();
      var snip = "";
      if (Array.isArray(p.evidence)) {
        p.evidence.forEach(function (e) {
          if (e && e.snippet) snip += " " + e.snippet;
        });
      }
      snip = snip.toLowerCase();

      if (isVendorOrTool(fname) && /security|eval|innerhtml/i.test(p.category + " " + blob)) {
        drop = true; reason = "tool_or_vendor_security_scan";
      }
      if (isFixture(fname) && confOf(p) < 0.75) {
        drop = true; reason = "fixture_low_confidence";
      }
      // Intentional numeric guards
      if (/isnan|isfinite|number\.isnan|number\.isfinite/i.test(blob) && /nan|infinity/i.test(blob)) {
        if (confOf(p) < 0.85) { drop = true; reason = "intentional_numeric_guard"; }
      }
      // UI display percent: Math.round(x*100), width = p*100 + '%', progress bars
      if (/percent|scaled value|× percent|math_percent|convention mismatch/i.test(blob)) {
        if (/math\.round\s*\(.*\*\s*100|\*\s*100.*%|progress|style\.width|confidence|slider|intensity|seek|duration/i.test(blob + snip + " " + (p.file_name || ""))) {
          drop = true; reason = "ui_display_percent_scale";
        }
        // Also drop weak percent without strong financial context markers in evidence
        if (!drop && isHeuristicOnly(p) && confOf(p) < 0.7) {
          drop = true; reason = "weak_percent_heuristic";
        }
      }
      // DOM static sink without dataflow: keep at most ONE representative per file
      if (/dom html sink|dom static signal|requires data-flow confirmation/i.test(blob)) {
        var dk = fname + "|dom-sink";
        if (seenDomSink[dk]) {
          drop = true; reason = "duplicate_dom_sink_signal";
        } else {
          seenDomSink[dk] = true;
          // force low severity / not confirmed
          p.severity = "low";
          p.status = "POSSIBLE";
          p.confidence = Math.min(confOf(p), 0.5);
          p._ci_suppress_prompt = true;
        }
      }
      // innerHTML hygiene without dataflow: not critical, not prompt-primary
      if (/innerhtml assignment/i.test(blob) && isHeuristicOnly(p) && !p._ci_has_dataflow) {
        if (p.severity === "critical" || p.severity === "high") p.severity = "medium";
        p.status = "POSSIBLE";
        p.confidence = Math.min(confOf(p), 0.5);
        p._ci_suppress_prompt = true;
      }
      // Critical on line 1 / empty location with only static claim
      if ((p.line === 1 || p.line === 0) && /security|xss|user input/i.test(blob) && isHeuristicOnly(p)) {
        drop = true; reason = "line1_heuristic_security";
      }
      // Very weak possible
      if (!drop && (p.status === "POSSIBLE" || confOf(p) < 0.35) && isHeuristicOnly(p) && !p._ci_unified_primary) {
        // keep one DOM sink rep; drop other weak noise
        if (!/dom html sink|innerhtml/i.test(blob)) {
          drop = true; reason = "weak_heuristic_possible";
        }
      }

      if (drop) {
        p._ci_suppressed = true;
        p._ci_suppress_reason = reason;
        suppressed++;
      } else {
        out.push(p);
      }
    });
    return { problems: out, suppressed: suppressed };
  }

  // ── 6. Severity & Priority Re-Ranking ──────────────────────────
  function rerankSeverity(problems) {
    problems.forEach(function (p) {
      var cat = (p.category || "").toLowerCase();
      var conf = confOf(p);
      var impactBoost = 0;
      if (/security/i.test(cat) && conf >= 0.7) impactBoost = 1;
      if (/storage|database/i.test(cat) && /json\.parse|key mismatch|write without read/i.test(p.description || "") && conf >= 0.7) impactBoost = 1;
      if (/math/i.test(cat) && /division by zero|non-finite/i.test(p.description || "") && conf >= 0.85) impactBoost = 1;

      var sev = (p.severity || "medium").toLowerCase();
      if (impactBoost && sev === "medium") p.severity = "high";
      if (impactBoost && sev === "low" && conf >= 0.85) p.severity = "medium";
      // Downgrade info-level noise
      if (sev === "info" && conf < 0.5) p._ci_low_priority = true;
    });
    // Sort: severity → confidence → unified primary first
    problems.sort(function (a, b) {
      var sa = SEV_RANK[a.severity] != null ? SEV_RANK[a.severity] : 9;
      var sb = SEV_RANK[b.severity] != null ? SEV_RANK[b.severity] : 9;
      if (sa !== sb) return sa - sb;
      if (a._ci_unified_primary && !b._ci_unified_primary) return -1;
      if (!a._ci_unified_primary && b._ci_unified_primary) return 1;
      return confOf(b) - confOf(a);
    });
  }

  // ── 7. Localization & Explanation Quality Gate ─────────────────
  function localizationGate(problems) {
    var fixed = 0;
    if (typeof ADExplain === "undefined" || !ADExplain.enrichFinding) return fixed;
    problems.forEach(function (p) {
      var before = p.conversational || p.simple_title || "";
      ADExplain.enrichFinding(p);
      var after = p.conversational || p.simple_title || "";
      if (before !== after) fixed++;
      p._ci_lang = (typeof ADExplain.translatePhrase === "function")
        ? (p._lang || "en")
        : (p._lang || "en");
    });
    return fixed;
  }

  // ── 8. Final Verdict & Prompt Readiness ────────────────────────
  /**
   * Final Verdict — three tiers (V10.1.0):
   *   ACTIONABLE  → Fix-Prompt eligible (high evidence)
   *   ADVISORY    → shown in UI, not auto-prompt
   *   NOISE       → suppressed / principle-killed (already filtered)
   *
   * Rules (must all align with 20 Debug Principles):
   *  - heuristic + security/DOM/percent → never ACTIONABLE
   *  - CONFIRMED without dataflow/validation → not ACTIONABLE unless conf≥0.92 and !heuristic
   *  - SECURITY requires dataflow for ACTIONABLE
   *  - status POSSIBLE → never ACTIONABLE
   */
  function finalVerdict(problems) {
    var actionable = [];
    var advisory = [];
    problems.forEach(function (p) {
      if (p._ci_suppressed || p._ci_principle_drop) return;

      var conf = confOf(p);
      var st = (p.status || "").toUpperCase();
      var cls = (p.classification || "").toUpperCase();
      var heuristic = p._ci_heuristic === true || isHeuristicOnly(p);
      var hasFlow = p._ci_has_dataflow === true || hasEvidenceType(p, ["dataflow"]);
      var hasValidation = hasEvidenceType(p, ["validation"]);
      var hasAst = hasEvidenceType(p, ["ast", "symbolic", "cross-file"]);
      var blob = ((p.category || "") + " " + (p.description || "") + " " + (p.symptom || "")).toLowerCase();
      var isSec = /security|xss|innerhtml|eval/.test(blob) || cls.indexOf("SECURITY") >= 0;
      var isDomStatic = /dom html sink|dom static signal|requires data-flow/.test(blob);
      var isPercent = /percent|scaled value|convention mismatch/.test(blob);

      // Hard blocks → advisory only
      if (p._ci_suppress_prompt === true) {
        p._ci_prompt_ready = false;
        p._ci_verdict = "ADVISORY";
        advisory.push(p);
        return;
      }
      if (st === "POSSIBLE" || st === "INCONCLUSIVE" || st === "DO_NOT_REPORT") {
        p._ci_prompt_ready = false;
        p._ci_verdict = "ADVISORY";
        advisory.push(p);
        return;
      }
      if (heuristic && (isSec || isDomStatic || isPercent)) {
        p._ci_suppress_prompt = true;
        p._ci_prompt_ready = false;
        p._ci_verdict = "ADVISORY";
        if (isSec && p.severity === "critical") p.severity = "medium";
        advisory.push(p);
        return;
      }

      var ready = false;
      // Path A: proven data-flow security / confirmed bug
      if (hasFlow && !heuristic && conf >= 0.75) {
        if (isSec || cls === "SECURITY_ISSUE" || cls === "CONFIRMED_SECURITY_ISSUE") ready = true;
        if (cls === "CONFIRMED_BUG" || st === "CONFIRMED") ready = true;
      }
      // Path B: strong AST/validation, non-heuristic, high conf
      if (!ready && !heuristic && (hasValidation || hasAst) && conf >= 0.85 && st === "CONFIRMED") {
        if (!isSec || hasFlow) ready = true;
      }
      // Path C: exceptional confidence with non-heuristic evidence
      if (!ready && !heuristic && conf >= 0.92 && (hasAst || hasValidation) && (st === "CONFIRMED" || st === "LIKELY")) {
        if (!isSec || hasFlow) ready = true;
      }
      // Path D: LIKELY + dataflow + high conf
      if (!ready && !heuristic && hasFlow && st === "LIKELY" && conf >= 0.82) ready = true;

      if (ready) {
        p._ci_prompt_ready = true;
        p._ci_verdict = "ACTIONABLE";
        actionable.push(p);
      } else {
        p._ci_prompt_ready = false;
        p._ci_verdict = "ADVISORY";
        advisory.push(p);
      }
    });
    return { actionable: actionable, advisory: advisory };
  }

  /**
   * Main entry: review(result) → mutates result.problems and attaches result.centralIntelligence
   */
  function review(result, options) {
    options = options || {};
    var t0 = Date.now();
    result = result || {};
    var problems = (result.problems || []).slice();
    var context = result.context || {};
    var report = {
      version: "V10.1.0-CI",
      inputCount: problems.length,
      consistencyNotes: [],
      crossFileNotes: [],
      rootCauseGroups: [],
      suppressed: 0,
      localizationFixed: 0,
      actionableCount: 0,
      advisoryCount: 0,
      ms: 0
    };

    if (!problems.length) {
      report.ms = Date.now() - t0;
      result.centralIntelligence = report;
      result.problems = [];
      return result;
    }

    // 0 — 20 Debug Principles (hard gates before other meta steps)
    report.principleNotes = applyDebugPrinciples(problems);
    report.principlesVersion = 20;

    // 1
    report.consistencyNotes = metaConsistency(problems);
    // 2
    report.crossFileNotes = crossFileIntelligence(problems, context);
    // 3
    report.rootCauseGroups = unifyRootCauses(problems);
    // 4
    rescoreEvidence(problems);
    // 5
    var fp = falsePositiveSentinel(problems);
    problems = fp.problems;
    report.suppressed = fp.suppressed;
    // 6
    rerankSeverity(problems);
    // 7
    report.localizationFixed = localizationGate(problems);
    // 8 — principles second pass, then final verdict (so actionable matches gates)
    applyDebugPrinciples(problems);
    problems = problems.filter(function (p) { return !p._ci_principle_drop; });
    report.principleNotes = (report.principleNotes || []).concat(
      problems.filter(function (p) { return p._ci_principles_violated && p._ci_principles_violated.length; })
        .map(function (p) { return { id: p.problem_id, principles: p._ci_principles_violated }; })
    );
    var verdict = finalVerdict(problems);
    report.actionableCount = verdict.actionable.length;
    report.advisoryCount = verdict.advisory.length;

    // Re-number problem ids for stable UI
    problems.forEach(function (p, i) {
      if (!p.problem_id) p.problem_id = "P" + String(i + 1).padStart(4, "0");
      p._ci_reviewed = true;
    });

    report.outputCount = problems.length;
    report.ms = Date.now() - t0;

    result.problems = problems;
    result.centralIntelligence = report;
    result.promptReadyFindings = verdict.actionable;
    return result;
  }

  global.ADCentralIntelligence = {
    review: review,
    version: "V10.1.0",
    principles: DEBUG_PRINCIPLES,
    features: [
      "Meta-Consistency Check",
      "Cross-File Correlation Intelligence",
      "Root-Cause Unification",
      "Evidence Strength Re-Scoring",
      "False-Positive Sentinel",
      "Severity & Priority Re-Ranking",
      "Localization & Explanation Quality Gate",
      "Final Verdict & Prompt Readiness",
      "20 Debug Principles Gates"
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);
