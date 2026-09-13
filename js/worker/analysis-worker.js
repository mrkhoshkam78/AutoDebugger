/* Auto Debugger V6 Stage-3 — Analysis Web Worker */
/* global importScripts, ADUtils, ADProjectMapper, ADDebugEngine, ADAst, ADStrategies, ADCore, ADStage2, ADStage3, ADResultsStore, ADStandards */

var BASE = self.location.href.replace(/[^/]+$/, "");
try {
  importScripts(
    BASE + "../lib/utils.js",
    BASE + "../analysis-standards.js",
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

self.onmessage = function (ev) {
  var data = ev.data || {};
  if (data.type !== "analyze") return;
  try {
    var files = data.files || {};
    var language = data.language || "auto";
    var category = data.category || "Test All";
    var level = data.level || 1;

    self.postMessage({ type: "progress", stage: "understand", percent: 4, detail: "Understanding project" });
    var graph = null;
    if (typeof ADProjectMapper !== "undefined") {
      graph = new ADProjectMapper.ProjectMapper(files).map();
    }
    self.postMessage({ type: "progress", stage: "context", percent: 10, detail: "Mapping context" });

    var astMap = null;
    if (typeof ADAst !== "undefined") {
      self.postMessage({ type: "progress", stage: "ast", percent: 18, detail: "Structural parsing" });
      astMap = ADAst.analyzeProject(files);
    }

    self.postMessage({ type: "progress", stage: "model", percent: 28, detail: "Code model + module graph" });
    self.postMessage({ type: "progress", stage: "flow", percent: 36, detail: "Data-flow / CFG / symbolic" });

    self.postMessage({ type: "progress", stage: "select", percent: 44, detail: "Selecting strategies" });
    var engine = new ADDebugEngine.DebugEngine(files, language, category, level, graph);
    if (astMap) engine.astMap = astMap;

    self.postMessage({ type: "progress", stage: "analyze", percent: 55, detail: "Static analysis" });
    var result = engine.run();

    self.postMessage({ type: "progress", stage: "stage2", percent: 68, detail: "Tests / mutation / dependency / regression" });
    if (engine.stage2) {
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
    self.postMessage({ type: "progress", stage: "stage3", percent: 82, detail: "Correlation / Evidence Graph / DOM / Git" });
    if (engine.stage3) {
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

    self.postMessage({ type: "progress", stage: "merge", percent: 90, detail: "Merging findings" });
    result.strategies_count = result.strategies_count || (result.strategies_run || []).length;
    result.version = "V6-Stage3";
    self.postMessage({ type: "progress", stage: "report", percent: 97, detail: "Generating report" });
    self.postMessage({ type: "result", result: result });
  } catch (err) {
    self.postMessage({ type: "error", message: (err && err.message || String(err)) });
  }
};
