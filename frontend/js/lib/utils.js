/**
 * Shared utilities — Auto Debugger V1.1 Client-Side
 */

export const SUPPORTED_EXTENSIONS = {
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

export const DEBUG_CATEGORIES = [
  "Code / Logic", "UI", "UX", "Performance", "Syntax",
  "Security", "Responsive behavior", "Structure / Architecture"
];

export const TEST_LEVELS = {
  1: "QUICK TEST",
  2: "FULL CHECK",
  3: "DEEP CHECK"
};

export function getExt(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function detectLanguage(files) {
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

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function uid(prefix = "P") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function safePath(name) {
  // Prevent ZIP path traversal
  return name.replace(/^[/\\]+/, "").replace(/\.\./g, "_").replace(/\\/g, "/");
}
