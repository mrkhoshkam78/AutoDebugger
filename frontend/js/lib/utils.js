(function(global){
/**
 * Shared utilities — Auto Debugger V1.1 Client-Side
 */

const SUPPORTED_EXTENSIONS = {
  ".html": "html", ".htm": "html",
  ".css": "css",
  ".js": "javascript", ".mjs": "javascript", ".jsx": "javascript",
  ".ts": "typescript", ".tsx": "typescript",
  ".json": "json",
  ".py": "python",
  ".java": "java",
  ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
  ".php": "php",
  ".rb": "ruby", ".go": "go", ".rs": "rust",
  ".md": "markdown", ".txt": "text", ".xml": "xml",
  ".yml": "yaml", ".yaml": "yaml"
};

const DEBUG_CATEGORIES = [
  "Code / Logic", "UI", "UX", "Performance", "Syntax",
  "Security", "Responsive behavior", "Structure / Architecture"
];

const TEST_LEVELS = {
  1: "QUICK TEST",
  2: "FULL CHECK",
  3: "DEEP CHECK"
};

function getExt(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function detectLanguage(files) {
  const counts = {};
  for (const name of Object.keys(files)) {
    const lang = SUPPORTED_EXTENSIONS[getExt(name)] || "unknown";
    counts[lang] = (counts[lang] || 0) + 1;
  }
  let best = "unknown", max = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) { max = v; best = k; }
  }
  return best;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function uid(prefix = "P") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function safePath(name) {
  // Prevent ZIP path traversal
  return name.replace(/^[/\\]+/, "").replace(/\.\./g, "_").replace(/\\/g, "/");
}
global.ADUtils = { SUPPORTED_EXTENSIONS, DEBUG_CATEGORIES, TEST_LEVELS, getExt, detectLanguage, escapeHtml, formatSize, uid, safePath };
})(typeof window !== 'undefined' ? window : globalThis);
