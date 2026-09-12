/**
 * Persistent Results Store — IndexedDB (V2.0)
 * Findings survive category changes, refresh, theme/language switches.
 */
(function (global) {
  "use strict";

  var DB_NAME = "AutoDebuggerResults";
  var DB_VERSION = 1;
  var STORE = "findings";
  var META = "meta";
  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () { resolve(req.result); };
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var st = db.createObjectStore(STORE, { keyPath: "stable_id" });
          st.createIndex("projectKey", "projectKey", { unique: false });
          st.createIndex("severity", "severity", { unique: false });
          st.createIndex("category", "category", { unique: false });
        }
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, { keyPath: "key" });
        }
      };
    });
    return dbPromise;
  }

  /** Stable identity for deduplication */
  function stableId(finding, projectKey) {
    var base = [
      projectKey || "default",
      finding.rule_id || finding.ruleId || "",
      finding.file_name || "",
      finding.line || 0,
      (finding.description || "").slice(0, 80)
    ].join("|");
    var h = 0;
    for (var i = 0; i < base.length; i++) {
      h = ((h << 5) - h) + base.charCodeAt(i);
      h |= 0;
    }
    return "DBG-" + Math.abs(h).toString(16);
  }

  function projectKeyFromFiles(files) {
    var names = Object.keys(files || {}).sort();
    return names.slice(0, 20).join(";") || "empty";
  }

  async function loadFindings(projectKey) {
    try {
      var db = await openDB();
      return await new Promise(function (resolve) {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).index("projectKey").getAll(projectKey);
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
      });
    } catch (e) {
      return [];
    }
  }

  async function saveFindings(projectKey, findings) {
    try {
      var db = await openDB();
      return await new Promise(function (resolve) {
        var tx = db.transaction(STORE, "readwrite");
        var st = tx.objectStore(STORE);
        var i = 0;
        function next() {
          if (i >= findings.length) return;
          var f = findings[i++];
          f.projectKey = projectKey;
          f.stable_id = f.stable_id || stableId(f, projectKey);
          st.put(f);
        }
        // clear old for this project then put — merge handled by caller
        var idx = st.index("projectKey");
        var g = idx.getAllKeys(projectKey);
        g.onsuccess = function () {
          var keys = g.result || [];
          keys.forEach(function (k) { st.delete(k); });
          findings.forEach(function (f) {
            f.projectKey = projectKey;
            f.stable_id = f.stable_id || stableId(f, projectKey);
            st.put(f);
          });
        };
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    } catch (e) {
      return false;
    }
  }

  /**
   * Merge new findings into existing list (dedupe by stable_id).
   */
  function mergeFindings(existing, incoming, projectKey) {
    var map = {};
    var now = Date.now();
    (existing || []).forEach(function (f) {
      var id = f.stable_id || stableId(f, projectKey);
      f.stable_id = id;
      map[id] = f;
    });
    (incoming || []).forEach(function (f) {
      var id = stableId(f, projectKey);
      f.stable_id = id;
      f.projectKey = projectKey;
      if (map[id]) {
        var prev = map[id];
        prev.last_updated = now;
        prev.detecting_strategies = uniqueArr((prev.detecting_strategies || []).concat(f.detecting_strategies || [f.rule_id || f.test_detected]));
        prev.related_categories = uniqueArr((prev.related_categories || [prev.category]).concat([f.category]));
        if ((f.confidence || 0) > (prev.confidence || 0)) prev.confidence = f.confidence;
        if (severityRank(f.severity) > severityRank(prev.severity)) prev.severity = f.severity;
        if (f.evidence && prev.evidence && f.evidence !== prev.evidence) {
          prev.evidence = prev.evidence + " | " + f.evidence;
        }
        if (f.status === "CONFIRMED") prev.status = "CONFIRMED";
        map[id] = prev;
      } else {
        f.first_detected = now;
        f.last_updated = now;
        f.detecting_strategies = f.detecting_strategies || [f.rule_id || f.test_detected || "unknown"];
        f.related_categories = f.related_categories || [f.category];
        map[id] = f;
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function uniqueArr(arr) {
    var o = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v && !o[v]) { o[v] = 1; out.push(v); }
    }
    return out;
  }

  function severityRank(s) {
    return { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[s] || 0;
  }

  async function clearProject(projectKey) {
    try {
      var db = await openDB();
      return await new Promise(function (resolve) {
        var tx = db.transaction(STORE, "readwrite");
        var st = tx.objectStore(STORE);
        var idx = st.index("projectKey");
        var g = idx.getAllKeys(projectKey);
        g.onsuccess = function () {
          (g.result || []).forEach(function (k) { st.delete(k); });
        };
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    } catch (e) {
      return false;
    }
  }

  global.ADResultsStore = {
    stableId: stableId,
    projectKeyFromFiles: projectKeyFromFiles,
    loadFindings: loadFindings,
    saveFindings: saveFindings,
    mergeFindings: mergeFindings,
    clearProject: clearProject
  };
})(typeof window !== "undefined" ? window : globalThis);
