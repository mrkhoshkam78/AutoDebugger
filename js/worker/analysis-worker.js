/* Auto Debugger V10.1.0 — Smart Analysis Orchestrator (Web Worker)
 * Supports: RUN / PAUSE / RESUME / CANCEL
 * States: IDLE | RUNNING | PAUSING | PAUSED | RESUMING | CANCELLING | CANCELLED | COMPLETED | FAILED
 * V10.1.0: non-blocking pause (no busy-wait), progress throttle, faster path
 */
/* global importScripts, ADUtils, ADProjectMapper, ADDebugEngine, ADAst, ADStrategies, ADCore, ADStage2, ADStage3, ADResultsStore, ADStandards, ADCache, ADSupervisor, ADCentralIntelligence */

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
  resumeRequested: false,
  _resumeWaiters: null,
  _lastProgressTs: 0,
  _lastProgressPct: -1
};

function setState(s) {
  control.state = s;
  self.postMessage({ type: "state", state: s });
}

/** Throttled progress — max ~20 updates/sec and skip tiny pct changes */
function progress(stage, percent, detail) {
  if (control.cancelRequested || control.state === "CANCELLING" || control.state === "CANCELLED") return;
  var now = Date.now();
  var pct = Math.round(percent);
  if (pct < 98 && control._lastProgressTs && (now - control._lastProgressTs) < 50 && Math.abs(pct - control._lastProgressPct) < 2) {
    return;
  }
  control._lastProgressTs = now;
  control._lastProgressPct = pct;
  self.postMessage({ type: "progress", stage: stage, percent: pct, detail: detail, state: control.state });
}

function rejectWaiters(err) {
  var w = control._resumeWaiters;
  control._resumeWaiters = null;
  if (!w) return;
  for (var i = 0; i < w.length; i++) {
    try { w[i].reject(err); } catch (e) {}
  }
}

function resolveWaiters() {
  var w = control._resumeWaiters;
  control._resumeWaiters = null;
  if (!w) return;
  for (var i = 0; i < w.length; i++) {
    try { w[i].resolve(); } catch (e) {}
  }
}

/**
 * Non-blocking pause barrier — yields the worker event loop so resume/cancel messages are processed.
 * Replaces the old busy-wait while-loop that blocked onmessage.
 */
function checkControl() {
  if (control.cancelRequested || control.state === "CANCELLING") {
    control.state = "CANCELLED";
    rejectWaiters(new Error("ANALYSIS_CANCELLED"));
    throw new Error("ANALYSIS_CANCELLED");
  }
  if (!(control.pauseRequested || control.state === "PAUSING" || control.state === "PAUSED")) {
    return Promise.resolve();
  }
  control.state = "PAUSED";
  setState("PAUSED");
  return new Promise(function (resolve, reject) {
    if (!control._resumeWaiters) control._resumeWaiters = [];
    control._resumeWaiters.push({ resolve: resolve, reject: reject });
    // Safety auto-resume after 120s to avoid permanent hang
    setTimeout(function () {
      if (control.state === "PAUSED" && control._resumeWaiters) {
        control.resumeRequested = true;
        control.pauseRequested = false;
        control.state = "RUNNING";
        setState("RUNNING");
        resolveWaiters();
      }
    }, 120000);
  }).then(function () {
    if (control.cancelRequested) {
      control.state = "CANCELLED";
      throw new Error("ANALYSIS_CANCELLED");
    }
    control.pauseRequested = false;
    control.resumeRequested = false;
    control.state = "RUNNING";
    setState("RUNNING");
  });
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
    rejectWaiters(new Error("ANALYSIS_CANCELLED"));
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
      control.state = "RESUMING";
      setState("RESUMING");
      resolveWaiters();
    }
    return;
  }

  if (data.type !== "analyze") return;

  // Prevent overlapping runs
  if (control.state === "RUNNING" || control.state === "PAUSED" || control.state === "PAUSING") {
    self.postMessage({ type: "error", message: "Analysis already in progress" });
    return;
  }

  control.cancelRequested = false;
  control.pauseRequested = false;
  control.resumeRequested = false;
  control._lastProgressTs = 0;
  control._lastProgressPct = -1;
  setState("RUNNING");

  runAnalyze(data).catch(function (err) {
    if (err && err.message === "ANALYSIS_CANCELLED") {
      setState("CANCELLED");
      self.postMessage({ type: "cancelled", message: "Analysis cancelled by user" });
    } else {
      setState("FAILED");
      self.postMessage({ type: "error", message: (err && err.message) || String(err) });
    }
  });
};

async function runAnalyze(data) {
  try {
    var files = data.files || {};
    var language = data.language || "auto";
    var uiLang = data.uiLang || "en";
    // Make UI language available to explanation layer inside worker
    self.__AD_UI_LANG = uiLang;
    try { if (typeof ADi18n !== "undefined" && ADi18n.setLang) ADi18n.setLang(uiLang); } catch (e) {}
    var category = data.category || "Test All";
    var level = data.level || 1;
    var t0 = Date.now();

    await checkControl();
    progress("understand", 4, "Understanding project");
    var graph = null;
    if (typeof ADProjectMapper !== "undefined") {
      graph = new ADProjectMapper.ProjectMapper(files).map();
    }

    await checkControl();
    progress("context", 10, "Mapping context + languages");
    var fileCount = Object.keys(files).length;

    await checkControl();
    progress("ast", 18, "Parsing AST (cache-aware)");
    var astMap = null;
    var cacheStats = { parsed: 0, cached: 0 };
    if (typeof ADAst !== "undefined") {
      astMap = ADAst.analyzeProject(files);
      if (astMap && astMap.__cacheStats) cacheStats = astMap.__cacheStats;
    }

    await checkControl();
    var plan = null;
    if (typeof ADSupervisor !== "undefined" && ADSupervisor.buildPlan) {
      plan = ADSupervisor.buildPlan({
        category: category,
        level: level,
        language: language,
        fileCount: fileCount
      });
      progress("select", 24, "Supervisor V10 plan: " + ((plan.specialized || []).join(", ") || "shared") + " (" + (plan.specializedCount || 0) + " specialized)");
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

    await checkControl();
    progress("model", 40, "Building code model + data-flow");
    var engine = new ADDebugEngine.DebugEngine(files, language, category, level, graph);
    if (astMap) engine.astMap = astMap;
    if (plan) engine.supervisorPlan = plan;

    progress("analyze", 48, "Running category strategies");
    await checkControl();
    var result = engine.run();

    await checkControl();
    progress("flow", 62, "Data-flow / CFG / symbolic");
    if (engine.cfgIssues) {
      progress("flow", 66, "CFG issues: " + (engine.cfgIssues.length || 0));
    }

    await checkControl();
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
      await checkControl();
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

    await checkControl();
    progress("merge", 92, "Merging findings");
    result.strategies_count = result.strategies_count || (result.strategies_run || []).length;
    result.strategies_selected_preview = (selPreview.selected || []).map(function (s) { return s.id; });
    result.cache_stats = cacheStats;
    result.worker_ms = Date.now() - t0;
    result.version = "V10.1.0";
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
    await checkControl();
    progress("intelligence", 94, "Central Intelligence review");
    if (typeof ADCentralIntelligence !== "undefined" && ADCentralIntelligence.review) {
      try {
        result = ADCentralIntelligence.review(result, { category: category, level: level });
        var ci = result.centralIntelligence || {};
        progress("intelligence", 96, "CI: " + (ci.outputCount || 0) + " kept · " + (ci.suppressed || 0) + " suppressed · " + (ci.actionableCount || 0) + " prompt-ready");
      } catch (ciErr) {
        result.centralIntelligence = { error: String(ciErr && ciErr.message || ciErr), version: "V10.1.0-CI" };
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
}
