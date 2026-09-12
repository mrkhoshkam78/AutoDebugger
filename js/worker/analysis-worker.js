/* Auto Debugger V6 — Analysis Web Worker */
/* global importScripts, ADUtils, ADProjectMapper, ADDebugEngine, ADAst, ADStrategies */

var BASE = self.location.href.replace(/[^/]+$/, "");
try {
  importScripts(
    BASE + "../lib/utils.js",
    BASE + "../analysis-standards.js",
    BASE + "../strategies.js",
    BASE + "../project-mapper.js",
    BASE + "../ast.js",
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

    self.postMessage({ type: "progress", stage: "understand", percent: 6, detail: "Understanding project" });
    var graph = null;
    if (typeof ADProjectMapper !== "undefined") {
      graph = new ADProjectMapper.ProjectMapper(files).map();
    }
    self.postMessage({ type: "progress", stage: "context", percent: 14, detail: "Mapping context" });

    var astMap = null;
    if (typeof ADAst !== "undefined") {
      self.postMessage({ type: "progress", stage: "ast", percent: 24, detail: "Structural parsing" });
      astMap = ADAst.analyzeProject(files);
    }

    self.postMessage({ type: "progress", stage: "model", percent: 34, detail: "Building code model" });
    // Code model is built inside DebugEngine.run (V6)

    self.postMessage({ type: "progress", stage: "select", percent: 42, detail: "Selecting strategies" });
    var engine = new ADDebugEngine.DebugEngine(files, language, category, level, graph);
    if (astMap) engine.astMap = astMap;

    self.postMessage({ type: "progress", stage: "analyze", percent: 52, detail: "Running analysis" });
    var result = engine.run();

    self.postMessage({ type: "progress", stage: "security", percent: 72, detail: "Security & data-flow" });
    if (astMap && ADAst.hasSourceToSink) {
      var flow = ADAst.hasSourceToSink(astMap);
      result.ast_flow = flow;
    }
    if (engine.codeModel) {
      result.code_model_summary = {
        dataFlows: (engine.codeModel.dataFlows || []).length,
        symbols: Object.keys(engine.codeModel.symbolTable || {}).length,
        functions: Object.keys(engine.codeModel.functionMap || {}).length
      };
    }

    self.postMessage({ type: "progress", stage: "merge", percent: 88, detail: "Merging findings" });
    result.strategies_count = result.strategies_count || (result.strategies_run || []).length;
    result.version = "V6";
    self.postMessage({ type: "progress", stage: "report", percent: 96, detail: "Generating report" });
    self.postMessage({ type: "result", result: result });
  } catch (err) {
    self.postMessage({ type: "error", message: (err && err.message) || String(err) });
  }
};
