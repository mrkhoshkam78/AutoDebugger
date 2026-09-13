/* Auto Debugger V6+ — Smart Analysis Orchestrator (Web Worker) */
/* global importScripts, ADUtils, ADProjectMapper, ADDebugEngine, ADAst, ADStrategies, ADCore, ADStage2, ADStage3, ADResultsStore, ADStandards, ADCache */

var BASE = self.location.href.replace(/[^/]+$/, "");
try {
  importScripts(
    BASE + "../lib/utils.js",
    BASE + "../analysis-cache.js",
    BASE + "../analysis-standards.js",
    BASE + "../explanation.js",
    BASE + "../strategies.js",
    BASE + "../project-mapper.js",
    BASE + "../ast.js",
    BASE + "../analysis-core.js",
    BASE + "../stage2-core.js",
    BASE + "../stage3-core.js",
    BASE + "../results-store.js",
    BASE + "../engines/debug-engine.js"
  );
} catch (e) {
  self.postMessage({ type: "error", message: "Worker import failed: " + (e && e.message) });
}

function progress(stage, percent, detail) {
  self.postMessage({ type: "progress", stage: stage, percent: percent, detail: detail });
}

self.onmessage = function (ev) {
  var data = ev.data || {};
  if (data.type === "clearCache") {
    if (typeof ADCache !== "undefined") ADCache.clear();
    self.postMessage({ type: "cacheCleared" });
    return;
  }
  if (data.type !== "analyze") return;

  try {
    var files = data.files || {};
    var language = data.language || "auto";
    var category = data.category || "Test All";
    var level = data.level || 1;
    var t0 = Date.now();

    // 1 Understanding
    progress("understand", 4, "Understanding project");
    var graph = null;
    if (typeof ADProjectMapper !== "undefined") {
      graph = new ADProjectMapper.ProjectMapper(files).map();
    }

    // 2 Context
    progress("context", 10, "Mapping context + languages");
    var fileCount = Object.keys(files).length;

    // 3 AST (cached)
    progress("ast", 18, "Parsing AST (cache-aware)");
    var astMap = null;
    var cacheStats = { parsed: 0, cached: 0 };
    if (typeof ADAst !== "undefined") {
      astMap = ADAst.analyzeProject(files);
      if (astMap && astMap.__cacheStats) cacheStats = astMap.__cacheStats;
    }

    // 4 Strategy selection preview (category-aware)
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

    // 5 Engine run (includes Stage1 model/flow inside)
    progress("model", 40, "Building code model + data-flow");
    var engine = new ADDebugEngine.DebugEngine(files, language, category, level, graph);
    if (astMap) engine.astMap = astMap;

    progress("analyze", 48, "Running category strategies");
    var result = engine.run();

    // 6 Stage summaries already computed inside engine
    progress("flow", 62, "Data-flow / CFG / symbolic");
    if (engine.cfgIssues) {
      progress("flow", 66, "CFG issues: " + (engine.cfgIssues.length || 0));
    }

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

    progress("merge", 92, "Merging findings");
    result.strategies_count = result.strategies_count || (result.strategies_run || []).length;
    result.strategies_selected_preview = (selPreview.selected || []).map(function (s) { return s.id; });
    result.cache_stats = cacheStats;
    result.worker_ms = Date.now() - t0;
    result.version = "V6-SmartWorker";

    progress("report", 98, "Complete · " + (result.problems || []).length + " findings · " + result.worker_ms + "ms");
    self.postMessage({ type: "result", result: result });
  } catch (err) {
    self.postMessage({ type: "error", message: (err && err.message) || String(err) });
  }
};
