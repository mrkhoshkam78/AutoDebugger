/**
 * Auto Debugger V6 Stage-1 Core
 * Deep Data Flow · CFG · Limited Symbolic · Module Graph
 * Browser-only. Lazy/targeted. No external deps.
 */
(function (global) {
  "use strict";

  var DEFAULT_MAX_HOPS = 6;

  // ─── helpers ───
  function lineOf(content, index) {
    if (index == null || index < 0) return 1;
    return String(content || "").slice(0, index).split("\n").length;
  }

  function stripNoise(content) {
    if (global.ADAst && ADAst.stripNoise) return ADAst.stripNoise(content);
    return String(content || "")
      .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, " "); })
      .replace(/\/\/[^\n]*/g, "")
      .replace(/'(?:\\.|[^\\'])*'/g, "''")
      .replace(/"(?:\\.|[^\\"])*"/g, '""')
      .replace(/`(?:\\.|[^\\`])*`/g, "``");
  }

  // ─── MODULE GRAPH ───
  function buildModuleGraph(files, astMap) {
    var names = Object.keys(files || {});
    var graph = {
      modules: {},
      edges: [],           // { from, to, kind: 'import'|'require' }
      symbolEdges: [],     // { from, to, symbol }
      exportedSymbols: {}, // file → [name]
      importedSymbols: {}, // file → [{name, from}]
      reverseDeps: {}      // file → [importers]
    };

    function resolveImport(fromFile, spec) {
      if (!spec || /^https?:|\/\//.test(spec)) return null;
      var dir = fromFile.indexOf("/") >= 0 ? fromFile.replace(/\/[^/]+$/, "/") : "";
      var cands = [
        spec, spec + ".js", spec + ".ts", spec + ".mjs",
        dir + spec, dir + spec + ".js", dir + spec + ".ts",
        dir + spec.replace(/^\.\//, "") + ".js"
      ];
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i].replace(/\/\.\//g, "/");
        if (names.indexOf(c) !== -1) return c;
        var base = c.split("/").pop();
        for (var j = 0; j < names.length; j++) {
          if (names[j].split("/").pop() === base) return names[j];
        }
      }
      return null;
    }

    names.forEach(function (n) {
      var a = (astMap && astMap[n]) || {};
      var exports = (a.exports || []).map(function (e) { return e.name; });
      var imports = a.imports || [];
      graph.modules[n] = {
        path: n,
        exports: exports,
        imports: [],
        functions: (a.functions || []).map(function (f) { return f.name; }),
        hasSources: !!(a.sources && a.sources.length),
        hasSinks: !!(a.sinks && a.sinks.length)
      };
      graph.exportedSymbols[n] = exports;
      graph.importedSymbols[n] = [];
      graph.reverseDeps[n] = graph.reverseDeps[n] || [];

      imports.forEach(function (imp) {
        var resolved = resolveImport(n, imp.from);
        var entry = { spec: imp.from, resolved: resolved, names: imp.names || "", line: imp.line || 0 };
        graph.modules[n].imports.push(entry);
        if (resolved) {
          graph.edges.push({ from: n, to: resolved, kind: "import", line: imp.line || 0 });
          graph.reverseDeps[resolved] = graph.reverseDeps[resolved] || [];
          if (graph.reverseDeps[resolved].indexOf(n) === -1) graph.reverseDeps[resolved].push(n);
          // named imports heuristic
          var nm = (imp.names || "").replace(/[{}]/g, " ").split(/[\s,]+/).filter(Boolean);
          nm.forEach(function (sym) {
            if (sym === "from" || sym === "as" || sym === "default" || sym === "*") return;
            graph.importedSymbols[n].push({ name: sym, from: resolved });
            graph.symbolEdges.push({ from: resolved, to: n, symbol: sym });
          });
        }
      });
    });

    return graph;
  }

  // ─── CFG (lightweight, per-file) ───
  function buildCFG(content, fileName) {
    var lines = String(content || "").split("\n");
    var nodes = [];
    var edges = [];
    var issues = []; // control-flow findings as evidence candidates
    var stack = []; // block stack: {type, start, branch}
    var i;

    function addNode(type, line, extra) {
      var id = nodes.length;
      nodes.push({ id: id, type: type, line: line, file: fileName || "", extra: extra || {} });
      return id;
    }

    var entry = addNode("entry", 1);
    var prev = entry;
    var returnSeenInFn = false;
    var fnDepth = 0;
    var unreachableFrom = null;

    for (i = 0; i < lines.length; i++) {
      var L = lines[i];
      var ln = i + 1;
      var t = L.trim();
      if (!t) continue;

      // function boundary
      if (/^(?:async\s+)?function\b/.test(t) || /=>\s*\{/.test(t) || /^(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(?:function|\()/.test(t)) {
        if (fnDepth === 0) returnSeenInFn = false;
        fnDepth++;
        var fid = addNode("function", ln, { text: t.slice(0, 60) });
        edges.push({ from: prev, to: fid, kind: "seq" });
        prev = fid;
        stack.push({ type: "function", start: fid, line: ln });
        unreachableFrom = null;
        continue;
      }

      // closing brace ends block
      if (t === "}" || t.indexOf("}") === 0) {
        if (stack.length) {
          var blk = stack.pop();
          var endId = addNode("block_end", ln, { of: blk.type });
          edges.push({ from: prev, to: endId, kind: "seq" });
          prev = endId;
          if (blk.type === "function") {
            fnDepth = Math.max(0, fnDepth - 1);
            returnSeenInFn = false;
            unreachableFrom = null;
          }
          if (blk.type === "if" || blk.type === "else") {
            // merge point conceptually
          }
        }
        continue;
      }

      // return
      if (/^return\b/.test(t)) {
        var rid = addNode("return", ln, { text: t.slice(0, 80) });
        edges.push({ from: prev, to: rid, kind: "seq" });
        if (unreachableFrom != null) {
          issues.push({
            type: "unreachable",
            file: fileName,
            line: ln,
            explanation: "Code after return may be unreachable",
            controlPath: ["return@" + unreachableFrom, "stmt@" + ln]
          });
        }
        prev = rid;
        returnSeenInFn = true;
        unreachableFrom = ln;
        continue;
      }

      // throw
      if (/^throw\b/.test(t)) {
        var tid = addNode("throw", ln);
        edges.push({ from: prev, to: tid, kind: "seq" });
        prev = tid;
        unreachableFrom = ln;
        continue;
      }

      // if / else if / else
      if (/^if\s*\(/.test(t) || /^else\s+if\s*\(/.test(t)) {
        var condMatch = t.match(/if\s*\((.+)\)/);
        var cond = condMatch ? condMatch[1].trim() : "";
        var iid = addNode("if", ln, { cond: cond });
        edges.push({ from: prev, to: iid, kind: "seq" });
        // detect always-true / always-false
        if (/^(true|1)\s*$/.test(cond) || /^\s*true\s*$/.test(cond)) {
          issues.push({
            type: "always_true",
            file: fileName,
            line: ln,
            explanation: "Condition always true: if (" + cond + ")",
            controlPath: ["if@" + ln],
            cond: cond
          });
        }
        if (/^(false|0|null|undefined)\s*$/.test(cond)) {
          issues.push({
            type: "always_false",
            file: fileName,
            line: ln,
            explanation: "Condition always false: if (" + cond + ") — branch unreachable",
            controlPath: ["if@" + ln],
            cond: cond
          });
        }
        // null check patterns for symbolic
        if (/\w+\s*!=\s*null|\w+\s*!==\s*null|\w+\s*!=\s*undefined|\w+\s*!==\s*undefined/.test(cond)) {
          issues.push({
            type: "null_guard",
            file: fileName,
            line: ln,
            explanation: "Null/undefined guard present",
            controlPath: ["if@" + ln],
            cond: cond,
            symbolic: true
          });
        }
        if (/\w+\s*==\s*null|\w+\s*===\s*null|\w+\s*==\s*undefined/.test(cond)) {
          issues.push({
            type: "null_check",
            file: fileName,
            line: ln,
            explanation: "Explicit null/undefined equality check",
            controlPath: ["if@" + ln],
            cond: cond,
            symbolic: true
          });
        }
        prev = iid;
        stack.push({ type: "if", start: iid, line: ln, cond: cond });
        unreachableFrom = null;
        continue;
      }

      if (/^else\b/.test(t)) {
        var eid = addNode("else", ln);
        edges.push({ from: prev, to: eid, kind: "branch" });
        prev = eid;
        stack.push({ type: "else", start: eid, line: ln });
        unreachableFrom = null;
        continue;
      }

      // loops
      if (/^(for|while|do)\b/.test(t)) {
        var lid = addNode("loop", ln, { text: t.slice(0, 60) });
        edges.push({ from: prev, to: lid, kind: "seq" });
        prev = lid;
        stack.push({ type: "loop", start: lid, line: ln });
        unreachableFrom = null;
        continue;
      }

      // try/catch/finally
      if (/^try\b/.test(t)) {
        var tr = addNode("try", ln);
        edges.push({ from: prev, to: tr, kind: "seq" });
        prev = tr;
        stack.push({ type: "try", start: tr, line: ln });
        unreachableFrom = null;
        continue;
      }
      if (/^catch\b/.test(t)) {
        var emptyCatch = /\{\s*\}/.test(t) || (i + 1 < lines.length && /^\s*\}\s*$/.test(lines[i + 1]));
        var cid = addNode("catch", ln, { empty: emptyCatch });
        edges.push({ from: prev, to: cid, kind: "exception" });
        if (emptyCatch || (i + 1 < lines.length && lines[i + 1].trim() === "}")) {
          issues.push({
            type: "empty_catch",
            file: fileName,
            line: ln,
            explanation: "Empty catch swallows errors — missing error path handling",
            controlPath: ["catch@" + ln]
          });
        }
        prev = cid;
        stack.push({ type: "catch", start: cid, line: ln });
        unreachableFrom = null;
        continue;
      }
      if (/^finally\b/.test(t)) {
        var fid2 = addNode("finally", ln);
        edges.push({ from: prev, to: fid2, kind: "seq" });
        prev = fid2;
        continue;
      }

      // switch
      if (/^switch\s*\(/.test(t)) {
        var sid = addNode("switch", ln);
        edges.push({ from: prev, to: sid, kind: "seq" });
        prev = sid;
        stack.push({ type: "switch", start: sid, line: ln });
        continue;
      }

      // break / continue
      if (/^(break|continue)\b/.test(t)) {
        var bc = addNode(t.indexOf("break") === 0 ? "break" : "continue", ln);
        edges.push({ from: prev, to: bc, kind: "seq" });
        prev = bc;
        continue;
      }

      // generic statement — mark unreachable if after return/throw
      if (unreachableFrom != null && !/^\/\//.test(t) && t !== "{" ) {
        // only flag if clearly sequential code (not closing braces handled above)
        if (!/^(case|default|else)\b/.test(t)) {
          issues.push({
            type: "unreachable",
            file: fileName,
            line: ln,
            explanation: "Statement may be unreachable after return/throw at line " + unreachableFrom,
            controlPath: ["exit@" + unreachableFrom, "stmt@" + ln]
          });
          // only report once per block
          unreachableFrom = null;
        }
      }

      var stmt = addNode("stmt", ln);
      edges.push({ from: prev, to: stmt, kind: "seq" });
      prev = stmt;
    }

    var exit = addNode("exit", lines.length || 1);
    edges.push({ from: prev, to: exit, kind: "seq" });

    return { file: fileName || "", nodes: nodes, edges: edges, issues: issues };
  }

  // ─── LIMITED SYMBOLIC EXECUTION ───
  function symbolicAnalyze(content, fileName, cfgIssues) {
    var lines = String(content || "").split("\n");
    var facts = []; // {line, symbol, value, branch}
    var findings = [];
    var i;

    for (i = 0; i < lines.length; i++) {
      var L = lines[i];
      var ln = i + 1;
      var t = L.trim();

      // assignments of known constants
      var am = t.match(/^(?:(?:var|let|const)\s+)?(\w+)\s*=\s*(null|undefined|true|false|0|""|'')\s*;?/);
      if (am) {
        facts.push({ line: ln, symbol: am[1], value: am[2], kind: "const" });
      }

      // if (x) / if (!x) / if (x != null)
      var im = t.match(/^if\s*\(\s*(!?)\s*(\w+)\s*\)/);
      if (im) {
        var neg = im[1] === "!";
        var sym = im[2];
        // look for prior const fact
        for (var f = facts.length - 1; f >= 0; f--) {
          if (facts[f].symbol === sym) {
            var v = facts[f].value;
            var isFalsy = (v === "null" || v === "undefined" || v === "false" || v === "0" || v === '""' || v === "''");
            if (!neg && isFalsy) {
              findings.push({
                type: "impossible_then",
                file: fileName,
                line: ln,
                symbol: sym,
                value: v,
                explanation: "Then-branch unreachable: " + sym + " is " + v,
                controlPath: ["assign@" + facts[f].line, "if@" + ln]
              });
            }
            if (neg && !isFalsy && (v === "true")) {
              findings.push({
                type: "impossible_then",
                file: fileName,
                line: ln,
                symbol: sym,
                value: v,
                explanation: "Then-branch unreachable: !" + sym + " with " + sym + "=" + v,
                controlPath: ["assign@" + facts[f].line, "if@" + ln]
              });
            }
            break;
          }
        }
      }

      // use after null without guard — simple sequential scan
      var useNull = t.match(/^(\w+)\s*\./);
      if (useNull) {
        var usym = useNull[1];
        for (var g = facts.length - 1; g >= 0; g--) {
          if (facts[g].symbol === usym && (facts[g].value === "null" || facts[g].value === "undefined")) {
            // check if a guard exists between fact and use
            var guarded = false;
            for (var h = 0; h < (cfgIssues || []).length; h++) {
              var ci = cfgIssues[h];
              if (ci.symbolic && ci.line > facts[g].line && ci.line < ln && ci.cond && ci.cond.indexOf(usym) !== -1) {
                guarded = true;
                break;
              }
            }
            // also check lines between for if (usym)
            if (!guarded) {
              for (var k = facts[g].line; k < ln - 1; k++) {
                if (new RegExp("if\\s*\\(\\s*!" + usym + "\\s*\\)|if\\s*\\(\\s*" + usym + "\\s*\\)|" + usym + "\\s*!=\\s*null|" + usym + "\\s*!==\\s*null").test(lines[k] || "")) {
                  guarded = true;
                  break;
                }
              }
            }
            if (!guarded) {
              findings.push({
                type: "null_deref",
                file: fileName,
                line: ln,
                symbol: usym,
                value: facts[g].value,
                explanation: "Possible null/undefined property access: " + usym + " assigned " + facts[g].value + " at line " + facts[g].line,
                controlPath: ["assign@" + facts[g].line, "use@" + ln]
              });
            }
            break;
          }
        }
      }
    }

    return { facts: facts, findings: findings };
  }

  // ─── DEEP DATA FLOW ───
  function deepDataFlow(model, files, moduleGraph, options) {
    options = options || {};
    var maxHops = options.maxHops || DEFAULT_MAX_HOPS;
    var flows = [];
    var fileNames = Object.keys(model.files || {});

    // Build per-file def-use style taint sets from sources
    fileNames.forEach(function (fname) {
      var a = model.files[fname];
      if (!a) return;
      var content = files[fname] || "";
      var sources = a.sources || [];
      var sinks = a.sinks || [];
      var assignments = a.assignments || [];
      var calls = a.calls || [];
      if (!sources.length && !sinks.length) return;

      // Seed tainted names from sources
      var tainted = {}; // name → {from, hops, via, weak}

      sources.forEach(function (src) {
        // Direct: assignment near source
        assignments.forEach(function (as) {
          var near = Math.abs((as.line || 0) - (src.line || 0)) <= 10;
          var valueHas = /location|search|hash|href|value|getItem|response|event\.data|prompt|URLSearchParams/i.test(as.value || "");
          if (near || valueHas) {
            tainted[as.target] = {
              from: src,
              hops: 1,
              via: [{ file: fname, line: as.line, target: as.target, kind: "assign" }],
              weak: false
            };
          }
        });
        // Seed anonymous direct marker
        tainted["__src_" + src.kind + "_" + src.line] = {
          from: src,
          hops: 0,
          via: [{ file: fname, line: src.line, kind: "source" }],
          weak: false
        };
      });

      // Propagate: reassignment, simple alias, property, template
      var hop;
      for (hop = 0; hop < maxHops; hop++) {
        var added = {};
        Object.keys(tainted).forEach(function (tname) {
          if (tname.indexOf("__src_") === 0) return;
          assignments.forEach(function (as) {
            if (tainted[as.target] && tainted[as.target].hops <= hop) return;
            var val = as.value || "";
            // alias / reassignment
            if (val === tname || new RegExp("\\b" + escapeRe(tname) + "\\b").test(val)) {
              added[as.target] = {
                from: tainted[tname].from,
                hops: tainted[tname].hops + 1,
                via: (tainted[tname].via || []).concat([{ file: fname, line: as.line, target: as.target, kind: "reassign" }]),
                weak: tainted[tname].weak
              };
            }
            // template / string concat involving taint
            if (val.indexOf("${") !== -1 && val.indexOf(tname) !== -1) {
              added[as.target] = {
                from: tainted[tname].from,
                hops: tainted[tname].hops + 1,
                via: (tainted[tname].via || []).concat([{ file: fname, line: as.line, target: as.target, kind: "transform" }]),
                weak: false
              };
            }
          });
        });
        Object.keys(added).forEach(function (k) {
          if (!tainted[k] || added[k].hops < tainted[k].hops) tainted[k] = added[k];
        });
      }

      // Function parameter flow (same-file): name used as arg near call of known sink-ish or stored
      // Return flow: return <tainted> then assigned to outer
      var returnTaints = [];
      var lines = content.split("\n");
      for (var li = 0; li < lines.length; li++) {
        var rm = lines[li].match(/return\s+(\w+)/);
        if (rm && tainted[rm[1]]) {
          returnTaints.push({ line: li + 1, name: rm[1], taint: tainted[rm[1]] });
        }
      }

      // Match sinks
      sinks.forEach(function (sink) {
        var matched = null;
        Object.keys(tainted).forEach(function (tname) {
          if (matched && !matched.weak) return;
          var info = tainted[tname];
          var via = info.via || [];
          var last = via[via.length - 1];
          var sinkLineText = lines[(sink.line || 1) - 1] || "";
          var nameUsed = tname.indexOf("__src_") !== 0 && new RegExp("\\b" + escapeRe(tname.split(".").pop()) + "\\b").test(sinkLineText);
          var near = last && Math.abs((last.line || 0) - (sink.line || 0)) <= 15;
          var srcNear = info.hops === 0 && Math.abs((info.from.line || 0) - (sink.line || 0)) <= 20;

          if (nameUsed || (near && info.hops >= 1) || srcNear) {
            var weak = info.weak || (!nameUsed && srcNear && info.hops === 0);
            var confBoost = weak ? 0.05 : (info.hops <= 2 ? 0.28 : info.hops <= 4 ? 0.18 : 0.1);
            matched = {
              file: fname,
              source: info.from,
              sink: sink,
              hops: info.hops,
              via: via,
              weak: weak,
              confidenceBoost: confBoost,
              flowPath: via.map(function (v) {
                return (v.kind || "step") + ":" + (v.target || "") + "@" + (v.line || 0);
              }).concat(["sink:" + sink.kind + "@" + sink.line])
            };
          }
        });

        // return-value flow into sink (same file, proximity)
        if (!matched || matched.weak) {
          returnTaints.forEach(function (rt) {
            if (Math.abs(rt.line - (sink.line || 0)) <= 25) {
              matched = {
                file: fname,
                source: rt.taint.from,
                sink: sink,
                hops: rt.taint.hops + 1,
                via: (rt.taint.via || []).concat([{ file: fname, line: rt.line, kind: "return", target: rt.name }]),
                weak: false,
                confidenceBoost: 0.2,
                flowPath: ["return:" + rt.name + "@" + rt.line, "sink:" + sink.kind + "@" + sink.line]
              };
            }
          });
        }

        if (matched) flows.push(matched);
      });
    });

    // Cross-file: only along real module edges
    if (moduleGraph && moduleGraph.edges) {
      moduleGraph.edges.forEach(function (edge) {
        var srcFile = edge.to;   // exporter often has source? actually importer uses export
        // source in exporter, sink in importer
        var aSrc = model.files[edge.to];
        var aSnk = model.files[edge.from];
        // Convention: edge.from imports edge.to
        // Source may be in either; prefer source in imported module flowing to sink in importer
        var producer = edge.to;
        var consumer = edge.from;
        var prod = model.files[producer];
        var cons = model.files[consumer];
        if (!prod || !cons) return;
        var pSources = prod.sources || [];
        var cSinks = cons.sinks || [];
        if (!pSources.length || !cSinks.length) {
          // also: source in consumer file that uses imported helper — already same-file
          // source in producer, sink in producer — same-file
          return;
        }
        // Require symbol edge or export presence
        var hasSym = (moduleGraph.symbolEdges || []).some(function (se) {
          return se.from === producer && se.to === consumer;
        });
        var hasExport = (moduleGraph.exportedSymbols[producer] || []).length > 0;
        if (!hasSym && !hasExport) return;

        cSinks.forEach(function (sink) {
          flows.push({
            file: consumer,
            sourceFile: producer,
            source: pSources[0],
            sink: sink,
            hops: 2,
            via: [
              { file: producer, kind: "export", line: (pSources[0] && pSources[0].line) || 0 },
              { file: consumer, kind: "import", line: edge.line || 0 }
            ],
            crossFile: true,
            weak: !hasSym,
            confidenceBoost: hasSym ? 0.22 : 0.08,
            flowPath: ["source@" + producer, "export→import", "sink:" + sink.kind + "@" + consumer]
          });
        });
      });
    }

    return flows;
  }

  function escapeRe(s) {
    return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ─── ORCHESTRATE Stage-1 analysis for a project ───
  function runStage1(files, astMap, options) {
    options = options || {};
    var moduleGraph = buildModuleGraph(files, astMap);
    var codeModel = null;
    if (global.ADAst && ADAst.buildCodeModel) {
      codeModel = ADAst.buildCodeModel(files, astMap);
    } else {
      codeModel = { files: astMap || {}, dataFlows: [] };
    }

    // Replace/extend data flows with deep analysis
    var deepFlows = deepDataFlow(codeModel, files, moduleGraph, { maxHops: options.maxHops || DEFAULT_MAX_HOPS });
    codeModel.dataFlows = deepFlows;
    codeModel.moduleGraph = moduleGraph;

    // CFG + symbolic per JS file (lazy: only files with content)
    var cfgMap = {};
    var symbolicMap = {};
    var cfgIssues = [];
    var symbolicFindings = [];
    Object.keys(files || {}).forEach(function (n) {
      var ext = (n.split(".").pop() || "").toLowerCase();
      if (["js", "ts", "jsx", "tsx", "mjs"].indexOf(ext) === -1) return;
      var cfg = buildCFG(files[n], n);
      cfgMap[n] = cfg;
      (cfg.issues || []).forEach(function (iss) { cfgIssues.push(iss); });
      var sym = symbolicAnalyze(files[n], n, cfg.issues);
      symbolicMap[n] = sym;
      (sym.findings || []).forEach(function (f) { symbolicFindings.push(f); });
    });

    codeModel.cfgMap = cfgMap;
    codeModel.symbolicMap = symbolicMap;
    codeModel.cfgIssues = cfgIssues;
    codeModel.symbolicFindings = symbolicFindings;

    return {
      codeModel: codeModel,
      moduleGraph: moduleGraph,
      dataFlows: deepFlows,
      cfgIssues: cfgIssues,
      symbolicFindings: symbolicFindings
    };
  }

  global.ADCore = {
    DEFAULT_MAX_HOPS: DEFAULT_MAX_HOPS,
    buildModuleGraph: buildModuleGraph,
    buildCFG: buildCFG,
    symbolicAnalyze: symbolicAnalyze,
    deepDataFlow: deepDataFlow,
    runStage1: runStage1
  };
})(typeof window !== "undefined" ? window : globalThis);
