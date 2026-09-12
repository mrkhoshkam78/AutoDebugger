(function(global){
/**
 * Local Knowledge Database — IndexedDB (offline, no server)
 * Stores previous bugs, patterns, root causes, confidence, frequency.
 */

const DB_NAME = "AutoDebuggerKnowledge";
const DB_VERSION = 1;
const STORE = "patterns";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("language", "language", { unique: false });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("severity", "severity", { unique: false });
        store.createIndex("patternKey", "patternKey", { unique: false });
      }
    };
  });
  return dbPromise;
}

async function savePattern(entry) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const record = {
        ...entry,
        timestamp: Date.now(),
        frequency: entry.frequency || 1
      };
      // Try to increment existing similar pattern
      const idx = store.index("patternKey");
      const key = entry.patternKey || `${entry.language}|${entry.category}|${entry.description?.slice(0, 80)}`;
      const q = idx.getAll(key);
      q.onsuccess = () => {
        if (q.result && q.result.length) {
          const existing = q.result[0];
          existing.frequency = (existing.frequency || 1) + 1;
          existing.confidence = Math.min(0.99, (existing.confidence || 0.5) + 0.05);
          existing.lastSeen = Date.now();
          store.put(existing);
          resolve(existing);
        } else {
          record.patternKey = key;
          record.confidence = entry.confidence || 0.6;
          store.add(record);
          resolve(record);
        }
      };
      q.onerror = () => {
        store.add(record);
        resolve(record);
      };
    });
  } catch (e) {
    console.warn("KnowledgeDB save failed (private mode?)", e);
    return null;
  }
}

async function queryPatterns({ language, category, limit = 20 } = {}) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        let rows = req.result || [];
        if (language) rows = rows.filter(r => r.language === language);
        if (category) rows = rows.filter(r => r.category === category);
        rows.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
        resolve(rows.slice(0, limit));
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function getStats() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve({ totalPatterns: req.result });
      req.onerror = () => resolve({ totalPatterns: 0 });
    });
  } catch {
    return { totalPatterns: 0 };
  }
}

async function clearKnowledge() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

global.ADKnowledge = { savePattern, queryPatterns, getStats, clearKnowledge };
})(typeof window !== 'undefined' ? window : globalThis);
