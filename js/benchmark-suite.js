/**
 * Auto Debugger V6 Stage-1 — Internal Benchmark Suite
 */
(function (global) {
  "use strict";

  var CASES = [
    // ── Regression V6 ──
    {
      id: "SYN-UNBALANCED",
      category: "Syntax",
      files: { "a.js": "function foo() {\n  if (true) {\n    return 1;\n" },
      expect: { detected: true, minConfidence: 0.55 }
    },
    {
      id: "SEC-EVAL-COMMENT",
      category: "Security",
      files: { "a.js": "// use eval(user) carefully\nconst x = 1;" },
      expect: { detected: false }
    },
    {
      id: "SEC-EVAL-STRING",
      category: "Security",
      files: { "a.js": "var s = \"eval(code)\";\nconsole.log(s);" },
      expect: { detected: false }
    },
    {
      id: "SEC-EVAL-BARE",
      category: "Security",
      files: { "a.js": "function run(code) {\n  return eval(code);\n}" },
      expect: { detected: true, minConfidence: 0.6 }
    },
    {
      id: "SEC-XSS-FLOW",
      category: "Security",
      files: { "a.js": "var q = location.search;\nvar el = document.getElementById('out');\nel.innerHTML = q;" },
      expect: { detected: true, preferFlow: true, minConfidence: 0.7 }
    },
    {
      id: "SEC-INNERHTML-LITERAL",
      category: "Security",
      files: { "a.js": "el.innerHTML = '<b>safe static</b>';" },
      expect: { detected: true, maxConfidence: 0.9 }
    },
    {
      id: "LOGIC-NULL",
      category: "Code / Logic",
      files: { "a.js": "document.getElementById('x').textContent = 'hi';" },
      expect: { detected: true }
    },
    {
      id: "ASYNC-PROMISE",
      category: "Code / Logic",
      files: { "a.js": "fetch('/api').then(r => r.json());" },
      expect: { detected: true }
    },
    {
      id: "NO-BUG-CLEAN",
      category: "Syntax",
      files: { "a.js": "function add(a, b) {\n  return a + b;\n}\nexport { add };" },
      expect: { detected: false }
    },
    {
      id: "CSS-ONLY",
      category: "Syntax",
      files: { "a.css": "body { color: #333; }" },
      expect: { detected: false }
    },

    // ── Stage-1 Deep Data Flow ──
    {
      id: "DF-MULTI-HOP",
      category: "Security",
      files: {
        "a.js": "var s = location.hash;\nvar t = s;\nvar u = t;\nel.innerHTML = u;"
      },
      expect: { detected: true, minConfidence: 0.65 }
    },
    {
      id: "DF-REASSIGN",
      category: "Security",
      files: {
        "a.js": "let x = location.search;\nx = x + '';\ndocument.write(x);"
      },
      expect: { detected: true, minConfidence: 0.6 }
    },
    {
      id: "DF-PARAM-RETURN",
      category: "Security",
      files: {
        "a.js": "function wrap(v) { return v; }\nvar q = location.search;\nvar y = wrap(q);\nel.innerHTML = y;"
      },
      expect: { detected: true, minConfidence: 0.55 }
    },

    // ── Cross-file ──
    {
      id: "XF-VALID-IMPORT",
      category: "Security",
      level: 4,
      files: {
        "src.js": "export function getQ() { return location.search; }",
        "app.js": "import { getQ } from './src.js';\nel.innerHTML = getQ();"
      },
      expect: { detected: true, minConfidence: 0.5 }
    },
    {
      id: "XF-UNRELATED-NO-BUG",
      category: "Security",
      level: 4,
      files: {
        "a.js": "var q = location.search;\nconsole.log(q);",
        "b.js": "el.innerHTML = '<static>';"
      },
      expect: { detected: true, allowOnlyWeakOrSmell: true, reason: "unrelated files must not create confirmed cross-file XSS" }
    },

    // ── CFG / Symbolic ──
    {
      id: "CFG-UNREACHABLE",
      category: "Code / Logic",
      files: { "a.js": "function f() {\n  return 1;\n  console.log('dead');\n}" },
      expect: { detected: true, minConfidence: 0.55 }
    },
    {
      id: "CFG-ALWAYS-FALSE",
      category: "Code / Logic",
      files: { "a.js": "if (false) {\n  doWork();\n}" },
      expect: { detected: true, minConfidence: 0.55 }
    },
    {
      id: "CFG-EMPTY-CATCH",
      category: "Code / Logic",
      files: { "a.js": "try {\n  risky();\n} catch (e) {\n}" },
      expect: { detected: true, minConfidence: 0.55 }
    },
    {
      id: "SYM-NULL-DEREF",
      category: "Code / Logic",
      files: { "a.js": "var x = null;\nx.foo = 1;" },
      expect: { detected: true, minConfidence: 0.6 }
    },
    {
      id: "SYM-IMPOSSIBLE",
      category: "Code / Logic",
      files: { "a.js": "var x = null;\nif (x) {\n  use(x);\n}" },
      expect: { detected: true, minConfidence: 0.55 }
    },

    // ── Clean / FP ──
    {
      id: "FP-COMMENT-SINK",
      category: "Security",
      files: { "a.js": "/* el.innerHTML = location.search */\nvar ok = 1;" },
      expect: { detected: false }
    },
    {
      id: "NO-BUG-GUARDED-NULL",
      category: "Code / Logic",
      files: { "a.js": "var x = null;\nif (x != null) {\n  x.foo = 1;\n}" },
      expect: { detected: false, allowSmells: true }
    }
  ];

  function isRealFinding(p) {
    if (!p) return false;
    if (p.classification === "CODE_SMELL" || p.classification === "NOT_APPLICABLE") return false;
    if ((p.confidence || 0) < 0.5) return false;
    return true;
  }

  function runCase(c, defaultLevel) {
    var level = c.level || defaultLevel || 3;
    if (typeof ADDebugEngine === "undefined") {
      return { id: c.id, error: "ADDebugEngine missing", ok: false };
    }
    try {
      var engine = new ADDebugEngine.DebugEngine(c.files, "auto", c.category || "Test All", level, null);
      if (global.ADAst) {
        try { engine.astMap = ADAst.analyzeProject(c.files); } catch (e) {}
      }
      var result = engine.run();
      var problems = result.problems || [];
      var real = problems.filter(isRealFinding);
      var detected = problems.length > 0;
      var realDetected = real.length > 0;
      var maxConf = 0;
      problems.forEach(function (p) {
        if ((p.confidence || 0) > maxConf) maxConf = p.confidence;
      });

      var ok = true;
      var notes = [];
      var exp = c.expect || {};

      if (exp.detected === true) {
        if (!detected) { ok = false; notes.push("expected detection"); }
        if (exp.minConfidence != null && maxConf < exp.minConfidence) {
          ok = false; notes.push("confidence too low: " + maxConf);
        }
      }
      if (exp.detected === false) {
        if (exp.allowSmells) {
          if (real.length) { ok = false; notes.push("unexpected real findings: " + real.length); }
        } else if (detected && realDetected) {
          ok = false; notes.push("unexpected real findings: " + real.length);
        } else if (detected && !realDetected) {
          // only smells / low conf — acceptable for detected:false
        }
      }
      if (exp.allowOnlyWeakOrSmell) {
        // may detect sink-only on b.js but must not be cross-file CONFIRMED from a.js source
        var bad = problems.filter(function (p) {
          return (p.confidence || 0) >= 0.85 && /cross-file|SOURCE\(/i.test(p.description || p.evidence || "");
        });
        if (bad.length) { ok = false; notes.push("false cross-file confirmed"); }
      }
      if (exp.maxConfidence != null && maxConf > exp.maxConfidence) {
        notes.push("confidence high for weak case: " + maxConf);
      }

      return {
        id: c.id,
        ok: ok,
        detected: detected,
        realDetected: realDetected,
        count: problems.length,
        maxConfidence: maxConf,
        notes: notes,
        problems: problems.map(function (p) {
          return { desc: (p.description || "").slice(0, 80), conf: p.confidence, cl: p.classification, status: p.status };
        })
      };
    } catch (err) {
      return { id: c.id, error: String(err && err.message || err), ok: false };
    }
  }

  function runAll(level) {
    var results = CASES.map(function (c) { return runCase(c, level); });
    var passed = results.filter(function (r) { return r.ok; }).length;
    var tp = 0, tn = 0, fp = 0, fn = 0;
    CASES.forEach(function (c, i) {
      var r = results[i];
      var expectBug = c.expect && c.expect.detected === true;
      var gotReal = r.realDetected;
      if (expectBug && gotReal) tp++;
      else if (expectBug && !gotReal) fn++;
      else if (!expectBug && gotReal && !(c.expect && c.expect.allowOnlyWeakOrSmell)) fp++;
      else tn++;
    });
    return {
      version: "V6-Stage1",
      total: results.length,
      passed: passed,
      failed: results.length - passed,
      truePositive: tp,
      falsePositive: fp,
      falseNegative: fn,
      trueNegative: tn,
      results: results
    };
  }

  global.ADBenchmark = { CASES: CASES, runCase: runCase, runAll: runAll };
})(typeof window !== "undefined" ? window : globalThis);
