/**
 * Auto Debugger — Analysis Cache (browser-only)
 * File hash → AST / Code Model / Module Graph reuse
 */
(function (global) {
  "use strict";

  var astCache = Object.create(null);      // hash -> { file, ast, ts }
  var modelCache = Object.create(null);    // projectKey+hashes -> model
  var MAX_AST = 200;
  var MAX_MODEL = 20;

  function djb2(str) {
    var h = 5381;
    str = String(str || "");
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h |= 0;
    }
    return (h >>> 0).toString(16);
  }

  function fileHash(path, content) {
    return djb2(path + "\0" + (content || "").length + "\0" + (content || "").slice(0, 2000) + "\0" + (content || "").slice(-500));
  }

  function projectKey(files) {
    var names = Object.keys(files || {}).sort();
    var parts = names.map(function (n) { return n + ":" + fileHash(n, files[n]); });
    return djb2(parts.join("|"));
  }

  function getAst(path, content, builder) {
    var h = fileHash(path, content);
    var hit = astCache[h];
    if (hit && hit.path === path) {
      hit.hits = (hit.hits || 0) + 1;
      return { ast: hit.ast, hash: h, cached: true };
    }
    var ast = builder(content, path);
    // eviction simple
    var keys = Object.keys(astCache);
    if (keys.length >= MAX_AST) {
      delete astCache[keys[0]];
    }
    astCache[h] = { path: path, ast: ast, ts: Date.now(), hits: 0 };
    return { ast: ast, hash: h, cached: false };
  }

  function analyzeProjectCached(files, analyzeOne) {
    var map = {};
    var stats = { parsed: 0, cached: 0 };
    var names = Object.keys(files || {});
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var ext = (n.split(".").pop() || "").toLowerCase();
      if (["js", "ts", "jsx", "tsx", "mjs"].indexOf(ext) === -1) continue;
      var r = getAst(n, files[n], analyzeOne);
      map[n] = r.ast;
      if (r.cached) stats.cached++; else stats.parsed++;
    }
    return { map: map, stats: stats, projectKey: projectKey(files) };
  }

  function getModel(pkey, builder) {
    if (modelCache[pkey]) {
      modelCache[pkey].hits = (modelCache[pkey].hits || 0) + 1;
      return { model: modelCache[pkey].model, cached: true };
    }
    var model = builder();
    var keys = Object.keys(modelCache);
    if (keys.length >= MAX_MODEL) delete modelCache[keys[0]];
    modelCache[pkey] = { model: model, ts: Date.now(), hits: 0 };
    return { model: model, cached: false };
  }

  function clear() {
    astCache = Object.create(null);
    modelCache = Object.create(null);
  }

  function stats() {
    return {
      astEntries: Object.keys(astCache).length,
      modelEntries: Object.keys(modelCache).length
    };
  }

  global.ADCache = {
    fileHash: fileHash,
    projectKey: projectKey,
    getAst: getAst,
    analyzeProjectCached: analyzeProjectCached,
    getModel: getModel,
    clear: clear,
    stats: stats
  };
})(typeof window !== "undefined" ? window : globalThis);
