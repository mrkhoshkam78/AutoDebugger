/**
 * Auto Debugger V10.0 — Supervisor Engine
 * Orchestrates specialized engines; does NOT invent bugs.
 * Engines produce Candidates/Evidence only; central pipeline finalizes Findings.
 * Contract: run / skip / cancel / pause / resume / validate / merge / correlate
 */
(function (global) {
  "use strict";

  /** Specialized engine registry (ids used for selection & isolation) */
  var ENGINE_REGISTRY = {
    CodeLogicEngine:   { id: "CodeLogicEngine",   category: "Code / Logic",              shared: false, cost: 3 },
    SyntaxEngine:      { id: "SyntaxEngine",      category: "Syntax",                   shared: false, cost: 1 },
    SecurityEngine:    { id: "SecurityEngine",    category: "Security",                 shared: false, cost: 4 },
    UIEngine:          { id: "UIEngine",          category: "UI",                       shared: false, cost: 2 },
    UXEngine:          { id: "UXEngine",          category: "UX",                       shared: false, cost: 2 },
    ResponsiveEngine:  { id: "ResponsiveEngine",  category: "Responsive behavior",      shared: false, cost: 2 },
    PerformanceEngine: { id: "PerformanceEngine", category: "Performance",              shared: false, cost: 2 },
    ArchitectureEngine:{ id: "ArchitectureEngine",category: "Structure / Architecture", shared: false, cost: 3 },
    MathEngine:        { id: "MathEngine",        category: "Mathematical / Calculations", shared: false, cost: 3 },
    StorageEngine:     { id: "StorageEngine",     category: "Database / Storage",       shared: false, cost: 3 },
    TestEngine:        { id: "TestEngine",        category: "Test All",                 shared: false, cost: 4 },
    // Shared infrastructure (never category-isolated away)
    AstEngine:         { id: "AstEngine",         category: "shared", shared: true, cost: 2 },
    DataFlowEngine:    { id: "DataFlowEngine",    category: "shared", shared: true, cost: 3 },
    CfgEngine:         { id: "CfgEngine",         category: "shared", shared: true, cost: 2 },
    ValidationEngine:  { id: "ValidationEngine",  category: "shared", shared: true, cost: 1 },
    CorrelationEngine: { id: "CorrelationEngine", category: "shared", shared: true, cost: 2 }
  };

  var ENGINE_PLANS = {
    "Security": {
      engines: ["AstEngine", "SecurityEngine", "DataFlowEngine", "ValidationEngine"],
      specialized: ["SecurityEngine"],
      budget: "high",
      order: ["AstEngine", "SecurityEngine", "DataFlowEngine", "ValidationEngine"]
    },
    "Mathematical / Calculations": {
      engines: ["AstEngine", "MathEngine", "ValidationEngine"],
      specialized: ["MathEngine"],
      budget: "medium",
      order: ["AstEngine", "MathEngine", "ValidationEngine"]
    },
    "Database / Storage": {
      engines: ["AstEngine", "StorageEngine", "DataFlowEngine", "ValidationEngine"],
      specialized: ["StorageEngine"],
      budget: "medium",
      order: ["AstEngine", "StorageEngine", "DataFlowEngine", "ValidationEngine"]
    },
    "UI": {
      engines: ["AstEngine", "UIEngine", "ValidationEngine"],
      specialized: ["UIEngine"],
      budget: "low",
      order: ["AstEngine", "UIEngine", "ValidationEngine"]
    },
    "UX": {
      engines: ["AstEngine", "UXEngine", "ValidationEngine"],
      specialized: ["UXEngine"],
      budget: "low",
      order: ["AstEngine", "UXEngine", "ValidationEngine"]
    },
    "Performance": {
      engines: ["AstEngine", "PerformanceEngine", "ValidationEngine"],
      specialized: ["PerformanceEngine"],
      budget: "low",
      order: ["AstEngine", "PerformanceEngine", "ValidationEngine"]
    },
    "Responsive behavior": {
      engines: ["AstEngine", "ResponsiveEngine", "ValidationEngine"],
      specialized: ["ResponsiveEngine"],
      budget: "low",
      order: ["AstEngine", "ResponsiveEngine", "ValidationEngine"]
    },
    "Syntax": {
      engines: ["AstEngine", "SyntaxEngine", "ValidationEngine"],
      specialized: ["SyntaxEngine"],
      budget: "low",
      order: ["AstEngine", "SyntaxEngine", "ValidationEngine"]
    },
    "Code / Logic": {
      engines: ["AstEngine", "CfgEngine", "CodeLogicEngine", "DataFlowEngine", "ValidationEngine"],
      specialized: ["CodeLogicEngine"],
      budget: "medium",
      order: ["AstEngine", "CfgEngine", "CodeLogicEngine", "DataFlowEngine", "ValidationEngine"]
    },
    "Structure / Architecture": {
      engines: ["AstEngine", "ArchitectureEngine", "ValidationEngine"],
      specialized: ["ArchitectureEngine"],
      budget: "medium",
      order: ["AstEngine", "ArchitectureEngine", "ValidationEngine"]
    },
    "Test All": {
      engines: ["AstEngine", "SyntaxEngine", "SecurityEngine", "MathEngine", "StorageEngine",
                "UIEngine", "UXEngine", "ResponsiveEngine", "PerformanceEngine", "CodeLogicEngine",
                "ArchitectureEngine", "DataFlowEngine", "CfgEngine", "CorrelationEngine", "ValidationEngine"],
      specialized: ["SyntaxEngine", "SecurityEngine", "MathEngine", "StorageEngine", "UIEngine",
                    "UXEngine", "ResponsiveEngine", "PerformanceEngine", "CodeLogicEngine", "ArchitectureEngine"],
      budget: "high",
      order: ["AstEngine", "SyntaxEngine", "SecurityEngine", "MathEngine", "StorageEngine",
              "UIEngine", "CodeLogicEngine", "DataFlowEngine", "CfgEngine", "CorrelationEngine", "ValidationEngine"]
    }
  };

  function normalizeCategory(cat) {
    if (global.ADStrategies && ADStrategies.normalizeCategory) {
      return ADStrategies.normalizeCategory(cat || "Test All");
    }
    return cat || "Test All";
  }

  /**
   * Build execution plan. Category Selection truly controls which specialized engines run.
   * Shared engines (AST, Validation …) may still run when needed by the selected category.
   */
  function buildPlan(request) {
    request = request || {};
    var category = normalizeCategory(request.category);
    var level = Math.min(4, Math.max(1, parseInt(request.level, 10) || 1));
    var planDef = ENGINE_PLANS[category] || ENGINE_PLANS["Code / Logic"];
    var engines = (planDef.order || planDef.engines || []).slice();
    var specialized = (planDef.specialized || []).slice();

    // Level trims expensive stages
    if (level <= 1) {
      engines = engines.filter(function (e) {
        return ["AstEngine", "SyntaxEngine", "SecurityEngine", "MathEngine", "StorageEngine",
                "UIEngine", "ValidationEngine"].indexOf(e) !== -1;
      });
      specialized = specialized.filter(function (e) {
        return engines.indexOf(e) !== -1;
      });
    } else if (level === 2) {
      engines = engines.filter(function (e) {
        return e !== "CorrelationEngine" || category === "Test All";
      });
    }

    return {
      version: "V10.0",
      category: category,
      level: level,
      engines: engines,
      specialized: specialized,
      specializedCount: specialized.length,
      budget: planDef.budget || "medium",
      skipUnrelated: category !== "Test All",
      language: request.language || "auto",
      fileCount: request.fileCount || 0,
      createdAt: Date.now(),
      isolation: true
    };
  }

  /**
   * Returns true if a specialized engineId is allowed for the current plan/category.
   * Shared engines always allowed when listed in plan.
   */
  function isEngineAllowed(engineId, plan) {
    if (!plan || !plan.engines) return true;
    if (plan.category === "Test All") return true;
    var meta = ENGINE_REGISTRY[engineId];
    if (meta && meta.shared) return plan.engines.indexOf(engineId) !== -1;
    return plan.engines.indexOf(engineId) !== -1 || (plan.specialized || []).indexOf(engineId) !== -1;
  }

  /**
   * Map legacy strategy category / method prefixes to specialized engine ids
   * so existing DebugEngine methods can be gated.
   */
  function strategyToEngine(strategy) {
    if (!strategy) return null;
    var cat = (strategy.category || "").toLowerCase();
    var id = (strategy.id || "").toUpperCase();
    if (cat.indexOf("security") >= 0 || id.indexOf("SEC") === 0) return "SecurityEngine";
    if (cat.indexOf("math") >= 0 || cat.indexOf("calcul") >= 0 || id.indexOf("MATH") === 0) return "MathEngine";
    if (cat.indexOf("storage") >= 0 || cat.indexOf("database") >= 0 || id.indexOf("STOR") === 0) return "StorageEngine";
    if (cat === "ui" || id.indexOf("UI-") === 0) return "UIEngine";
    if (cat === "ux" || id.indexOf("UX-") === 0) return "UXEngine";
    if (cat.indexOf("responsive") >= 0) return "ResponsiveEngine";
    if (cat.indexOf("performance") >= 0) return "PerformanceEngine";
    if (cat.indexOf("syntax") >= 0) return "SyntaxEngine";
    if (cat.indexOf("architecture") >= 0 || cat.indexOf("structure") >= 0) return "ArchitectureEngine";
    if (cat.indexOf("code") >= 0 || cat.indexOf("logic") >= 0) return "CodeLogicEngine";
    return "CodeLogicEngine";
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
      var key = (p.file_name || p.file || "") + "|" + (p.line || 0) + "|" + (p.category || "") + "|" +
                (p.rule_id || (p.simple && p.simple.id) || (p.description || "").slice(0, 40));
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
        if (!prev.engines) prev.engines = [];
        if (p.engineId && prev.engines.indexOf(p.engineId) === -1) prev.engines.push(p.engineId);
      }
    }
    return out;
  }

  function attachPlanMeta(result, plan) {
    result = result || {};
    result.supervisor = {
      version: "V10.0",
      plan: plan,
      enginesPlanned: (plan && plan.engines) || [],
      specializedPlanned: (plan && plan.specialized) || [],
      specializedCount: (plan && plan.specializedCount) || 0,
      isolation: !!(plan && plan.isolation),
      correlated: true
    };
    return result;
  }

  /**
   * Engine contract helper — engines report status via this shape.
   */
  function makeEngineResult(engineId, status, candidates, evidence, executionTimeMs) {
    return {
      engineId: engineId,
      category: (ENGINE_REGISTRY[engineId] && ENGINE_REGISTRY[engineId].category) || "unknown",
      status: status || "completed", // completed | skipped | failed | cancelled | paused
      candidates: candidates || [],
      evidence: evidence || [],
      validation: null,
      rootCauseCandidates: [],
      executionTime: executionTimeMs || 0
    };
  }

  global.ADSupervisor = {
    version: "V10.0",
    buildPlan: buildPlan,
    isEngineAllowed: isEngineAllowed,
    strategyToEngine: strategyToEngine,
    correlateFindings: correlateFindings,
    attachPlanMeta: attachPlanMeta,
    makeEngineResult: makeEngineResult,
    ENGINE_PLANS: ENGINE_PLANS,
    ENGINE_REGISTRY: ENGINE_REGISTRY
  };
})(typeof window !== "undefined" ? window : globalThis);
