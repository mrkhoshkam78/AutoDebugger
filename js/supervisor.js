/**
 * Auto Debugger V8.05 — Supervisor Engine
 * Orchestrates specialized domain plans; does NOT invent bugs.
 * Domain detection stays in strategies + DebugEngine methods.
 */
(function (global) {
  "use strict";

  var ENGINE_PLANS = {
    "Security": {
      engines: ["ast", "dataflow", "dom", "security", "validation"],
      budget: "high",
      order: ["ast", "security", "dataflow", "dom", "validation"]
    },
    "Mathematical / Calculations": {
      engines: ["ast", "math", "validation"],
      budget: "medium",
      order: ["ast", "math", "validation"]
    },
    "Database / Storage": {
      engines: ["ast", "dataflow", "storage", "validation"],
      budget: "medium",
      order: ["ast", "storage", "dataflow", "validation"]
    },
    "UI": {
      engines: ["ast", "ui", "dom", "validation"],
      budget: "low",
      order: ["ast", "ui", "validation"]
    },
    "UX": {
      engines: ["ast", "ux", "validation"],
      budget: "low",
      order: ["ast", "ux", "validation"]
    },
    "Performance": {
      engines: ["ast", "performance", "validation"],
      budget: "low",
      order: ["ast", "performance", "validation"]
    },
    "Responsive behavior": {
      engines: ["ast", "responsive", "validation"],
      budget: "low",
      order: ["ast", "responsive", "validation"]
    },
    "Syntax": {
      engines: ["ast", "syntax", "validation"],
      budget: "low",
      order: ["ast", "syntax", "validation"]
    },
    "Code / Logic": {
      engines: ["ast", "cfg", "symbolic", "logic", "validation"],
      budget: "medium",
      order: ["ast", "cfg", "symbolic", "logic", "validation"]
    },
    "Structure / Architecture": {
      engines: ["ast", "dependency", "architecture", "validation"],
      budget: "medium",
      order: ["ast", "dependency", "architecture", "validation"]
    },
    "Test All": {
      engines: ["ast", "syntax", "security", "math", "storage", "ui", "dataflow", "cfg", "validation", "correlation"],
      budget: "high",
      order: ["ast", "syntax", "security", "math", "storage", "ui", "dataflow", "cfg", "correlation", "validation"]
    }
  };

  function normalizeCategory(cat) {
    if (global.ADStrategies && ADStrategies.normalizeCategory) {
      return ADStrategies.normalizeCategory(cat || "Test All");
    }
    return cat || "Test All";
  }

  function buildPlan(request) {
    request = request || {};
    var category = normalizeCategory(request.category);
    var level = Math.min(4, Math.max(1, parseInt(request.level, 10) || 1));
    var plan = ENGINE_PLANS[category] || ENGINE_PLANS["Code / Logic"];
    var engines = (plan.order || plan.engines || []).slice();

    // Level trims expensive stages
    if (level <= 1) {
      engines = engines.filter(function (e) {
        return ["ast", "syntax", "security", "math", "storage", "ui", "validation"].indexOf(e) !== -1;
      });
    } else if (level === 2) {
      engines = engines.filter(function (e) {
        return e !== "correlation" || category === "Test All";
      });
    }

    return {
      version: "V8.05",
      category: category,
      level: level,
      engines: engines,
      budget: plan.budget || "medium",
      skipUnrelated: category !== "Test All",
      language: request.language || "auto",
      fileCount: request.fileCount || 0,
      createdAt: Date.now()
    };
  }

  /**
   * Light correlation: merge confidence when multiple engines agree on same file:line:category
   */
  function correlateFindings(problems) {
    problems = problems || [];
    var map = Object.create(null);
    var out = [];
    for (var i = 0; i < problems.length; i++) {
      var p = problems[i];
      if (!p) continue;
      var key = (p.file_name || p.file || "") + "|" + (p.line || 0) + "|" + (p.category || "") + "|" + (p.rule_id || p.simple && p.simple.id || (p.description || "").slice(0, 40));
      if (!map[key]) {
        map[key] = p;
        out.push(p);
      } else {
        var prev = map[key];
        var c1 = prev.confidence || 0.5;
        var c2 = p.confidence || 0.5;
        prev.confidence = Math.min(0.98, Math.max(c1, c2) + 0.05);
        if (p.conversational && !prev.conversational) prev.conversational = p.conversational;
        prev.detecting_strategies = (prev.detecting_strategies || []).concat(p.detecting_strategies || []);
      }
    }
    return out;
  }

  function attachPlanMeta(result, plan) {
    result = result || {};
    result.supervisor = {
      version: "V8.05",
      plan: plan,
      enginesPlanned: (plan && plan.engines) || [],
      correlated: true
    };
    return result;
  }

  global.ADSupervisor = {
    buildPlan: buildPlan,
    correlateFindings: correlateFindings,
    attachPlanMeta: attachPlanMeta,
    ENGINE_PLANS: ENGINE_PLANS
  };
})(typeof window !== "undefined" ? window : globalThis);
