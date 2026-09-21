/* Auto Debugger V9.0 — Smart Analysis Orchestrator (Web Worker)
 * Supports: RUN / PAUSE / RESUME / CANCEL
 * States: IDLE | RUNNING | PAUSING | PAUSED | RESUMING | CANCELLING | CANCELLED | COMPLETED | FAILED
 */
/* global importScripts, ADUtils, ADProjectMapper, ADDebugEngine, ADAst, ADStrategies, ADCore, ADStage2, ADStage3, ADResultsStore, ADStandards, ADCache, ADSupervisor */

var BASE = self.location.href.replace(/[^/]+$/, "");
try {
  importScripts(
    BASE + "../lib/utils.js",
    BASE + "../analysis-cache.js",
    BASE + "../supervisor.js",
    BASE + "../analysis-standards.js",
    BASE + "../explanation.js",
    BASE + "../strategies.js",
    BASE + "../project-mapper.js",
    BASE + "../ast.js",
    BASE + "../analysis-core.js",
    BASE + "../stage2-core.js",
    BASE + "../stage3-core.js",
    BASE + "../results-store.js",
    BASE + "../engines/debug-engine.js",
    BASE + "../central-intelligence.js"
  );
} catch (e) {
  self.postMessage({ type: "error", message: "Worker import failed: " + (e && e.message) });
}

/** Cooperative control state — checked between stages / strategies */
var control = {
  state: "IDLE",
  cancelRequested: false,
  pauseRequested: false,
  resumeRequested: false
};

function setState(s) {
  control.state = s;
  self.postMessage({ type: "state", state: s });
}

function progress(stage, percent, detail) {
  if (control.cancelRequested || control.state === "CANCELLING" || control.state === "CANCELLED") return;
  self.postMessage({ type: "progress", stage: stage, percent: percent, detail: detail, state: control.state });
}

/** Cooperative wait for pause/resume. Throws on cancel. */
function checkControl() {
  if (control.cancelRequested || control.state === "CANCELLING") {
    control.state = "CANCELLED";
    throw new Error("ANALYSIS_CANCELLED");
  }
  if (control.pauseRequested || control.state === "PAUSING") {
    control.state = "PAUSED";
    setState("PAUSED");
    var start = Date.now();
    while (control.state === "PAUSED") {
      if (control.cancelRequested) {
        control.state = "CANCELLED";
        throw new Error("ANALYSIS_CANCELLED");
      }
      if (control.resumeRequested) {
        control.resumeRequested = false;
        control.pauseRequested = false;
        control.state = "RESUMING";
        setState("RESUMING");
        control.state = "RUNNING";
        setState("RUNNING");
        break;
      }
      if (Date.now() - start > 30000) {
        control.resumeRequested = true;
      }
    }
  }
}

self.onmessage = function (ev) {
  var data = ev.data || {};

  if (data.type === "clearCache") {
    if (typeof ADCache !== "undefined") ADCache.clear();
    self.postMessage({ type: "cacheCleared" });
    return;
  }

  if (data.type === "cancel") {
    control.cancelRequested = true;
    control.pauseRequested = false;
    control.resumeRequested = false;
    if (control.state === "RUNNING" || control.state === "PAUSED" || control.state === "PAUSING" || control.state === "RESUMING") {
      setState("CANCELLING");
    }
    return;
  }

  if (data.type === "pause") {
    if (control.state === "RUNNING") {
      control.pauseRequested = true;
      setState("PAUSING");
    }
    return;
  }

  if (data.type === "resume") {
    if (control.state === "PAUSED" || control.state === "PAUSING") {
      control.resumeRequested = true;
      control.pauseRequested = false;
    }
    return;
  }

  if (data.type !== "analyze") return;

  control.cancelRequested = false;
  control.pauseRequested = false;
  control.resumeRequested = false;
  setState("RUNNING");

  try {
    var files = data.files || {};
    var language = data.language || "auto";
    var uiLang = data.uiLang || "en";
    // Make UI language available to explanation layer inside worker
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem("ad_lang", uiLang);
    } catch (e) {}
    self.__AD_UI_LANG = uiLang;
    var category = data.category || "Test All";
    var level = data.level || 1;
    var t0 = Date.now();

    checkControl();
    progress("understand", 4, "Understanding project");
    var graph = null;
    if (typeof ADProjectMapper !== "undefined") {
      graph = new ADProjectMapper.ProjectMapper(files).map();
    }

    checkControl();
    progress("context", 10, "Mapping context + languages");
    var fileCount = Object.keys(files).length;

    checkControl();
    progress("ast", 18, "Parsing AST (cache-aware)");
    var astMap = null;
    var cacheStats = { parsed: 0, cached: 0 };
    if (typeof ADAst !== "undefined") {
      astMap = ADAst.analyzeProject(files);
      if (astMap && astMap.__cacheStats) cacheStats = astMap.__cacheStats;
    }

    checkControl();
    var plan = null;
    if (typeof ADSupervisor !== "undefined" && ADSupervisor.buildPlan) {
      plan = ADSupervisor.buildPlan({
        category: category,
        level: level,
        language: language,
        fileCount: fileCount
      });
      progress("select", 24, "Supervisor V9 plan: " + ((plan.specialized || []).join(", ") || "shared") + " (" + (plan.specializedCount || 0) + " specialized)");
    }

    progress("select", 28, "Selecting strategies for: " + category);
    var ctxPreview = { has: {}, languages: {}, fileCount: fileCount };
    if (graph && graph.languages) {
      Object.keys(graph.languages).forEach(function (l) {
        ctxPreview.languages[l] = graph.languages[l];
        if (l === "html") ctxPreview.has.html = true;
        if (l === "css") ctxPreview.has.css = true;
        if (l === "javascript") ctxPreview.has.js = true;
        if (l === "typescript") ctxPreview.has.ts = true;
      });
    }
    var selPreview = { selected: [], cap: 0 };
    if (typeof ADStrategies !== "undefined" && ADStrategies.selectStrategies) {
      selPreview = ADStrategies.selectStrategies(category, level, ctxPreview);
    }
    progress("select", 34, (selPreview.selected || []).length + " strategies selected (cap " + (selPreview.cap || "?") + ")");

    checkControl();
    progress("model", 40, "Building code model + data-flow");
    var engine = new ADDebugEngine.DebugEngine(files, language, category, level, graph);
    if (astMap) engine.astMap = astMap;
    if (plan) engine.supervisorPlan = plan;

    progress("analyze", 48, "Running category strategies");
    checkControl();
    var result = engine.run();

    checkControl();
    progress("flow", 62, "Data-flow / CFG / symbolic");
    if (engine.cfgIssues) {
      progress("flow", 66, "CFG issues: " + (engine.cfgIssues.length || 0));
    }

    checkControl();
    progress("validate", 72, "Validation + category filter");
    if (engine.stage2) {
      progress("stage2", 78, "Tests / mutation / dependency");
      result.stage2 = engine.stage2;
      result.stage2_summary = {
        tests: (engine.stage2.generatedTests || []).length,
        mutations: engine.stage2.mutations ? engine.stage2.mutations.total : 0,
        mutationKillRatio: engine.stage2.mutations ? engine.stage2.mutations.killRatio : 0,
        deps: (engine.stage2.dependencyFindings || []).length,
        api: (engine.stage2.apiFindings || []).length,
        regression: engine.stage2.regression || null
      };
    }

    if (engine.stage3) {
      checkControl();
      progress("stage3", 86, "Correlation / DOM / evidence graph");
      result.stage3 = engine.stage3;
      result.stage3_summary = engine.stage3.summary || null;
    }

    if (engine.codeModel) {
      result.code_model_summary = {
        dataFlows: (engine.codeModel.dataFlows || []).length,
        symbols: Object.keys(engine.codeModel.symbolTable || {}).length,
        cfgIssues: (engine.cfgIssues || []).length,
        symbolicFindings: (engine.symbolicFindings || []).length,
        moduleEdges: (engine.moduleGraph && engine.moduleGraph.edges) ? engine.moduleGraph.edges.length : 0
      };
    }

    checkControl();
    progress("merge", 92, "Merging findings");
    result.strategies_count = result.strategies_count || (result.strategies_run || []).length;
    result.strategies_selected_preview = (selPreview.selected || []).map(function (s) { return s.id; });
    result.cache_stats = cacheStats;
    result.worker_ms = Date.now() - t0;
    result.version = "V9.0";
    result.engines_executed = (plan && plan.specialized) || [];
    result.engines_planned = (plan && plan.engines) || [];
    if (typeof ADSupervisor !== "undefined") {
      if (ADSupervisor.correlateFindings) {
        result.problems = ADSupervisor.correlateFindings(result.problems || []);
      }
      if (plan && ADSupervisor.attachPlanMeta) {
        ADSupervisor.attachPlanMeta(result, plan);
      }
    }

    // Central Intelligence — meta-review after engines + correlation
    checkControl();
    progress("intelligence", 94, "Central Intelligence review");
    if (typeof ADCentralIntelligence !== "undefined" && ADCentralIntelligence.review) {
      try {
        result = ADCentralIntelligence.review(result, { category: category, level: level });
        var ci = result.centralIntelligence || {};
        progress("intelligence", 96, "CI: " + (ci.outputCount || 0) + " kept · " + (ci.suppressed || 0) + " suppressed · " + (ci.actionableCount || 0) + " prompt-ready");
      } catch (ciErr) {
        result.centralIntelligence = { error: String(ciErr && ciErr.message || ciErr), version: "V9-CI" };
      }
    }

    if (control.cancelRequested || control.state === "CANCELLING" || control.state === "CANCELLED") {
      setState("CANCELLED");
      self.postMessage({ type: "cancelled", message: "Analysis cancelled by user" });
      return;
    }

    progress("report", 98, "Complete · " + (result.problems || []).length + " findings · " + result.worker_ms + "ms");
    setState("COMPLETED");
    self.postMessage({ type: "result", result: result });
  } catch (err) {
    if (err && err.message === "ANALYSIS_CANCELLED") {
      setState("CANCELLED");
      self.postMessage({ type: "cancelled", message: "Analysis cancelled by user" });
    } else {
      setState("FAILED");
      self.postMessage({ type: "error", message: (err && err.message) || String(err) });
    }
  }
};
