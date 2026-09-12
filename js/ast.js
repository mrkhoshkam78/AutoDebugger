/**
 * Lightweight structural AST scanner (no external parser).
 * Extracts functions, calls, assignments, sinks/sources for JS/TS-like code.
 */
(function (global) {
  "use strict";

  function stripNoise(content) {
    return String(content || "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/'(?:\\.|[^\\'])*'/g, "''")
      .replace(/"(?:\\.|[^\\"])*"/g, '""')
      .replace(/`(?:\\.|[^\\`])*`/g, "``");
  }

  function analyzeJS(content, fileName) {
    var code = stripNoise(content);
    var result = {
      file: fileName || "",
      functions: [],
      calls: [],
      assignments: [],
      sinks: [],
      sources: [],
      imports: [],
      hasEval: false,
      hasInnerHTML: false,
      hasOuterHTML: false,
      hasInsertAdjacentHTML: false,
      hasDocumentWrite: false,
      hasFunctionCtor: false
    };

    var fnRe = /function\s+([A-Za-z_$][\w$]*)\s*\(|([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(|([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
    var m;
    while ((m = fnRe.exec(code))) {
      result.functions.push(m[1] || m[2] || m[3] || "anonymous");
    }

    var callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
    while ((m = callRe.exec(code))) {
      if (["if", "for", "while", "switch", "catch", "function", "return"].indexOf(m[1]) === -1) {
        result.calls.push(m[1]);
      }
    }

    if (/\beval\s*\(/.test(code)) {
      result.hasEval = true;
      result.sinks.push({ kind: "eval", evidence: "eval(" });
    }
    if (/\bnew\s+Function\s*\(|\bFunction\s*\(\s*['"]/.test(code)) {
      result.hasFunctionCtor = true;
      result.sinks.push({ kind: "Function", evidence: "Function(" });
    }
    if (/\.innerHTML\s*=/.test(code)) {
      result.hasInnerHTML = true;
      result.sinks.push({ kind: "innerHTML", evidence: "innerHTML =" });
    }
    if (/\.outerHTML\s*=/.test(code)) {
      result.hasOuterHTML = true;
      result.sinks.push({ kind: "outerHTML", evidence: "outerHTML =" });
    }
    if (/insertAdjacentHTML\s*\(/.test(code)) {
      result.hasInsertAdjacentHTML = true;
      result.sinks.push({ kind: "insertAdjacentHTML", evidence: "insertAdjacentHTML(" });
    }
    if (/document\.write\s*\(/.test(code)) {
      result.hasDocumentWrite = true;
      result.sinks.push({ kind: "document.write", evidence: "document.write(" });
    }

    if (/location\.(hash|search|href)|document\.(URL|referrer)|\.value\b/.test(code)) {
      result.sources.push({ kind: "user-or-url", evidence: "location/input" });
    }
    if (/localStorage\.setItem|sessionStorage\.setItem/.test(code)) {
      result.sinks.push({ kind: "webStorage", evidence: "localStorage/sessionStorage" });
    }

    var impRe = /import\s+.+from\s+|require\s*\(\s*['"][^'"]+/g;
    while ((m = impRe.exec(content))) result.imports.push(m[0].slice(0, 80));

    return result;
  }

  function analyzeProject(files) {
    var map = {};
    var names = Object.keys(files || {});
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var ext = (n.split(".").pop() || "").toLowerCase();
      if (ext === "js" || ext === "ts" || ext === "jsx" || ext === "tsx" || ext === "mjs") {
        map[n] = analyzeJS(files[n], n);
      }
    }
    return map;
  }

  function hasSourceToSink(astMap) {
    var hasSource = false, hasSink = false, sources = [], sinks = [];
    Object.keys(astMap || {}).forEach(function (f) {
      var a = astMap[f];
      if (a.sources && a.sources.length) { hasSource = true; sources.push(f); }
      if (a.sinks && a.sinks.some(function (s) {
        return ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval", "Function"].indexOf(s.kind) !== -1;
      })) { hasSink = true; sinks.push(f); }
    });
    return { hasSource: hasSource, hasSink: hasSink, sources: sources, sinks: sinks };
  }

  global.ADAst = {
    analyzeJS: analyzeJS,
    analyzeProject: analyzeProject,
    hasSourceToSink: hasSourceToSink,
    stripNoise: stripNoise
  };
})(typeof window !== "undefined" ? window : globalThis);
