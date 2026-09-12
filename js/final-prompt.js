/**
 * Final Prompt Generator — Auto Debugger V3.0
 * Builds a professional fix prompt from confirmed findings only.
 */
(function (global) {
  "use strict";

  var SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

  function isValidFinding(p) {
    if (!p) return false;
    if (p.status === "NOT_APPLICABLE" || p.status === "SKIPPED") return false;
    if (p.status === "POSSIBLE" && (p.confidence || 0) < 0.55) return false;
    if ((p.confidence || 0) < 0.35) return false;
    return true;
  }

  function sortFindings(list) {
    return (list || []).slice().filter(isValidFinding).sort(function (a, b) {
      var sa = SEV_ORDER[a.severity] != null ? SEV_ORDER[a.severity] : 9;
      var sb = SEV_ORDER[b.severity] != null ? SEV_ORDER[b.severity] : 9;
      if (sa !== sb) return sa - sb;
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }

  function issueLine(p, i) {
    var loc = p.file_name || "unknown";
    if (p.line) loc += " (line " + p.line + ")";
    if (p.section) loc += " [" + p.section + "]";
    return (i + 1) + ". [" + (p.severity || "medium").toUpperCase() + " | conf " +
      Math.round((p.confidence || 0) * 100) + "%] " +
      (p.description || p.symptom || "Issue") +
      "\n   File: " + loc +
      "\n   Evidence: " + (p.evidence || p.detected_behavior || "—") +
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
    var valid = sortFindings(findings);
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
