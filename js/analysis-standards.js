/**
 * Shared analysis standards — delimiter balance, tool-file detection, FP guards.
 */
(function (global) {
  "use strict";

  function isVendorFile(fname) {
    return /\.min\.js$/i.test(fname) || /(?:^|\/)jszip/i.test(fname) || /node_modules\//i.test(fname);
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

  function postValidateFindings(problems) {
    var out = [];
    for (var i = 0; i < (problems || []).length; i++) {
      var p = problems[i];
      if (!p) continue;
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
    isVendorFile: isVendorFile,
    isToolSourceFile: isToolSourceFile,
    isValidDomId: isValidDomId,
    stripNoise: stripNoise,
    countDelimiters: countDelimiters,
    shouldSkipSecurityKeywordScan: shouldSkipSecurityKeywordScan,
    postValidateFindings: postValidateFindings
  };
})(typeof window !== "undefined" ? window : globalThis);
