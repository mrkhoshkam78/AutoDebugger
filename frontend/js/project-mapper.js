/**
 * Client-side Project Mapper
 * Builds an internal project graph: files, languages, imports, refs, structure.
 */

import { getExt, SUPPORTED_EXTENSIONS, detectLanguage } from "./lib/utils.js";

export class ProjectMapper {
  constructor(files /* { path: content } */) {
    this.files = files || {};
    this.graph = {
      files: {},
      languages: {},
      entryPoints: [],
      imports: [],
      references: [],
      htmlIds: new Set(),
      htmlClasses: new Set(),
      cssSelectors: [],
      functions: [],
      classes: [],
      summary: {}
    };
  }

  map() {
    const names = Object.keys(this.files);
    this.graph.summary = {
      fileCount: names.length,
      totalBytes: names.reduce((s, n) => s + (this.files[n]?.length || 0), 0),
      primaryLanguage: detectLanguage(this.files)
    };

    for (const [path, content] of Object.entries(this.files)) {
      const ext = getExt(path);
      const lang = SUPPORTED_EXTENSIONS[ext] || "unknown";
      this.graph.languages[lang] = (this.graph.languages[lang] || 0) + 1;

      const node = {
        path,
        language: lang,
        size: content?.length || 0,
        lines: (content || "").split("\n").length,
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        ids: [],
        classesCss: [],
        refs: []
      };

      if (lang === "javascript" || lang === "typescript") {
        this._mapJs(node, content);
      } else if (lang === "python") {
        this._mapPython(node, content);
      } else if (lang === "html") {
        this._mapHtml(node, content);
      } else if (lang === "css") {
        this._mapCss(node, content);
      } else if (lang === "json") {
        try { JSON.parse(content); node.validJson = true; } catch { node.validJson = false; }
      }

      this.graph.files[path] = node;

      // Entry points
      const base = path.split("/").pop().toLowerCase();
      if (["index.html", "main.js", "app.js", "index.js", "main.py", "app.py", "index.ts"].includes(base)) {
        this.graph.entryPoints.push(path);
      }
    }

    this._resolveCrossRefs();
    return this.graph;
  }

  _mapJs(node, content) {
    // Imports / requires
    const importRe = /(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
    let m;
    while ((m = importRe.exec(content))) {
      const target = m[1] || m[2];
      node.imports.push(target);
      this.graph.imports.push({ from: node.path, to: target });
    }

    // Functions
    const fnRe = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=])\s*=>)/g;
    while ((m = fnRe.exec(content))) {
      const name = m[1] || m[2];
      if (name) {
        node.functions.push(name);
        this.graph.functions.push({ file: node.path, name });
      }
    }

    // Classes
    const classRe = /class\s+(\w+)/g;
    while ((m = classRe.exec(content))) {
      node.classes.push(m[1]);
      this.graph.classes.push({ file: node.path, name: m[1] });
    }

    // DOM queries
    const domRe = /(?:getElementById|querySelector(?:All)?)\s*\(\s*['"](#?)([^'"]+)['"]/g;
    while ((m = domRe.exec(content))) {
      node.refs.push({ type: "dom", selector: m[2], kind: m[1] ? "id" : "css" });
      this.graph.references.push({ from: node.path, type: "dom", target: m[2] });
    }
  }

  _mapPython(node, content) {
    const importRe = /(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/g;
    let m;
    while ((m = importRe.exec(content))) {
      const target = m[1] || m[2];
      node.imports.push(target);
      this.graph.imports.push({ from: node.path, to: target });
    }
    const fnRe = /def\s+(\w+)\s*\(/g;
    while ((m = fnRe.exec(content))) {
      node.functions.push(m[1]);
      this.graph.functions.push({ file: node.path, name: m[1] });
    }
    const classRe = /class\s+(\w+)/g;
    while ((m = classRe.exec(content))) {
      node.classes.push(m[1]);
      this.graph.classes.push({ file: node.path, name: m[1] });
    }
  }

  _mapHtml(node, content) {
    const idRe = /id\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = idRe.exec(content))) {
      node.ids.push(m[1]);
      this.graph.htmlIds.add(m[1]);
    }
    const classRe = /class\s*=\s*["']([^"']+)["']/gi;
    while ((m = classRe.exec(content))) {
      m[1].split(/\s+/).forEach(c => {
        if (c) { node.classesCss.push(c); this.graph.htmlClasses.add(c); }
      });
    }
    // script/link refs
    const refRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
    while ((m = refRe.exec(content))) {
      const ref = m[1].split("?")[0].split("#")[0];
      if (!/^(https?:|\/\/|data:|mailto:|javascript:)/i.test(ref)) {
        node.refs.push({ type: "asset", target: ref });
        this.graph.references.push({ from: node.path, type: "asset", target: ref });
      }
    }
  }

  _mapCss(node, content) {
    const selRe = /([^{}/@][^{]*)\{/g;
    let m;
    while ((m = selRe.exec(content))) {
      const sel = m[1].trim();
      if (sel) {
        node.classesCss.push(sel);
        this.graph.cssSelectors.push({ file: node.path, selector: sel });
      }
    }
  }

  _resolveCrossRefs() {
    const basenames = {};
    for (const path of Object.keys(this.files)) {
      const base = path.split("/").pop();
      basenames[base] = path;
    }
    for (const ref of this.graph.references) {
      if (ref.type === "asset") {
        const base = ref.target.split("/").pop();
        ref.resolved = basenames[base] || null;
        ref.missing = !ref.resolved && !Object.keys(this.files).some(p => p.endsWith(ref.target));
      }
      if (ref.type === "dom") {
        ref.missing = !this.graph.htmlIds.has(ref.target) &&
          !this.graph.htmlClasses.has(ref.target);
      }
    }
  }
}
