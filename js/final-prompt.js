/**
 * Final Prompt Generator — Auto Debugger V3.0
 * Builds a professional fix prompt from confirmed findings only.
 */
(function (global) {
  "use strict";

  var SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

  function isValidFinding(p, opts) {
    if (!p) return false;
    opts = opts || {};
    var cls = (p.classification || "").toUpperCase();
    var st = (p.status || "").toUpperCase();
    if (st === "NOT_APPLICABLE" || st === "SKIPPED" || st === "DO_NOT_REPORT") return false;
    // Default: only CONFIRMED_BUG / SECURITY_ISSUE / PERFORMANCE_ISSUE
    var allowWeak = opts.includePossible === true;
    if (cls === "CONFIRMED_BUG" || cls === "SECURITY_ISSUE" || cls === "PERFORMANCE_ISSUE") return true;
    if (allowWeak && (cls === "POSSIBLE_ISSUE" || cls === "CODE_SMELL" || st === "INCONCLUSIVE" || st === "POSSIBLE")) {
      return (p.confidence || 0) >= 0.5;
    }
    // Legacy status-based
    if (!cls) {
      if (st === "POSSIBLE" && (p.confidence || 0) < 0.55) return false;
      if ((p.confidence || 0) < 0.35) return false;
      return st === "CONFIRMED" || st === "LIKELY" || (p.confidence || 0) >= 0.7;
    }
    return false;
  }

  function sortFindings(list, meta) {
    return (list || []).slice().filter(function (p) { return isValidFinding(p, meta); }).sort(function (a, b) {
      var sa = SEV_ORDER[a.severity] != null ? SEV_ORDER[a.severity] : 9;
      var sb = SEV_ORDER[b.severity] != null ? SEV_ORDER[b.severity] : 9;
      if (sa !== sb) return sa - sb;
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }

  function issueLine(p, i) {
    var loc = p.file || p.file_name || "unknown";
    if (p.line) loc += " (line " + p.line + (p.endLine && p.endLine !== p.line ? "-" + p.endLine : "") + ")";
    if (p.section) loc += " [" + p.section + "]";
    var conf = p.confidence;
    if (conf != null && conf <= 1) conf = Math.round(conf * 100);
    else conf = conf || p.confidence_score || 0;
    var ev = p.evidence;
    if (Array.isArray(ev)) {
      ev = ev.slice(0, 4).map(function (e) {
        return (e.engine || e.type || "ev") + (e.snippet ? ": " + String(e.snippet).slice(0, 60) : "");
      }).join(" | ");
    }
    var flow = "";
    if (p.flow && p.flow.length) flow = "\n   Flow: " + p.flow.slice(0, 3).join(" → ");
    var corr = "";
    if (p.correlation && p.correlation.engineCount) {
      corr = "\n   Correlation: " + p.correlation.engineCount + " engines" +
        (p.correlation.agreement ? " (agreement)" : "") +
        (p.correlation.contradictions && p.correlation.contradictions.length ? " [CONTRADICTION]" : "");
    }
    return (i + 1) + ". [" + (p.severity || "medium").toUpperCase() + " | conf " + conf + "% | " +
      (p.classification || p.status || "LIKELY") + "] " +
      (p.symptom || p.description || p.problem || "Issue") +
      "\n   File: " + loc +
      "\n   Evidence: " + (ev || p.detected_behavior || "—") +
      flow + corr +
      "\n   Root cause: " + (p.rootCause || p.root_cause || "—") +
      "\n   Impact: " + (p.impact || p.why_it_matters || "—") +
      "\n   Status: " + (p.status || "LIKELY");
  }

  function rootLine(p, i) {
    return (i + 1) + ". " + (p.root_cause || p.recommended_correction_area || p.description || "See issue");
  }

  function solutionLine(p, i) {
    return (i + 1) + ". " + (p.recommended_correction_area || p.expected_behavior || "Review and fix based on evidence.");
  }

  function generate(findings, meta) {
    meta = meta || {};
    var valid = sortFindings(findings, meta);
    if (!valid.length) {
      return {
        empty: true,
        text: "No confirmed issues found. No fix prompt is required.",
        count: 0
      };
    }

    var files = {};
    valid.forEach(function (p) {
      if (p.file_name) files[p.file_name] = 1;
    });
    var fileList = Object.keys(files);
    var cat = {};
    valid.forEach(function (p) { cat[p.category || "General"] = (cat[p.category || "General"] || 0) + 1; });

    var lines = [];
    lines.push("[ROLE]");
    lines.push("You are a Senior Full-Stack Developer responsible for fixing confirmed static-analysis findings in an existing project.");
    lines.push("");
    lines.push("[CONTEXT]");
    lines.push("A local browser-only debugger analyzed the project and produced the confirmed issues below.");
    lines.push("Project files involved: " + (fileList.join(", ") || "n/a"));
    if (meta.category) lines.push("Analysis category focus: " + meta.category);
    if (meta.level) lines.push("Analysis level: " + meta.level);
    lines.push("Total confirmed/likely issues: " + valid.length);
    lines.push("By category: " + Object.keys(cat).map(function (k) { return k + "=" + cat[k]; }).join(", "));
    lines.push("");
    lines.push("[OBJECTIVE]");
    lines.push("Fix only the confirmed issues listed below. Preserve existing behavior outside the listed problems. Prefer minimal, safe changes.");
    lines.push("");
    lines.push("[CONFIRMED ISSUES]");
    valid.forEach(function (p, i) { lines.push(issueLine(p, i)); lines.push(""); });
    lines.push("[ROOT CAUSES]");
    valid.forEach(function (p, i) { lines.push(rootLine(p, i)); });
    lines.push("");
    lines.push("[RECOMMENDED SOLUTIONS]");
    valid.forEach(function (p, i) { lines.push(solutionLine(p, i)); });
    lines.push("");
    lines.push("[IMPLEMENTATION SCOPE]");
    lines.push("- Touch only files required to resolve the listed issues: " + (fileList.join(", ") || "related files only"));
    lines.push("- Keep public APIs and unrelated UI flows unchanged unless a listed issue requires it.");
    lines.push("- Do not introduce new frameworks, backends, or external services.");
    lines.push("");
    lines.push("[CONSTRAINTS]");
    lines.push("- Do not modify unrelated files or functionality.");
    lines.push("- Do not remove security controls or weaken validation.");
    lines.push("- Do not execute or embed untrusted user content unsafely.");
    lines.push("- Prefer existing project patterns and style.");
    lines.push("- If evidence is insufficient for a change, skip that item and note why.");
    lines.push("");
    lines.push("[VALIDATION REQUIREMENTS]");
    lines.push("- Re-check each fixed issue against its evidence and recommendation.");
    lines.push("- Ensure no regression in upload, analysis, results, language, or theme flows if those files are touched.");
    lines.push("- Confirm syntax of modified HTML/CSS/JS/Python remains valid.");
    lines.push("");
    lines.push("[REAL USER SIMULATION]");
    lines.push("- Open the app / affected pages.");
    lines.push("- Exercise the user-visible path related to each fixed issue.");
    lines.push("- Verify the original symptom no longer appears.");
    lines.push("");
    lines.push("[FINAL REPORT]");
    lines.push("List files changed, issues fixed, issues skipped (with reason), and residual risks.");

    return {
      empty: false,
      text: lines.join("\n"),
      count: valid.length
    };
  }

  global.ADFinalPrompt = { generate: generate, isValidFinding: isValidFinding };
})(typeof window !== "undefined" ? window : globalThis);
