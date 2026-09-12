/**
 * Auto Debugger V6 — Internal Benchmark Suite (browser-runnable)
 * Cases define expected detection properties; runner executes engine in-process.
 */
(function (global) {
  "use strict";

  var CASES = [
    {
      id: "SYN-UNBALANCED",
      category: "Syntax",
      files: { "a.js": "function foo() {\n  if (true) {\n    return 1;\n" },
      expect: { detected: true, classificationIncludes: ["CONFIRMED_BUG", "POSSIBLE_ISSUE"], minConfidence: 0.6 }
    },
    {
      id: "SEC-EVAL-COMMENT",
      category: "Security",
      files: { "a.js": "// use eval(user) carefully\nconst x = 1;" },
      expect: { detected: false, reason: "eval only in comment" }
    },
    {
      id: "SEC-EVAL-STRING",
      category: "Security",
      files: { "a.js": "var s = \"eval(code)\";\nconsole.log(s);" },
      expect: { detected: false, reason: "eval only in string" }
    },
    {
      id: "SEC-EVAL-BARE",
      category: "Security",
      files: { "a.js": "function run(code) {\n  return eval(code);\n}" },
      expect: { detected: true, classificationIncludes: ["SECURITY_ISSUE", "POSSIBLE_ISSUE", "CONFIRMED_BUG"], minConfidence: 0.65 }
    },
    {
      id: "SEC-XSS-FLOW",
      category: "Security",
      files: {
        "a.js": "var q = location.search;\nvar el = document.getElementById('out');\nel.innerHTML = q;"
      },
      expect: { detected: true, classificationIncludes: ["SECURITY_ISSUE", "CONFIRMED_BUG", "POSSIBLE_ISSUE"], preferFlow: true, minConfidence: 0.7 }
    },
    {
      id: "SEC-INNERHTML-LITERAL",
      category: "Security",
      files: { "a.js": "el.innerHTML = '<b>safe static</b>';" },
      expect: { detected: true, maxConfidence: 0.85, reason: "sink without user source should not be critical confirmed" }
    },
    {
      id: "LOGIC-NULL",
      category: "Code / Logic",
      files: { "a.js": "document.getElementById('x').textContent = 'hi';" },
      expect: { detected: true, classificationIncludes: ["POSSIBLE_ISSUE", "CONFIRMED_BUG", "CODE_SMELL"] }
    },
    {
      id: "ASYNC-PROMISE",
      category: "Code / Logic",
      files: { "a.js": "fetch('/api').then(r => r.json());" },
      expect: { detected: true, classificationIncludes: ["POSSIBLE_ISSUE", "CONFIRMED_BUG", "CODE_SMELL"] }
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
    }
  ];

  function runCase(c, level) {
    level = level || 3;
    if (typeof ADDebugEngine === "undefined") {
      return { id: c.id, error: "ADDebugEngine missing" };
    }
    try {
      var engine = new ADDebugEngine.DebugEngine(c.files, "auto", c.category || "Test All", level, null);
      if (global.ADAst) {
        try { engine.astMap = ADAst.analyzeProject(c.files); } catch (e) {}
      }
      var result = engine.run();
      var problems = result.problems || [];
      var detected = problems.length > 0;
      var classifications = problems.map(function (p) { return p.classification; });
      var maxConf = 0;
      problems.forEach(function (p) {
        if ((p.confidence || 0) > maxConf) maxConf = p.confidence;
      });
      var ok = true;
      var notes = [];
      if (c.expect.detected === true && !detected) { ok = false; notes.push("expected detection"); }
      if (c.expect.detected === false && detected) {
        // allow only CODE_SMELL / low severity noise
        var real = problems.filter(function (p) {
          return p.classification !== "CODE_SMELL" && (p.confidence || 0) >= 0.6;
        });
        if (real.length) { ok = false; notes.push("unexpected real findings: " + real.length); }
      }
      if (c.expect.minConfidence != null && detected && maxConf < c.expect.minConfidence) {
        ok = false; notes.push("confidence too low: " + maxConf);
      }
      if (c.expect.maxConfidence != null && maxConf > c.expect.maxConfidence) {
        notes.push("confidence high for weak case: " + maxConf);
      }
      if (c.expect.classificationIncludes && detected) {
        var hit = classifications.some(function (cl) {
          return c.expect.classificationIncludes.indexOf(cl) !== -1;
        });
        if (!hit) { ok = false; notes.push("classification mismatch: " + classifications.join(",")); }
      }
      return {
        id: c.id,
        ok: ok,
        detected: detected,
        count: problems.length,
        classifications: classifications,
        maxConfidence: maxConf,
        notes: notes,
        problems: problems.map(function (p) {
          return { desc: p.description, conf: p.confidence, cl: p.classification, status: p.status };
        })
      };
    } catch (err) {
      return { id: c.id, error: String(err && err.message || err), ok: false };
    }
  }

  function runAll(level) {
    var results = CASES.map(function (c) { return runCase(c, level); });
    var passed = results.filter(function (r) { return r.ok; }).length;
    return {
      version: "V6",
      total: results.length,
      passed: passed,
      failed: results.length - passed,
      results: results
    };
  }

  global.ADBenchmark = { CASES: CASES, runCase: runCase, runAll: runAll };
})(typeof window !== "undefined" ? window : globalThis);
