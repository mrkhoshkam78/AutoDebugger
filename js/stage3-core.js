/**
 * Auto Debugger V6 Stage-3 Core
 * Multi-Engine Correlation · Evidence Graph · Adaptive Orchestrator ·
 * Contradiction · DOM Static Analysis · Git History · Hotspot · Adaptive Confidence
 * Browser-only. Static analysis only — never claims real runtime execution.
 */
(function (global) {
  "use strict";

  var ENGINE_BUDGET = {
    simple: ["ast", "validation"],
    medium: ["ast", "cfg", "symbolic", "validation"],
    security: ["dataflow", "module", "dom", "testgen", "validation"],
    complex: ["dataflow", "cfg", "symbolic", "dependency", "regression", "rootcause", "correlation"]
  };

  var CONF_FLOOR = 0.15;
  var CONF_CEIL = 0.98;

  // ═══════════════════════════════════════════
  // EVIDENCE NORMALIZATION
  // ═══════════════════════════════════════════
  function normalizeEvidence(raw, engine) {
    if (!raw) return null;
    var e = {
      id: raw.id || ("ev_" + engine + "_" + (raw.line || 0) + "_" + Math.random().toString(36).slice(2, 7)),
      engine: engine || raw.engine || "unknown",
      type: (raw.type || raw.kind || "generic").toLowerCase(),
      file: raw.file || raw.file_name || "",
      line: raw.line || 0,
      endLine: raw.endLine || raw.line || 0,
      symbol: raw.symbol || raw.name || "",
      function: raw.function || raw.fn || "",
      source: raw.source || null,
      sink: raw.sink || null,
      transformation: raw.transformation || null,
      controlCondition: raw.controlCondition || raw.cond || null,
      snippet: (raw.snippet || raw.detail || raw.explanation || "").slice(0, 200),
      strength: typeof raw.strength === "number" ? raw.strength : (raw.confidence || 0.5),
      flowPath: raw.flowPath || raw.via || [],
      meta: raw.meta || {}
    };
    if (e.strength > 1) e.strength = e.strength / 100;
    e.strength = Math.max(0, Math.min(1, e.strength));
    return e;
  }

  function collectEngineEvidence(ctx) {
    var list = [];
    var files = ctx.files || {};
    var codeModel = ctx.codeModel || {};
    var moduleGraph = ctx.moduleGraph || {};
    var cfgIssues = ctx.cfgIssues || [];
    var symbolicFindings = ctx.symbolicFindings || [];
    var problems = ctx.problems || [];
    var stage2 = ctx.stage2 || {};
    var domFindings = ctx.domFindings || [];

    // AST / structure
    Object.keys(codeModel.files || codeModel.symbolTable || {}).forEach(function () {});
    if (codeModel.symbolTable) {
      Object.keys(codeModel.symbolTable).forEach(function (sym) {
        (codeModel.symbolTable[sym] || []).forEach(function (loc) {
          list.push(normalizeEvidence({
            type: "ast_symbol", file: loc.file, line: loc.line, symbol: sym,
            strength: 0.4, snippet: "symbol " + sym
          }, "ast"));
        });
      });
    }

    // Data Flow
    (codeModel.dataFlows || []).forEach(function (f) {
      list.push(normalizeEvidence({
        type: "dataflow",
        file: f.file || (f.sink && f.sink.file) || "",
        line: (f.sink && f.sink.line) || f.line || 0,
        source: f.source,
        sink: f.sink,
        flowPath: f.flowPath || f.via || [],
        strength: f.weak ? 0.45 : 0.72,
        snippet: "source→sink hops=" + (f.hops || 1),
        meta: { hops: f.hops, crossFile: !!f.crossFile, weak: !!f.weak }
      }, "dataflow"));
    });

    // CFG
    cfgIssues.forEach(function (iss) {
      list.push(normalizeEvidence({
        type: "cfg_" + (iss.type || "issue"),
        file: iss.file, line: iss.line,
        controlCondition: iss.cond,
        strength: iss.type === "unreachable" ? 0.7 : 0.55,
        snippet: iss.explanation || iss.type,
        flowPath: iss.controlPath || []
      }, "cfg"));
    });

    // Symbolic
    symbolicFindings.forEach(function (sf) {
      list.push(normalizeEvidence({
        type: "symbolic",
        file: sf.file, line: sf.line,
        symbol: sf.symbol,
        strength: 0.6,
        snippet: sf.explanation || "symbolic fact",
        meta: { value: sf.value }
      }, "symbolic"));
    });

    // Module / dependency
    (moduleGraph.edges || []).forEach(function (e) {
      list.push(normalizeEvidence({
        type: "import_edge",
        file: e.to || e.from, line: e.line || 0,
        strength: 0.35,
        snippet: (e.from || "") + " → " + (e.to || ""),
        meta: { kind: e.kind }
      }, "module"));
    });

    // Stage-2 tests
    (stage2.generatedTests || []).forEach(function (t) {
      list.push(normalizeEvidence({
        type: "test",
        file: (t.target || "").split(":")[0],
        line: parseInt((t.target || "").split(":")[1], 10) || 0,
        strength: t.confidence || 0.55,
        snippet: t.reasoning || t.expectedBehavior,
        meta: { testId: t.testId, kind: t.kind }
      }, "testgen"));
    });

    // Mutations
    if (stage2.mutations && stage2.mutations.items) {
      stage2.mutations.items.forEach(function (m) {
        list.push(normalizeEvidence({
          type: "mutation_" + (m.status || "unknown").toLowerCase(),
          file: m.file, line: m.line || 0,
          strength: m.status === "KILLED" ? 0.65 : 0.35,
          snippet: m.type + " → " + m.status,
          meta: { mutationId: m.id }
        }, "mutation"));
      });
    }

    // Dependency / API findings already as problems or stage2
    (stage2.dependencyFindings || []).forEach(function (d) {
      list.push(normalizeEvidence({
        type: "dependency",
        file: d.file, line: d.line || 0,
        strength: 0.5,
        snippet: d.detail || d.kind
      }, "dependency"));
    });
    (stage2.apiFindings || []).forEach(function (a) {
      list.push(normalizeEvidence({
        type: "api_contract",
        file: a.file, line: a.line || 0,
        strength: 0.55,
        snippet: a.detail || a.kind
      }, "dependency"));
    });

    // DOM evidence
    domFindings.forEach(function (d) {
      list.push(normalizeEvidence({
        type: d.type || "dom",
        file: d.file, line: d.line,
        symbol: d.selector || d.symbol,
        sink: d.sink,
        source: d.source,
        strength: d.strength || 0.6,
        snippet: d.detail || d.explanation,
        meta: d.meta || {}
      }, "dom"));
    });

    // Existing problem evidence
    problems.forEach(function (p) {
      (p.evidence_list || p.evidence || []).forEach(function (ev) {
        var n = normalizeEvidence(ev, ev.engine || "strategy");
        if (n) {
          n.meta = n.meta || {};
          n.meta.problemId = p.problem_id || p.problemId;
          list.push(n);
        }
      });
    });

    return list;
  }

  // ═══════════════════════════════════════════
  // EVIDENCE GRAPH
  // ═══════════════════════════════════════════
  function createEvidenceGraph() {
    return { nodes: {}, edges: [], byFile: {}, bySymbol: {} };
  }

  function addNode(graph, key, data) {
    if (!key) return null;
    if (!graph.nodes[key]) {
      graph.nodes[key] = Object.assign({ id: key, kind: "generic" }, data || {});
      var f = data && data.file;
      if (f) {
        if (!graph.byFile[f]) graph.byFile[f] = [];
        graph.byFile[f].push(key);
      }
      var sym = data && data.symbol;
      if (sym) {
        if (!graph.bySymbol[sym]) graph.bySymbol[sym] = [];
        graph.bySymbol[sym].push(key);
      }
    } else {
      Object.keys(data || {}).forEach(function (k) {
        if (data[k] != null && graph.nodes[key][k] == null) graph.nodes[key][k] = data[k];
      });
    }
    return graph.nodes[key];
  }

  function addEdge(graph, from, to, relation, meta) {
    if (!from || !to) return;
    graph.edges.push({
      from: from,
      to: to,
      relation: relation || "related",
      meta: meta || {}
    });
  }

  function buildEvidenceGraph(evidenceList, ctx) {
    var g = createEvidenceGraph();
    var codeModel = ctx.codeModel || {};
    var moduleGraph = ctx.moduleGraph || {};

    (evidenceList || []).forEach(function (ev) {
      if (!ev) return;
      var nodeKey = ev.id;
      addNode(g, nodeKey, {
        kind: "evidence",
        engine: ev.engine,
        type: ev.type,
        file: ev.file,
        line: ev.line,
        symbol: ev.symbol,
        strength: ev.strength,
        snippet: ev.snippet
      });

      if (ev.source) {
        var srcKey = "src:" + (ev.source.kind || "src") + ":" + (ev.source.line || 0) + ":" + (ev.file || "");
        addNode(g, srcKey, { kind: "source", file: ev.file, line: ev.source.line || 0, symbol: ev.source.kind });
        addEdge(g, srcKey, nodeKey, "reaches");
      }
      if (ev.sink) {
        var sinkKey = "sink:" + (ev.sink.kind || "sink") + ":" + (ev.sink.line || ev.line || 0) + ":" + (ev.file || "");
        addNode(g, sinkKey, { kind: "sink", file: ev.file, line: ev.sink.line || ev.line, symbol: ev.sink.kind });
        addEdge(g, nodeKey, sinkKey, "reaches");
      }
      if (ev.controlCondition) {
        var cKey = "ctrl:" + ev.file + ":" + ev.line;
        addNode(g, cKey, { kind: "control", file: ev.file, line: ev.line, symbol: ev.controlCondition });
        addEdge(g, cKey, nodeKey, "controls");
      }
      (ev.flowPath || []).forEach(function (step, i) {
        var sk = "step:" + String(step).slice(0, 40) + ":" + i;
        addNode(g, sk, { kind: "flow_step", snippet: String(step) });
        if (i > 0) {
          var prev = "step:" + String(ev.flowPath[i - 1]).slice(0, 40) + ":" + (i - 1);
          addEdge(g, prev, sk, "propagates");
        }
      });
    });

    // Module edges
    (moduleGraph.edges || []).forEach(function (e) {
      var fromK = "mod:" + (e.from || "");
      var toK = "mod:" + (e.to || "");
      addNode(g, fromK, { kind: "module", file: e.from });
      addNode(g, toK, { kind: "module", file: e.to });
      addEdge(g, fromK, toK, "imports", { line: e.line });
    });

    // Call / assign from code model (lightweight)
    if (codeModel.callMap || codeModel.functionMap) {
      Object.keys(codeModel.functionMap || {}).forEach(function (fn) {
        (codeModel.functionMap[fn] || []).forEach(function (loc) {
          addNode(g, "fn:" + fn + "@" + loc.file, {
            kind: "function", file: loc.file, line: loc.line, symbol: fn
          });
        });
      });
    }

    return g;
  }

  // ═══════════════════════════════════════════
  // CORRELATION ENGINE
  // ═══════════════════════════════════════════
  function correlateEvidence(evidenceList, graph, problems) {
    var clusters = [];
    var byLoc = {}; // file:line → [evidence]
    (evidenceList || []).forEach(function (ev) {
      if (!ev || !ev.file) return;
      var key = ev.file + ":" + (ev.line || 0);
      if (!byLoc[key]) byLoc[key] = [];
      byLoc[key].push(ev);
    });

    // Also group by nearby lines (±3) and same symbol
    var used = {};
    Object.keys(byLoc).forEach(function (key) {
      if (used[key]) return;
      var parts = key.split(":");
      var file = parts[0];
      var line = parseInt(parts[1], 10) || 0;
      var group = byLoc[key].slice();
      used[key] = true;

      for (var d = 1; d <= 3; d++) {
        var k2 = file + ":" + (line + d);
        var k3 = file + ":" + (line - d);
        if (byLoc[k2] && !used[k2]) {
          group = group.concat(byLoc[k2]);
          used[k2] = true;
        }
        if (byLoc[k3] && !used[k3]) {
          group = group.concat(byLoc[k3]);
          used[k3] = true;
        }
      }

      if (group.length < 1) return;

      var engines = {};
      var types = {};
      var maxStrength = 0;
      var hasDataflow = false;
      var hasCfg = false;
      var hasDom = false;
      var hasTest = false;
      var hasSymbolic = false;
      group.forEach(function (e) {
        engines[e.engine] = true;
        types[e.type] = true;
        if (e.strength > maxStrength) maxStrength = e.strength;
        if (e.engine === "dataflow" || e.type.indexOf("dataflow") >= 0) hasDataflow = true;
        if (e.engine === "cfg" || e.type.indexOf("cfg") >= 0) hasCfg = true;
        if (e.engine === "dom") hasDom = true;
        if (e.engine === "testgen" || e.type === "test") hasTest = true;
        if (e.engine === "symbolic") hasSymbolic = true;
      });

      var engineCount = Object.keys(engines).length;
      var agreement = engineCount >= 2;
      var contradictions = detectContradictions(group);

      clusters.push({
        location: key,
        file: file,
        line: line,
        evidence: group,
        engines: Object.keys(engines),
        engineCount: engineCount,
        types: Object.keys(types),
        maxStrength: maxStrength,
        agreement: agreement,
        contradictions: contradictions,
        signals: { dataflow: hasDataflow, cfg: hasCfg, dom: hasDom, test: hasTest, symbolic: hasSymbolic }
      });
    });

    // Link clusters to existing problems
    (problems || []).forEach(function (p) {
      var pf = p.file_name || p.file || "";
      var pl = p.line || 0;
      clusters.forEach(function (c) {
        if (c.file === pf && Math.abs(c.line - pl) <= 3) {
          c.linkedProblemId = p.problem_id || p.problemId;
        }
      });
    });

    return clusters;
  }

  function detectContradictions(group) {
    var cons = [];
    var hasReach = group.some(function (e) {
      return e.type === "dataflow" || (e.flowPath && e.flowPath.length);
    });
    var hasUnreach = group.some(function (e) {
      return e.type === "cfg_unreachable" || (e.snippet || "").toLowerCase().indexOf("unreachable") >= 0;
    });
    if (hasReach && hasUnreach) {
      cons.push({
        kind: "reachability",
        detail: "Data-flow claims path reaches sink while CFG marks path unreachable",
        engines: ["dataflow", "cfg"]
      });
    }

    var hasAlwaysFalse = group.some(function (e) {
      return (e.snippet || "").toLowerCase().indexOf("always false") >= 0 || e.type === "cfg_always_false";
    });
    if (hasAlwaysFalse && hasReach) {
      cons.push({
        kind: "dead_path",
        detail: "Flow claimed on always-false condition",
        engines: ["dataflow", "cfg"]
      });
    }
    return cons;
  }

  // ═══════════════════════════════════════════
  // ADAPTIVE CONFIDENCE
  // ═══════════════════════════════════════════
  function adaptiveConfidence(base, cluster, validationPass) {
    var score = typeof base === "number" ? base : 0.35;
    if (score > 1) score = score / 100;

    if (!cluster) {
      return Math.max(CONF_FLOOR, Math.min(CONF_CEIL, score));
    }

    // Stage-wise boosts from real evidence only
    if (cluster.signals && cluster.signals.dataflow) score += 0.12;
    if (cluster.signals && cluster.signals.cfg) score += 0.08;
    if (cluster.signals && cluster.signals.symbolic) score += 0.07;
    if (cluster.signals && cluster.signals.dom) score += 0.1;
    if (cluster.signals && cluster.signals.test) score += 0.06;
    if (cluster.engineCount >= 2) score += 0.06;
    if (cluster.engineCount >= 3) score += 0.05;
    if (cluster.maxStrength >= 0.7) score += 0.04;

    // Contradiction penalty
    if (cluster.contradictions && cluster.contradictions.length) {
      score -= 0.18 * cluster.contradictions.length;
    }

    if (validationPass === true) score += 0.08;
    if (validationPass === false) score -= 0.12;

    return Math.max(CONF_FLOOR, Math.min(CONF_CEIL, score));
  }

  // ═══════════════════════════════════════════
  // ADAPTIVE ORCHESTRATOR
  // ═══════════════════════════════════════════
  function estimateComplexity(candidate) {
    var section = (candidate.section || candidate.type || "").toLowerCase();
    var desc = (candidate.description || candidate.problem || "").toLowerCase();
    var id = (candidate.simpleId || candidate.ruleId || "").toLowerCase();
    var text = section + " " + desc + " " + id;

    if (/xss|innerhtml|eval|sink|source|security|dom.?xss/.test(text)) return "security";
    if (/null|undefined|deref|unreachable|always.?true|always.?false|symbolic|cfg/.test(text)) return "medium";
    if (/cycle|dependency|api.?contract|cross.?file|regression|root.?cause|complex/.test(text)) return "complex";
    if (/syntax|style|doctype|unclosed|comment|string/.test(text)) return "simple";
    // default by severity hint
    if ((candidate.severity || "").toLowerCase() === "critical" || candidate.severity === "high") return "complex";
    return "medium";
  }

  function selectEngines(complexity) {
    return ENGINE_BUDGET[complexity] || ENGINE_BUDGET.medium;
  }

  function orchestrateCandidate(candidate, ctx) {
    var complexity = estimateComplexity(candidate);
    var engines = selectEngines(complexity);
    return {
      candidateId: candidate.problem_id || candidate.id || "",
      complexity: complexity,
      plan: engines,
      risk: complexity === "security" || complexity === "complex" ? "high" : (complexity === "medium" ? "medium" : "low"),
      availableEvidence: (ctx && ctx.evidenceList) ? ctx.evidenceList.length : 0
    };
  }

  // ═══════════════════════════════════════════
  // DOM STATIC ANALYSIS (deeper)
  // ═══════════════════════════════════════════
  var DOM_QUERY_RE = /\b(document\.)?(querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName|getElementsByName)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  var DOM_CREATE_RE = /\bdocument\.createElement\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  var DOM_MUTATE_RE = /\.(appendChild|removeChild|replaceChildren|insertBefore|replaceChild|prepend|append)\s*\(/g;
  var DOM_SINK_RE = /\.(innerHTML|outerHTML|insertAdjacentHTML|textContent|innerText|setAttribute)\s*=/g;
  var DOM_EVENT_RE = /\.(addEventListener|onclick|onload|onerror|onchange|onsubmit)\s*[=(]/g;
  var HTML_ID_RE = /\bid\s*=\s*["']([^"']+)["']/gi;
  var HTML_CLASS_RE = /\bclass\s*=\s*["']([^"']+)["']/gi;

  function analyzeDOM(files, codeModel, astMap) {
    var findings = [];
    var htmlIds = {};
    var htmlClasses = {};
    var htmlFiles = [];

    Object.keys(files || {}).forEach(function (fname) {
      var content = files[fname] || "";
      var ext = (fname.split(".").pop() || "").toLowerCase();
      if (ext === "html" || ext === "htm" || /<html[\s>]/i.test(content.slice(0, 500))) {
        htmlFiles.push(fname);
        var m;
        HTML_ID_RE.lastIndex = 0;
        while ((m = HTML_ID_RE.exec(content))) {
          htmlIds[m[1]] = { file: fname, line: content.slice(0, m.index).split("\n").length };
        }
        HTML_CLASS_RE.lastIndex = 0;
        while ((m = HTML_CLASS_RE.exec(content))) {
          m[1].split(/\s+/).forEach(function (c) {
            if (c) htmlClasses[c] = { file: fname, line: content.slice(0, m.index).split("\n").length };
          });
        }
      }
    });

    Object.keys(files || {}).forEach(function (fname) {
      var content = files[fname] || "";
      var ext = (fname.split(".").pop() || "").toLowerCase();
      if (ext !== "js" && ext !== "ts" && ext !== "mjs" && ext !== "jsx" && ext !== "tsx") return;
      if (ext === "css") return;

      // Original content for selector string capture; stripped for sink scan (ignore comments)
      var code = content;
      var stripped = content;
      if (global.ADAst && ADAst.stripNoise) stripped = ADAst.stripNoise(content);
      else {
        stripped = String(content || "")
          .replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, " "); })
          .replace(/\/\/[^\n]*/g, "")
          .replace(/'(?:\\.|[^\\'])*'/g, "''")
          .replace(/"(?:\\.|[^\\"])*"/g, '""')
          .replace(/`(?:\\.|[^\\`])*`/g, "``");
      }
      var m;

      // Selector existence checks (use original so quoted selectors remain)
      DOM_QUERY_RE.lastIndex = 0;
      while ((m = DOM_QUERY_RE.exec(code))) {
        var method = m[2];
        var selector = m[3];
        var line = content.slice(0, m.index).split("\n").length;
        var exists = false;
        var detail = "";

        if (method === "getElementById") {
          exists = !!htmlIds[selector];
          detail = exists ? "ID found in HTML" : "ID '" + selector + "' not found in any HTML";
        } else if (method === "getElementsByClassName") {
          exists = !!htmlClasses[selector];
          detail = exists ? "Class found in HTML" : "Class '" + selector + "' not found in any HTML";
        } else if (method === "querySelector" || method === "querySelectorAll") {
          if (selector.charAt(0) === "#") {
            exists = !!htmlIds[selector.slice(1)];
            detail = exists ? "ID selector matches HTML" : "querySelector('" + selector + "') — ID not in HTML";
          } else if (selector.charAt(0) === ".") {
            exists = !!htmlClasses[selector.slice(1).split(/[.\s#:\[\]]/)[0]];
            detail = exists ? "Class selector matches HTML" : "querySelector('" + selector + "') — class not in HTML";
          } else {
            // tag or complex — cannot prove missing without full HTML parse; skip strong finding
            continue;
          }
        } else {
          continue;
        }

        if (!exists && htmlFiles.length > 0) {
          findings.push({
            type: "dom_selector_missing",
            file: fname,
            line: line,
            selector: selector,
            strength: 0.62,
            detail: detail,
            explanation: method + "('" + selector + "') may return null — element not present in project HTML",
            meta: { method: method, htmlFiles: htmlFiles }
          });
        } else if (exists) {
          findings.push({
            type: "dom_selector_valid",
            file: fname,
            line: line,
            selector: selector,
            strength: 0.4,
            detail: detail,
            explanation: "Selector resolves to HTML element",
            meta: { method: method, valid: true }
          });
        }
      }

      // Unsafe sinks without proven source are candidates only (strength moderated)
      DOM_SINK_RE.lastIndex = 0;
      while ((m = DOM_SINK_RE.exec(stripped))) {
        var sinkKind = m[1];
        var line2 = content.slice(0, m.index).split("\n").length;
        var isUnsafe = /innerHTML|outerHTML|insertAdjacentHTML/.test(sinkKind);
        var isSafeText = /textContent|innerText/.test(sinkKind);

        // Check nearby assignment value for literal vs variable
        var slice = code.slice(Math.max(0, m.index - 20), m.index + 80);
        var litMatch = /=\s*["'`]/.test(slice);
        var varMatch = /=\s*([A-Za-z_$][\w$]*)/.exec(slice);

        if (isUnsafe && !litMatch) {
          findings.push({
            type: "dom_sink",
            file: fname,
            line: line2,
            sink: { kind: sinkKind, line: line2 },
            strength: litMatch ? 0.25 : 0.55,
            detail: sinkKind + " assignment" + (varMatch ? " from variable" : ""),
            explanation: isUnsafe ? "DOM HTML sink — requires data-flow confirmation for XSS" : "text sink",
            meta: { literal: litMatch, variable: varMatch ? varMatch[1] : null }
          });
        }
        if (isSafeText) {
          findings.push({
            type: "dom_safe_sink",
            file: fname,
            line: line2,
            sink: { kind: sinkKind, line: line2 },
            strength: 0.3,
            detail: "Safe text sink " + sinkKind,
            explanation: "textContent/innerText does not parse HTML"
          });
        }
      }

      // Event listeners (presence only)
      DOM_EVENT_RE.lastIndex = 0;
      var eventCount = 0;
      while ((m = DOM_EVENT_RE.exec(stripped)) && eventCount < 20) {
        eventCount++;
        var line3 = content.slice(0, m.index).split("\n").length;
        findings.push({
          type: "dom_event",
          file: fname,
          line: line3,
          strength: 0.35,
          detail: "Event binding " + m[1],
          explanation: "Event handler registration detected"
        });
      }

      // createElement tracking (lifecycle signal)
      DOM_CREATE_RE.lastIndex = 0;
      while ((m = DOM_CREATE_RE.exec(stripped))) {
        var line4 = content.slice(0, m.index).split("\n").length;
        findings.push({
          type: "dom_create",
          file: fname,
          line: line4,
          symbol: m[1],
          strength: 0.35,
          detail: "createElement('" + m[1] + "')",
          explanation: "Dynamic element creation"
        });
      }
    });

    // Correlate DOM sinks with data-flow if available
    if (codeModel && codeModel.dataFlows) {
      codeModel.dataFlows.forEach(function (f) {
        if (f.sink && /innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(f.sink.kind || "")) {
          findings.push({
            type: "dom_dataflow_sink",
            file: f.file || (f.sink && f.sink.file) || "",
            line: (f.sink && f.sink.line) || f.line || 0,
            source: f.source,
            sink: f.sink,
            strength: f.weak ? 0.5 : 0.78,
            detail: "SOURCE → DOM sink via data-flow",
            explanation: "Untrusted data reaches DOM HTML sink",
            flowPath: f.flowPath || [],
            meta: { hops: f.hops, crossFile: !!f.crossFile }
          });
        }
      });
    }

    return findings;
  }

  // ═══════════════════════════════════════════
  // GIT HISTORY ANALYSIS (metadata only)
  // ═══════════════════════════════════════════
  function analyzeGitHistory(gitMeta) {
    if (!gitMeta || typeof gitMeta !== "object") {
      return { status: "NOT_AVAILABLE", hotspots: [], changedFiles: [], message: "No Git metadata provided" };
    }

    var files = gitMeta.files || gitMeta.changedFiles || [];
    var commits = gitMeta.commits || [];
    var lineChanges = gitMeta.lineChanges || gitMeta.blame || {};

    if (!files.length && !commits.length && !Object.keys(lineChanges).length) {
      return { status: "NOT_AVAILABLE", hotspots: [], changedFiles: [], message: "Empty Git metadata" };
    }

    var freq = {};
    files.forEach(function (f) {
      var name = typeof f === "string" ? f : (f.path || f.file || "");
      if (!name) return;
      freq[name] = (freq[name] || 0) + (f.count || 1);
    });
    commits.forEach(function (c) {
      (c.files || []).forEach(function (f) {
        var name = typeof f === "string" ? f : (f.path || f.file || "");
        if (name) freq[name] = (freq[name] || 0) + 1;
      });
    });

    var hotspots = Object.keys(freq).map(function (name) {
      return {
        file: name,
        changeFrequency: freq[name],
        lines: lineChanges[name] || null
      };
    }).sort(function (a, b) { return b.changeFrequency - a.changeFrequency; });

    return {
      status: "AVAILABLE",
      hotspots: hotspots.slice(0, 50),
      changedFiles: Object.keys(freq),
      recurringAreas: hotspots.filter(function (h) { return h.changeFrequency >= 3; }),
      message: "Git metadata analyzed"
    };
  }

  // ═══════════════════════════════════════════
  // HOTSPOT SCORE
  // ═══════════════════════════════════════════
  function computeHotspots(gitResult, problems, codeModel, moduleGraph) {
    var scores = {};
    var files = {};

    (problems || []).forEach(function (p) {
      var f = p.file_name || p.file || "";
      if (!f) return;
      files[f] = true;
      if (!scores[f]) scores[f] = { file: f, bugFreq: 0, changeFreq: 0, complexity: 0, centrality: 0, security: 0, score: 0 };
      scores[f].bugFreq += 1;
      if ((p.section || "").toLowerCase() === "security" || (p.classification || "").indexOf("SECURITY") >= 0) {
        scores[f].security += 1;
      }
    });

    if (gitResult && gitResult.status === "AVAILABLE") {
      (gitResult.hotspots || []).forEach(function (h) {
        files[h.file] = true;
        if (!scores[h.file]) scores[h.file] = { file: h.file, bugFreq: 0, changeFreq: 0, complexity: 0, centrality: 0, security: 0, score: 0 };
        scores[h.file].changeFreq = h.changeFrequency || 0;
      });
    }

    // Centrality from module graph
    if (moduleGraph && moduleGraph.reverseDeps) {
      Object.keys(moduleGraph.reverseDeps).forEach(function (f) {
        files[f] = true;
        if (!scores[f]) scores[f] = { file: f, bugFreq: 0, changeFreq: 0, complexity: 0, centrality: 0, security: 0, score: 0 };
        scores[f].centrality = (moduleGraph.reverseDeps[f] || []).length;
      });
    }

    // Complexity proxy: data-flow count + function count
    if (codeModel) {
      (codeModel.dataFlows || []).forEach(function (df) {
        var f = df.file || (df.sink && df.sink.file) || "";
        if (f && scores[f]) scores[f].complexity += 0.5;
      });
      Object.keys(codeModel.functionMap || {}).forEach(function (fn) {
        (codeModel.functionMap[fn] || []).forEach(function (loc) {
          if (scores[loc.file]) scores[loc.file].complexity += 0.2;
        });
      });
    }

    var result = [];
    Object.keys(scores).forEach(function (f) {
      var s = scores[f];
      // Weighted; Hotspot ≠ Bug
      s.score = Math.min(100, Math.round(
        s.bugFreq * 18 +
        s.changeFreq * 8 +
        s.complexity * 4 +
        s.centrality * 6 +
        s.security * 12
      ));
      result.push(s);
    });
    result.sort(function (a, b) { return b.score - a.score; });
    return result;
  }

  // ═══════════════════════════════════════════
  // ROOT-CAUSE INTELLIGENCE (Evidence Graph aware)
  // ═══════════════════════════════════════════
  function enhanceRootCauses(problems, evidenceList, graph, clusters) {
    return (problems || []).map(function (p) {
      var candidates = p.rootCauseCandidates || [];
      if (!candidates.length && p.root_cause) {
        candidates = [{ cause: p.root_cause, score: 0.5, support: [] }];
      }

      var pf = p.file_name || p.file || "";
      var pl = p.line || 0;
      var related = (evidenceList || []).filter(function (e) {
        return e.file === pf && Math.abs((e.line || 0) - pl) <= 5;
      });
      var cluster = (clusters || []).filter(function (c) {
        return c.file === pf && Math.abs(c.line - pl) <= 3;
      })[0];

      // Rank candidates by supporting evidence
      candidates = candidates.map(function (rc) {
        var support = [];
        related.forEach(function (e) {
          if (e.engine === "dataflow" || e.engine === "cfg" || e.engine === "symbolic" || e.engine === "dom") {
            support.push({ engine: e.engine, type: e.type, strength: e.strength });
          }
        });
        var score = (rc.score || 0.4) + support.length * 0.08;
        if (cluster && cluster.agreement) score += 0.1;
        if (cluster && cluster.contradictions && cluster.contradictions.length) score -= 0.15;
        score = Math.max(0.1, Math.min(0.95, score));
        return {
          cause: rc.cause || rc.rootCause || String(rc),
          score: score,
          support: support,
          confirmed: score >= 0.75 && support.length >= 2
        };
      });
      candidates.sort(function (a, b) { return b.score - a.score; });

      var top = candidates[0];
      return Object.assign({}, p, {
        rootCauseCandidates: candidates,
        root_cause: top && top.confirmed ? top.cause : (p.root_cause || (top && top.cause) || ""),
        rootCauseScore: top ? top.score : 0
      });
    });
  }

  // ═══════════════════════════════════════════
  // APPLY CORRELATION TO FINDINGS
  // ═══════════════════════════════════════════
  function applyCorrelationToFindings(problems, clusters, evidenceList, graph, hotspots, regression) {
    var hotspotMap = {};
    (hotspots || []).forEach(function (h) { hotspotMap[h.file] = h.score; });

    return (problems || []).map(function (p) {
      var pf = p.file_name || p.file || "";
      var pl = p.line || 0;
      var cluster = (clusters || []).filter(function (c) {
        return c.file === pf && Math.abs(c.line - pl) <= 3;
      })[0];

      var conf = p.confidence;
      if (conf > 1) conf = conf / 100;
      if (conf == null) conf = (p.confidence_score || 50) / 100;

      var validationPass = null;
      if (p.validations) {
        var fails = (p.validations || []).filter(function (v) { return v.pass === false; });
        validationPass = fails.length === 0;
      }

      conf = adaptiveConfidence(conf, cluster, validationPass);

      var status = p.status;
      var classification = p.classification;

      if (cluster && cluster.contradictions && cluster.contradictions.length) {
        if (conf < 0.55) {
          status = "INCONCLUSIVE";
          if (classification === "CONFIRMED_BUG" || classification === "SECURITY_ISSUE") {
            classification = "POSSIBLE_ISSUE";
          }
        }
      }

      // Merge evidence from cluster
      var mergedEv = (p.evidence_list || p.evidence || []).slice();
      if (cluster) {
        cluster.evidence.forEach(function (e) {
          var exists = mergedEv.some(function (x) {
            return (x.engine || x.type) === e.engine && (x.line || 0) === e.line;
          });
          if (!exists) {
            mergedEv.push({
              type: e.type,
              engine: e.engine,
              file: e.file,
              line: e.line,
              snippet: e.snippet,
              strength: e.strength,
              flowPath: e.flowPath
            });
          }
        });
      }

      var reg = null;
      if (regression && regression.results) {
        var fp = (p.problem_id || "") + "|" + pf + "|" + pl;
        reg = regression.results[fp] || regression.byFingerprint && regression.byFingerprint[
          (typeof ADStage2 !== "undefined" && ADStage2.fingerprintFinding)
            ? ADStage2.fingerprintFinding(p) : fp
        ];
      }
      if (!reg && regression && typeof regression === "object") {
        // stage2 style
        if (regression.new && regression.existing) {
          // already summarized
          reg = { status: "COMPARED" };
        }
      }

      var detecting = (p.detectingStrategies || p.strategies || []).slice();
      if (cluster) {
        cluster.engines.forEach(function (eng) {
          if (detecting.indexOf(eng) === -1) detecting.push(eng);
        });
      }

      // Build uniform schema fields
      var out = Object.assign({}, p, {
        problemId: p.problem_id || p.problemId || "",
        classification: classification || p.classification || "",
        status: status || p.status || "",
        severity: p.severity || "",
        confidence: Math.round(conf * 100) / 100,
        confidence_score: Math.round(conf * 100),
        file: pf,
        line: pl,
        endLine: p.endLine || p.end_line || pl,
        symptom: p.symptom || p.description || p.problem || "",
        rootCause: p.root_cause || p.rootCause || "",
        impact: p.impact || p.why_it_matters || "",
        evidence: mergedEv,
        evidenceGraph: cluster ? [{
          location: cluster.location,
          engines: cluster.engines,
          agreement: cluster.agreement,
          contradictions: cluster.contradictions
        }] : [],
        flow: (cluster && cluster.signals && cluster.signals.dataflow)
          ? (mergedEv.filter(function (e) { return e.type === "dataflow" || e.flowPath; }).map(function (e) { return e.flowPath || e.snippet; }))
          : (p.flow || []),
        controlPath: p.controlPath || [],
        validation: p.validations || p.validation || [],
        tests: p.tests || [],
        mutations: p.mutations || [],
        dependencies: p.dependencies || [],
        regression: reg || p.regression || {},
        rootCauseCandidates: p.rootCauseCandidates || [],
        hotspotScore: hotspotMap[pf] || 0,
        detectingStrategies: detecting,
        correlation: cluster ? {
          engineCount: cluster.engineCount,
          agreement: cluster.agreement,
          contradictions: cluster.contradictions,
          signals: cluster.signals
        } : null
      });

      return out;
    });
  }

  // ═══════════════════════════════════════════
  // MAIN Stage-3 RUN
  // ═══════════════════════════════════════════
  function runStage3(ctx) {
    ctx = ctx || {};
    var files = ctx.files || {};
    var codeModel = ctx.codeModel || null;
    var moduleGraph = ctx.moduleGraph || null;
    var cfgIssues = ctx.cfgIssues || [];
    var symbolicFindings = ctx.symbolicFindings || [];
    var problems = ctx.problems || [];
    var stage2 = ctx.stage2 || {};
    var gitMeta = ctx.gitMeta || null;
    var options = ctx.options || {};

    // 1. DOM analysis
    var domFindings = analyzeDOM(files, codeModel, ctx.astMap);

    // 2. Collect & normalize evidence
    var evidenceCtx = {
      files: files,
      codeModel: codeModel,
      moduleGraph: moduleGraph,
      cfgIssues: cfgIssues,
      symbolicFindings: symbolicFindings,
      problems: problems,
      stage2: stage2,
      domFindings: domFindings
    };
    var evidenceList = collectEngineEvidence(evidenceCtx);

    // 3. Evidence Graph
    var graph = buildEvidenceGraph(evidenceList, evidenceCtx);

    // 4. Correlate
    var clusters = correlateEvidence(evidenceList, graph, problems);

    // 5. Git (lazy)
    var gitResult = analyzeGitHistory(gitMeta);

    // 6. Hotspots
    var hotspots = computeHotspots(gitResult, problems, codeModel, moduleGraph);

    // 7. Root-cause enhancement
    problems = enhanceRootCauses(problems, evidenceList, graph, clusters);

    // 8. Apply correlation / adaptive confidence / schema
    var enhanced = applyCorrelationToFindings(
      problems, clusters, evidenceList, graph, hotspots, stage2.regression
    );

    // 9. Orchestration summary (adaptive plans for top candidates)
    var orchestration = enhanced.slice(0, 30).map(function (p) {
      return orchestrateCandidate(p, { evidenceList: evidenceList });
    });

    // 10. Contradiction summary
    var allContradictions = [];
    clusters.forEach(function (c) {
      (c.contradictions || []).forEach(function (con) {
        allContradictions.push(Object.assign({ location: c.location }, con));
      });
    });

    return {
      version: "V6-Stage3",
      evidenceList: evidenceList,
      evidenceGraph: {
        nodeCount: Object.keys(graph.nodes).length,
        edgeCount: graph.edges.length,
        sampleEdges: graph.edges.slice(0, 20)
      },
      clusters: clusters,
      contradictions: allContradictions,
      domFindings: domFindings,
      git: gitResult,
      hotspots: hotspots.slice(0, 25),
      orchestration: orchestration,
      problems: enhanced,
      summary: {
        evidenceCount: evidenceList.length,
        clusterCount: clusters.length,
        agreementClusters: clusters.filter(function (c) { return c.agreement; }).length,
        contradictionCount: allContradictions.length,
        domFindings: domFindings.length,
        gitStatus: gitResult.status,
        hotspotCount: hotspots.length
      }
    };
  }

  global.ADStage3 = {
    runStage3: runStage3,
    normalizeEvidence: normalizeEvidence,
    collectEngineEvidence: collectEngineEvidence,
    buildEvidenceGraph: buildEvidenceGraph,
    correlateEvidence: correlateEvidence,
    detectContradictions: detectContradictions,
    adaptiveConfidence: adaptiveConfidence,
    estimateComplexity: estimateComplexity,
    selectEngines: selectEngines,
    orchestrateCandidate: orchestrateCandidate,
    analyzeDOM: analyzeDOM,
    analyzeGitHistory: analyzeGitHistory,
    computeHotspots: computeHotspots,
    enhanceRootCauses: enhanceRootCauses,
    applyCorrelationToFindings: applyCorrelationToFindings,
    ENGINE_BUDGET: ENGINE_BUDGET
  };
})(typeof window !== "undefined" ? window : globalThis);
