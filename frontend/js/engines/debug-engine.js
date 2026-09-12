/**
 * Client-side Debug Engine + Test Engine + Root Cause hints
 * Ported & extended from V1 Python AnalyzerEngine.
 * Static analysis only — never executes uploaded code.
 */

import { getExt, SUPPORTED_EXTENSIONS, TEST_LEVELS, uid } from "../lib/utils.js";

export class DebugEngine {
  constructor(files, language, category, level, projectGraph = null) {
    this.files = files;
    this.language = (language || "auto").toLowerCase();
    this.category = category || "Code / Logic";
    this.level = Math.min(3, Math.max(1, parseInt(level, 10) || 1));
    this.graph = projectGraph;
    this.problems = [];
    this.counter = 0;
    this.testResults = [];
  }

  run() {
    this.testResults.push({
      level: this.level,
      name: TEST_LEVELS[this.level] || "Unknown",
      status: "running"
    });

    if (this.level >= 1) this._level1();
    if (this.level >= 2) this._level2();
    if (this.level >= 3) this._level3();

    this.testResults[this.testResults.length - 1].status = "completed";
    this.testResults[this.testResults.length - 1].problems_found = this.problems.length;

    return {
      problems: this.problems,
      test_results: this.testResults,
      summary: {
        total_problems: this.problems.length,
        by_severity: this._countSeverity(),
        files_analyzed: Object.keys(this.files),
        language: this.language,
        category: this.category,
        level: this.level
      }
    };
  }

  _add(severity, file, line, section, description, why, expected, detected, recommendation, test,
       extras = {}) {
    this.counter++;
    const problem = {
      problem_id: `P${String(this.counter).padStart(4, "0")}`,
      severity,
      category: this.category,
      file_name: file,
      line: line || 1,
      section: section || "",
      description,
      why_problematic: why,
      expected_behavior: expected,
      detected_behavior: detected,
      recommended_correction_area: recommendation,
      test_detected: test,
      // Root-cause enrichment
      root_cause: extras.root_cause || recommendation,
      symptom: extras.symptom || description,
      evidence: extras.evidence || detected,
      impact: extras.impact || this._defaultImpact(severity),
      confidence: extras.confidence != null ? extras.confidence : this._defaultConfidence(severity, test)
    };
    this.problems.push(problem);
  }

  _defaultImpact(sev) {
    return { critical: "Blocks execution / severe security risk",
             high: "Likely runtime failure or significant defect",
             medium: "Degrades quality or reliability",
             low: "Style / maintainability concern",
             info: "Informational observation" }[sev] || "Unknown";
  }

  _defaultConfidence(sev, test) {
    if (test.startsWith("L1") && (sev === "critical" || sev === "high")) return 0.9;
    if (test.startsWith("L3")) return 0.65;
    return 0.75;
  }

  _countSeverity() {
    const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const p of this.problems) c[p.severity] = (c[p.severity] || 0) + 1;
    return c;
  }

  // ───────── LEVEL 1 ─────────
  _level1() {
    const test = "L1-Quick-Syntax-Structure";
    for (const [fname, content] of Object.entries(this.files)) {
      if (!content || !String(content).trim()) {
        this._add("medium", fname, 1, "file", "Empty or blank file",
          "Empty files provide no functionality and may indicate incomplete upload.",
          "File should contain valid source code.",
          "File is empty or only whitespace.",
          "Add content or remove the file if not needed.", test,
          { root_cause: "Missing source content", symptom: "Blank file", confidence: 0.95 });
        continue;
      }

      const ext = getExt(fname);
      const lang = SUPPORTED_EXTENSIONS[ext] || this.language;

      if (lang === "javascript" || lang === "typescript") this._jsQuick(fname, content, test);
      else if (lang === "python") this._pyQuick(fname, content, test);
      else if (lang === "html") this._htmlQuick(fname, content, test);
      else if (lang === "css") this._cssQuick(fname, content, test);
      else if (lang === "json") this._jsonQuick(fname, content, test);
      else this._generic(fname, content, test);

      if (/security/i.test(this.category)) this._securityQuick(fname, content, test);
    }
  }

  _jsQuick(fname, content, test) {
    const opens = (content.match(/[{[(]/g) || []).length;
    const closes = (content.match(/[}\])]/g) || []).length;
    if (opens !== closes) {
      this._add("high", fname, 1, "structure",
        "Unbalanced braces, parentheses or brackets",
        "Unbalanced delimiters almost always cause parse/runtime errors.",
        "Matching number of opening and closing delimiters.",
        `Open ~${opens}, close ~${closes}`,
        "Locate and fix mismatched { } ( ) [ ]", test,
        { root_cause: "Mismatched delimiters in source", symptom: "Parse failure risk",
          evidence: `Δ=${opens - closes}`, confidence: 0.92 });
    }

    if (/\.\s+\(/.test(content)) {
      this._add("medium", fname, 1, "syntax",
        "Possible malformed method call (dot space paren)",
        "Whitespace between . and ( is invalid in JS method calls.",
        "obj.method()", "Found pattern '. ('",
        "Remove space between . and (", test,
        { root_cause: "Invalid token sequence", confidence: 0.85 });
    }

    // Very basic "looks like incomplete statement"
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].trim();
      if (/^(let|const|var|return|throw)\s+/.test(s) &&
          !/[;{},:(\[]$/.test(s) && !s.includes("=>") && !s.startsWith("//")) {
        this._add("low", fname, i + 1, "statement",
          "Possible missing semicolon",
          "ASI can hide bugs; explicit semicolons improve clarity.",
          "Statement ends with semicolon.", s.slice(0, 80),
          "Add semicolon if intended as statement end.", test,
          { root_cause: "Ambiguous statement termination", confidence: 0.55 });
        break;
      }
    }
  }

  _pyQuick(fname, content, test) {
    // Bracket / colon heuristics + indentation
    if (content.includes("\t") && content.includes("    ")) {
      this._add("medium", fname, 1, "style",
        "Mixed tabs and spaces for indentation",
        "Python is sensitive to consistent indentation; mixing causes IndentationError.",
        "Use only spaces (PEP 8) or only tabs consistently.",
        "Both tab and space indentation detected.",
        "Convert all indentation to spaces (recommended).", test,
        { root_cause: "Inconsistent indentation whitespace",
          symptom: "Potential IndentationError", confidence: 0.9 });
    }

    // Obvious syntax: if/for/while/def/class without colon
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].trim();
      if (/^(if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(s) &&
          !s.endsWith(":") && !s.endsWith("\\") && !s.startsWith("#")) {
        // allow else: already checked; bare else without :
        if (/^(else|try|finally)\s*$/.test(s) || /^(if|elif|for|while|def|class|except|with)\b.+$/.test(s)) {
          this._add("critical", fname, i + 1, "syntax",
            `Possible missing colon after compound statement`,
            "Python compound statements require a trailing colon.",
            "Statement ends with ':'",
            s.slice(0, 100),
            "Add ':' at the end of the header line.", test,
            { root_cause: "Missing ':' on compound statement",
              symptom: "SyntaxError at runtime/import", confidence: 0.88 });
        }
      }
    }

    // Unbalanced brackets
    const o = (content.match(/[{[(]/g) || []).length;
    const c = (content.match(/[}\])]/g) || []).length;
    if (o !== c) {
      this._add("high", fname, 1, "structure",
        "Unbalanced brackets/braces/parentheses",
        "Unbalanced delimiters cause SyntaxError.",
        "Balanced delimiters.", `Open ${o} vs close ${c}`,
        "Balance brackets.", test,
        { root_cause: "Mismatched delimiters", confidence: 0.85 });
    }
  }

  _htmlQuick(fname, content, test) {
    const openTags = [...content.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*(?<!\/)\s*>/g)].map(m => m[1].toLowerCase());
    const closeTags = [...content.matchAll(/<\/([a-zA-Z][\w-]*)\s*>/g)].map(m => m[1].toLowerCase());
    const voidEls = new Set(["img","br","hr","input","meta","link","area","base","col","embed","source","track","wbr"]);
    const net = {};
    for (const t of openTags) if (!voidEls.has(t)) net[t] = (net[t] || 0) + 1;
    for (const t of closeTags) net[t] = (net[t] || 0) - 1;
    for (const [tag, cnt] of Object.entries(net)) {
      if (cnt > 0) {
        this._add("high", fname, 1, "html",
          `Possibly unclosed <${tag}> tag(s)`,
          "Unclosed tags lead to unexpected DOM structure and CSS/JS targeting issues.",
          `Every non-void <${tag}> has a matching </${tag}>.`,
          `Net open count for ${tag}: ${cnt}`,
          `Add missing closing tag(s) for <${tag}>.`, test,
          { root_cause: `Missing </${tag}>`, symptom: "Broken DOM tree", confidence: 0.8 });
      }
    }

    if (!/<!doctype/i.test(content) && /<html/i.test(content)) {
      this._add("low", fname, 1, "structure",
        "Missing DOCTYPE declaration",
        "Without DOCTYPE browsers may enter quirks mode affecting layout.",
        "<!DOCTYPE html> at the start of the document.",
        "No DOCTYPE found.",
        "Add <!DOCTYPE html> as the first line.", test,
        { root_cause: "Missing document type", confidence: 0.95 });
    }
  }

  _cssQuick(fname, content, test) {
    const opens = (content.match(/\{/g) || []).length;
    const closes = (content.match(/\}/g) || []).length;
    if (opens !== closes) {
      this._add("high", fname, 1, "css",
        "Unbalanced curly braces in CSS",
        "Mismatched { } break the cascade and subsequent rules.",
        "Equal number of { and }.",
        `{ count: ${opens}, } count: ${closes}`,
        "Balance the braces; use a CSS validator.", test,
        { root_cause: "Mismatched CSS braces", confidence: 0.93 });
    }
    if (/\{\s*\}/.test(content)) {
      this._add("low", fname, 1, "css",
        "Empty CSS rule set(s) found",
        "Empty rules add noise and may indicate incomplete styles.",
        "Rules should contain at least one declaration or be removed.",
        "Pattern { } detected.",
        "Remove empty rules or complete them.", test,
        { root_cause: "Placeholder or leftover empty rules", confidence: 0.7 });
    }
  }

  _jsonQuick(fname, content, test) {
    try {
      JSON.parse(content);
    } catch (e) {
      this._add("critical", fname, 1, "json",
        `Invalid JSON: ${e.message}`,
        "JSON parse failure means the data cannot be consumed by applications.",
        "Valid JSON syntax.",
        String(e.message),
        "Fix JSON syntax (commas, quotes, brackets).", test,
        { root_cause: "Malformed JSON token stream", symptom: "Parse exception",
          confidence: 0.98 });
    }
  }

  _generic(fname, content, test) {
    if (content.length > 500000) {
      this._add("info", fname, 1, "size",
        "Very large file",
        "Extremely large source files hinder maintainability and analysis.",
        "Prefer modular files under reasonable size limits.",
        `File size ~${content.length} bytes`,
        "Consider splitting into modules.", test);
    }
  }

  _securityQuick(fname, content, test) {
    const patterns = [
      [/eval\s*\(/i, "Use of eval()", "eval executes arbitrary code and is a major XSS/injection risk.",
       "Avoid eval; use safer parsing or Function only with trusted input."],
      [/innerHTML\s*=/i, "Assignment to innerHTML", "innerHTML can introduce XSS if content is user-controlled.",
       "Prefer textContent or sanitised DOM APIs."],
      [/document\.write\s*\(/i, "document.write()", "document.write can overwrite the document and is unsafe with untrusted data.",
       "Use DOM methods instead of document.write."],
      [/password\s*=\s*["'][^"']+["']/i, "Hardcoded password-like string", "Credentials in source are a security risk.",
       "Move secrets to environment variables or a secrets manager."],
      [/api[_-]?key\s*=\s*["'][^"']+["']/i, "Hardcoded API key", "Secrets should never be committed in source.",
       "Externalise API keys."]
    ];
    for (const [re, title, why, rec] of patterns) {
      if (re.test(content)) {
        this._add("high", fname, 1, "security", title, why,
          "Avoid dangerous APIs or move secrets out of source.",
          `Matched: ${re}`, rec, test,
          { root_cause: title, symptom: "Security smell in source",
            impact: "Potential injection or secret exposure", confidence: 0.85 });
      }
    }
  }

  // ───────── LEVEL 2 ─────────
  _level2() {
    const test = "L2-Full-Relations-Deps";
    if (Object.keys(this.files).length > 1) this._crossFileRefs(test);
    for (const [fname, content] of Object.entries(this.files)) {
      const lang = SUPPORTED_EXTENSIONS[getExt(fname)] || this.language;
      if (["javascript", "typescript", "html"].includes(lang)) {
        this._jsHtmlInteraction(fname, content, test);
      }
      if (/ui|ux/i.test(this.category)) this._uiUx(fname, content, test);
      if (/performance/i.test(this.category)) this._perf(fname, content, test);
    }
  }

  _crossFileRefs(test) {
    if (!this.graph) return;
    for (const ref of this.graph.references || []) {
      if (ref.missing) {
        this._add("medium", ref.from, 1, "reference",
          `Possible missing referenced file or selector: ${ref.target}`,
          "Broken references cause 404s or null DOM lookups.",
          "Referenced assets / elements exist in the project.",
          `Reference '${ref.target}' not resolved among uploaded files.`,
          "Ensure the file/element is included or fix the path/selector.", test,
          { root_cause: "Unresolved cross-file or DOM reference",
            symptom: "Broken link / null element", evidence: JSON.stringify(ref),
            confidence: 0.78 });
      }
    }
  }

  _jsHtmlInteraction(fname, content, test) {
    if (!this.graph) return;
    const ids = this.graph.htmlIds || new Set();
    const domRe = /(?:getElementById|querySelector)\s*\(\s*['"]#?([^'"]+)['"]/g;
    let m;
    while ((m = domRe.exec(content))) {
      const sel = m[1];
      if (sel && !ids.has(sel)) {
        // only flag if we actually saw HTML files
        if (ids.size > 0 || Object.keys(this.files).some(f => /\.html?$/i.test(f))) {
          this._add("medium", fname, 1, "dom",
            `Possible missing DOM element for selector/id: ${sel}`,
            "Querying non-existent elements returns null and can cause runtime errors.",
            "Target elements exist in the HTML.",
            `No matching id='${sel}' found in uploaded HTML.`,
            "Verify the element exists or guard the query with null checks.", test,
            { root_cause: "DOM selector does not match any element in project HTML",
              symptom: "Potential TypeError on null", confidence: 0.7 });
        }
      }
    }
  }

  _uiUx(fname, content, test) {
    if (/\.html?$/i.test(fname) || getExt(fname) === ".css") {
      if (/<img/i.test(content) && !/\salt\s*=/i.test(content)) {
        this._add("medium", fname, 1, "accessibility",
          "Images without alt attributes",
          "Missing alt text harms accessibility and SEO.",
          "Every <img> has a meaningful alt attribute.",
          "img tags without alt detected.",
          "Add alt=\"description\" to images.", test,
          { root_cause: "Missing accessibility attribute", confidence: 0.8 });
      }
      if (/font-size\s*:\s*\d+px/i.test(content) && !/\b(rem|em)\b/i.test(content)) {
        this._add("low", fname, 1, "ux",
          "Hard-coded px font sizes only",
          "Fixed px sizes reduce accessibility for users who scale text.",
          "Prefer relative units (rem/em) for typography.",
          "Only px font-size found.",
          "Consider using rem for root-relative sizing.", test,
          { root_cause: "Non-scalable typography units", confidence: 0.6 });
      }
    }
  }

  _perf(fname, content, test) {
    const scriptCount = (content.match(/<script/gi) || []).length;
    if (scriptCount > 5) {
      this._add("medium", fname, 1, "performance",
        "Many script tags",
        "Numerous scripts increase request count and parse time.",
        "Bundle or defer non-critical scripts.",
        `Found ${scriptCount} script tags.`,
        "Consider bundling or using async/defer.", test,
        { root_cause: "Unbundled script loading", confidence: 0.65 });
    }
    if (/@import\s+/i.test(content)) {
      this._add("low", fname, 1, "performance",
        "CSS @import detected",
        "@import blocks parallel downloading of stylesheets.",
        "Use <link> tags instead of @import for better performance.",
        "@import rule found.",
        "Replace @import with link elements in HTML.", test,
        { root_cause: "Blocking stylesheet import", confidence: 0.8 });
    }
  }

  // ───────── LEVEL 3 ─────────
  _level3() {
    const test = "L3-Deep-Architecture-Edge";
    this._architecture(test);
    this._edgeCases(test);
    if (/responsive/i.test(this.category)) this._responsive(test);
    if (/structure|architecture/i.test(this.category)) this._structureDeep(test);
  }

  _architecture(test) {
    const jsFiles = Object.keys(this.files).filter(f =>
      [".js", ".ts", ".jsx", ".tsx"].includes(getExt(f)));
    if (jsFiles.length > 10) {
      this._add("info", "project", 1, "architecture",
        "Large number of JS modules",
        "Many small files can be good modularity but may indicate missing bundling strategy.",
        "Clear module boundaries and build process.",
        `${jsFiles.length} JS/TS files.`,
        "Ensure a module system (ESM/CJS) and build tooling is intentional.", test,
        { root_cause: "High module count without visible bundler config", confidence: 0.5 });
    }
  }

  _edgeCases(test) {
    for (const [fname, content] of Object.entries(this.files)) {
      if (/\bTODO\b|\bFIXME\b/.test(content)) {
        this._add("info", fname, 1, "maintainability",
          "TODO/FIXME comments present",
          "Unresolved TODOs may hide incomplete features or known bugs.",
          "All known issues tracked externally or resolved.",
          "Found TODO or FIXME markers.",
          "Address or ticket the remaining work items.", test,
          { root_cause: "Incomplete implementation markers", confidence: 0.7 });
      }
    }
  }

  _responsive(test) {
    let hasViewport = false, hasMedia = false;
    for (const content of Object.values(this.files)) {
      if (/viewport/i.test(content)) hasViewport = true;
      if (/@media/i.test(content)) hasMedia = true;
    }
    if (!hasViewport) {
      this._add("high", "project", 1, "responsive",
        "Missing viewport meta tag",
        "Without viewport meta, mobile browsers render at desktop width.",
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "No viewport meta found in any HTML.",
        "Add viewport meta to the <head> of main HTML.", test,
        { root_cause: "Absent mobile viewport declaration", confidence: 0.9 });
    }
    if (!hasMedia && Object.keys(this.files).some(f => getExt(f) === ".css")) {
      this._add("medium", "project", 1, "responsive",
        "No CSS media queries detected",
        "Lack of media queries often means poor mobile/tablet experience.",
        "Responsive breakpoints via @media rules.",
        "No @media found.",
        "Add media queries for common breakpoints (e.g. 768px, 1024px).", test,
        { root_cause: "No responsive breakpoints defined", confidence: 0.75 });
    }
  }

  _structureDeep(test) {
    const hasEntry = Object.keys(this.files).some(f => {
      const b = f.split("/").pop().toLowerCase();
      return ["index.html", "main.js", "app.js", "index.js", "main.py", "app.py"].includes(b);
    });
    if (!hasEntry && Object.keys(this.files).length > 1) {
      this._add("low", "project", 1, "structure",
        "No obvious entry-point file detected",
        "Projects usually have a clear starting file (index.html, main.js, etc.).",
        "Clear entry point present.",
        "No standard entry filename found.",
        "Name the main file index.html / main.js / etc. for clarity.", test,
        { root_cause: "Ambiguous project entry point", confidence: 0.55 });
    }
  }
}
