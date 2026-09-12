/**
 * Auto Debugger V6 — Structural Analysis + Code Model + Light Data-Flow
 * Browser-only. No external parser dependency.
 * Regex is used only for candidate discovery / token extraction, not as primary reasoning.
 */
(function (global) {
  "use strict";

  function stripNoise(content) {
    return String(content || "")
      .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, " "); })
      .replace(/\/\/[^\n]*/g, "")
      .replace(/'(?:\\.|[^\\'])*'/g, "''")
      .replace(/"(?:\\.|[^\\"])*"/g, '""')
      .replace(/`(?:\\.|[^\\`])*`/g, "``");
  }

  function lineOf(content, index) {
    if (index == null || index < 0) return 1;
    return String(content || "").slice(0, index).split("\n").length;
  }

  function extractFunctions(code, content) {
    var out = [];
    var re = /function\s+([A-Za-z_$][\w$]*)\s*\(|([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(|([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g;
    var m;
    while ((m = re.exec(code))) {
      var name = m[1] || m[2] || m[3] || m[4] || "anonymous";
      out.push({ name: name, line: lineOf(content, m.index), kind: "function" });
    }
    var cm = /(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
    while ((m = cm.exec(code))) {
      if (["if", "for", "while", "switch", "catch", "function", "return", "else"].indexOf(m[1]) === -1) {
        out.push({ name: m[1], line: lineOf(content, m.index), kind: "method" });
      }
    }
    return out;
  }

  function extractCalls(code, content) {
    var out = [];
    var re = /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;
    var m;
    var skip = { if: 1, for: 1, while: 1, switch: 1, catch: 1, function: 1, return: 1, typeof: 1, new: 1, throw: 1 };
    while ((m = re.exec(code))) {
      var name = m[1];
      if (skip[name.split(".")[0]]) continue;
      out.push({ name: name, line: lineOf(content, m.index), raw: m[0] });
    }
    return out;
  }

  function extractAssignments(code, content) {
    var out = [];
    var re = /(?:(?:var|let|const)\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*=\s*([^;,\n]+)/g;
    var m;
    while ((m = re.exec(code))) {
      out.push({
        target: m[1].trim(),
        value: (m[2] || "").trim().slice(0, 120),
        line: lineOf(content, m.index)
      });
    }
    return out;
  }

  function extractImports(content) {
    var out = [];
    var re = /import\s+(?:([\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    var m;
    while ((m = re.exec(content))) {
      out.push({
        names: (m[1] || "").trim(),
        from: m[2] || m[3] || "",
        line: lineOf(content, m.index)
      });
    }
    return out;
  }

  function extractExports(content) {
    var out = [];
    var re = /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)|exports\.([A-Za-z_$][\w$]*)\s*=/g;
    var m;
    while ((m = re.exec(content))) {
      out.push({ name: m[1] || m[2], line: lineOf(content, m.index) });
    }
    return out;
  }

  var SOURCE_PATTERNS = [
    { kind: "location", re: /location\.(hash|search|href|pathname)|document\.(URL|referrer|location)/g },
    { kind: "input", re: /\.value\b|getElementById\s*\([^)]+\)\.value|querySelector\s*\([^)]+\)\.value/g },
    { kind: "form", re: /FormData|form\.elements|\.elements\[/g },
    { kind: "storage", re: /localStorage\.getItem|sessionStorage\.getItem/g },
    { kind: "network", re: /\.responseText|\.responseJSON|fetch\s*\(|XMLHttpRequest|\.json\s*\(\s*\)/g },
    { kind: "postMessage", re: /event\.data|e\.data|message\.data/g },
    { kind: "urlParam", re: /URLSearchParams|searchParams\.get|location\.search/g },
    { kind: "user", re: /prompt\s*\(|window\.name/g }
  ];

  var SINK_PATTERNS = [
    { kind: "innerHTML", re: /\.innerHTML\s*=/g, severity: "high" },
    { kind: "outerHTML", re: /\.outerHTML\s*=/g, severity: "high" },
    { kind: "insertAdjacentHTML", re: /insertAdjacentHTML\s*\(/g, severity: "high" },
    { kind: "document.write", re: /document\.write(?:ln)?\s*\(/g, severity: "high" },
    { kind: "eval", re: /\beval\s*\(/g, severity: "critical" },
    { kind: "Function", re: /\bnew\s+Function\s*\(|\bFunction\s*\(\s*['"`]/g, severity: "critical" },
    { kind: "setTimeoutString", re: /setTimeout\s*\(\s*['"`]/g, severity: "high" },
    { kind: "setIntervalString", re: /setInterval\s*\(\s*['"`]/g, severity: "high" },
    { kind: "scriptSrc", re: /\.src\s*=\s*[^;]+|createElement\s*\(\s*['"]script['"]/g, severity: "high" },
    { kind: "locationAssign", re: /location\.(href|assign|replace)\s*=/g, severity: "medium" },
    { kind: "webStorage", re: /(?:local|session)Storage\.setItem/g, severity: "medium" },
    { kind: "postMessageStar", re: /postMessage\s*\([^,]+,\s*['"]\*['"]/g, severity: "high" }
  ];

  function extractSources(code, content) {
    var out = [];
    SOURCE_PATTERNS.forEach(function (p) {
      var re = new RegExp(p.re.source, "g");
      var m;
      while ((m = re.exec(code))) {
        out.push({ kind: p.kind, evidence: m[0].slice(0, 60), line: lineOf(content, m.index), index: m.index });
      }
    });
    return out;
  }

  function extractSinks(code, content) {
    var out = [];
    SINK_PATTERNS.forEach(function (p) {
      var re = new RegExp(p.re.source, "g");
      var m;
      while ((m = re.exec(code))) {
        out.push({
          kind: p.kind,
          evidence: m[0].slice(0, 80),
          line: lineOf(content, m.index),
          index: m.index,
          severity: p.severity
        });
      }
    });
    return out;
  }

  function extractControlSignals(code, content) {
    var signals = {
      earlyReturns: [],
      alwaysTrue: [],
      alwaysFalse: [],
      emptyCatches: [],
      missingAwait: []
    };
    var lines = String(content || "").split("\n");
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (/^\s*if\s*\(\s*(true|1)\s*\)/.test(L)) signals.alwaysTrue.push(i + 1);
      if (/^\s*if\s*\(\s*(false|0|null|undefined)\s*\)/.test(L)) signals.alwaysFalse.push(i + 1);
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(L) || /catch\s*\([^)]*\)\s*\{\s*\/\//.test(L)) {
        signals.emptyCatches.push(i + 1);
      }
      if (/\b(fetch|axios|getData|load|save|query)\s*\(/.test(L) && !/\bawait\b/.test(L) && !/\.then\b/.test(L)) {
        signals.missingAwait.push(i + 1);
      }
      if (/^\s*return\b/.test(L) && i > 0 && /if\s*\(/.test(lines[i - 1] || "")) {
        signals.earlyReturns.push(i + 1);
      }
    }
    return signals;
  }

  function analyzeJS(content, fileName) {
    var code = stripNoise(content);
    var functions = extractFunctions(code, content);
    var calls = extractCalls(code, content);
    var assignments = extractAssignments(code, content);
    var imports = extractImports(content);
    var exports = extractExports(content);
    var sources = extractSources(code, content);
    var sinks = extractSinks(code, content);
    var control = extractControlSignals(code, content);

    var result = {
      file: fileName || "",
      functions: functions,
      calls: calls,
      assignments: assignments,
      imports: imports,
      exports: exports,
      sources: sources,
      sinks: sinks,
      control: control,
      hasEval: sinks.some(function (s) { return s.kind === "eval"; }),
      hasInnerHTML: sinks.some(function (s) { return s.kind === "innerHTML"; }),
      hasOuterHTML: sinks.some(function (s) { return s.kind === "outerHTML"; }),
      hasInsertAdjacentHTML: sinks.some(function (s) { return s.kind === "insertAdjacentHTML"; }),
      hasDocumentWrite: sinks.some(function (s) { return s.kind === "document.write"; }),
      hasFunctionCtor: sinks.some(function (s) { return s.kind === "Function"; }),
      symbols: {}
    };

    functions.forEach(function (f) {
      result.symbols[f.name] = { kind: "function", line: f.line };
    });
    assignments.forEach(function (a) {
      if (!result.symbols[a.target]) result.symbols[a.target] = { kind: "variable", line: a.line };
    });

    return result;
  }

  function buildCodeModel(files, astMap) {
    var model = {
      files: {},
      symbolTable: {},
      importMap: {},
      exportMap: {},
      functionMap: {},
      callMap: {},
      assignmentMap: {},
      dependencyMap: {},
      sourceMap: {},
      sinkMap: {},
      dataFlows: []
    };

    var names = Object.keys(files || {});
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var a = (astMap && astMap[n]) || null;
      if (!a) continue;
      model.files[n] = a;
      model.importMap[n] = (a.imports || []).map(function (x) { return x.from; });
      model.exportMap[n] = (a.exports || []).map(function (x) { return x.name; });
      model.sourceMap[n] = a.sources || [];
      model.sinkMap[n] = a.sinks || [];

      (a.functions || []).forEach(function (f) {
        if (!model.functionMap[f.name]) model.functionMap[f.name] = [];
        model.functionMap[f.name].push({ file: n, line: f.line });
        if (!model.symbolTable[f.name]) model.symbolTable[f.name] = [];
        model.symbolTable[f.name].push({ file: n, kind: "function", line: f.line });
      });
      (a.calls || []).forEach(function (c) {
        if (!model.callMap[c.name]) model.callMap[c.name] = [];
        model.callMap[c.name].push({ file: n, line: c.line });
      });
      (a.assignments || []).forEach(function (as) {
        if (!model.assignmentMap[as.target]) model.assignmentMap[as.target] = [];
        model.assignmentMap[as.target].push({ file: n, value: as.value, line: as.line });
        if (!model.symbolTable[as.target]) model.symbolTable[as.target] = [];
        model.symbolTable[as.target].push({ file: n, kind: "variable", line: as.line });
      });
    }

    names.forEach(function (n) {
      var deps = [];
      (model.importMap[n] || []).forEach(function (imp) {
        if (!imp) return;
        var resolved = resolveImport(n, imp, names);
        if (resolved) deps.push(resolved);
      });
      model.dependencyMap[n] = deps;
    });

    model.dataFlows = discoverDataFlows(model, files);
    return model;
  }

  function resolveImport(fromFile, spec, allNames) {
    if (!spec || spec.indexOf("http") === 0 || spec.indexOf("//") === 0) return null;
    var dir = fromFile.replace(/\/[^/]+$/, "/");
    var candidates = [
      spec, spec + ".js", spec + ".ts", spec + ".mjs",
      dir + spec, dir + spec + ".js", dir + spec + ".ts",
      dir + (spec.replace(/^\.\//, "")) + ".js"
    ];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i].replace(/\/\.\//g, "/");
      if (allNames.indexOf(c) !== -1) return c;
      var base = c.split("/").pop();
      for (var j = 0; j < allNames.length; j++) {
        if (allNames[j].split("/").pop() === base) return allNames[j];
      }
    }
    return null;
  }

  function discoverDataFlows(model, files) {
    var flows = [];
    var fileNames = Object.keys(model.files || {});

    fileNames.forEach(function (fname) {
      var a = model.files[fname];
      if (!a) return;
      var sources = a.sources || [];
      var sinks = a.sinks || [];
      var assignments = a.assignments || [];
      if (!sources.length || !sinks.length) return;

      var tainted = {};
      sources.forEach(function (src) {
        assignments.forEach(function (as) {
          var near = Math.abs((as.line || 0) - (src.line || 0)) <= 8;
          var valueHasSource = /location|search|hash|value|getItem|response|event\.data|prompt/i.test(as.value || "");
          if (near || valueHasSource) {
            tainted[as.target] = {
              from: src,
              hops: 1,
              via: [{ file: fname, line: as.line, target: as.target }]
            };
          }
        });
        tainted["__direct_" + src.kind + "_" + src.line] = { from: src, hops: 0, via: [] };
      });

      var hop;
      for (hop = 0; hop < 4; hop++) {
        var newT = {};
        Object.keys(tainted).forEach(function (t) {
          assignments.forEach(function (as) {
            var clean = t.indexOf("__direct_") === 0 ? "" : t;
            if (clean && ((as.value || "").indexOf(clean) !== -1 || as.value === clean)) {
              if (!tainted[as.target]) {
                newT[as.target] = {
                  from: tainted[t].from,
                  hops: tainted[t].hops + 1,
                  via: (tainted[t].via || []).concat([{ file: fname, line: as.line, target: as.target }])
                };
              }
            }
          });
        });
        Object.keys(newT).forEach(function (k) { tainted[k] = newT[k]; });
      }

      sinks.forEach(function (sink) {
        var matched = false;
        var path = null;
        Object.keys(tainted).forEach(function (t) {
          if (matched) return;
          var via = tainted[t].via || [];
          var last = via[via.length - 1];
          var nearSink = last && Math.abs((last.line || 0) - (sink.line || 0)) <= 12;
          var content = files[fname] || "";
          var lines = content.split("\n");
          var sinkLine = lines[(sink.line || 1) - 1] || "";
          var nameInSink = t.indexOf("__direct_") !== 0 && sinkLine.indexOf(t.split(".").pop()) !== -1;
          if (nearSink || nameInSink || (tainted[t].hops === 0 && Math.abs((tainted[t].from.line || 0) - (sink.line || 0)) <= 15)) {
            matched = true;
            path = {
              file: fname,
              source: tainted[t].from,
              sink: sink,
              hops: tainted[t].hops,
              via: via,
              confidenceBoost: tainted[t].hops <= 2 ? 0.25 : 0.12
            };
          }
        });
        if (!matched && sources.length) {
          var closest = sources[0];
          var bestDist = 9999;
          sources.forEach(function (s) {
            var d = Math.abs((s.line || 0) - (sink.line || 0));
            if (d < bestDist) { bestDist = d; closest = s; }
          });
          if (bestDist <= 40) {
            path = {
              file: fname,
              source: closest,
              sink: sink,
              hops: -1,
              via: [],
              confidenceBoost: 0.05,
              weak: true
            };
            matched = true;
          }
        }
        if (matched && path) flows.push(path);
      });
    });

    // Cross-file linkage via import/export
    fileNames.forEach(function (fa) {
      var exportsA = model.exportMap[fa] || [];
      if (!exportsA.length || !(model.sourceMap[fa] || []).length) return;
      fileNames.forEach(function (fb) {
        if (fa === fb) return;
        var importsB = model.importMap[fb] || [];
        var sinksB = model.sinkMap[fb] || [];
        if (!sinksB.length) return;
        var linked = false;
        importsB.forEach(function (imp) {
          var resolved = resolveImport(fb, imp, fileNames);
          if (resolved === fa) linked = true;
        });
        if (!linked) {
          var baseA = fa.split("/").pop().replace(/\.(js|ts|mjs)$/i, "");
          importsB.forEach(function (imp) {
            if (imp && imp.indexOf(baseA) !== -1) linked = true;
          });
        }
        if (linked) {
          sinksB.forEach(function (sink) {
            flows.push({
              file: fb,
              sourceFile: fa,
              source: (model.sourceMap[fa] || [])[0],
              sink: sink,
              hops: 2,
              via: [{ file: fa, note: "export" }, { file: fb, note: "import" }],
              crossFile: true,
              confidenceBoost: 0.18
            });
          });
        }
      });
    });

    return flows;
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

  function findFlowsForSink(codeModel, file, sinkKind, sinkLine) {
    var flows = (codeModel && codeModel.dataFlows) || [];
    return flows.filter(function (f) {
      if (f.file !== file && f.sourceFile !== file) return false;
      if (f.sink && f.sink.kind === sinkKind) {
        if (sinkLine == null) return true;
        return Math.abs((f.sink.line || 0) - sinkLine) <= 2;
      }
      return false;
    });
  }

  global.ADAst = {
    analyzeJS: analyzeJS,
    analyzeProject: analyzeProject,
    hasSourceToSink: hasSourceToSink,
    stripNoise: stripNoise,
    buildCodeModel: buildCodeModel,
    findFlowsForSink: findFlowsForSink,
    discoverDataFlows: discoverDataFlows,
    SOURCE_PATTERNS: SOURCE_PATTERNS,
    SINK_PATTERNS: SINK_PATTERNS
  };
})(typeof window !== "undefined" ? window : globalThis);
