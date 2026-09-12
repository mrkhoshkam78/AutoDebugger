/**
 * Auto Debugger V1.1 — Fully Client-Side / Browser-Only
 * No server, no upload of source to any remote, works offline & from file://
 */

import { ProjectMapper } from "./js/project-mapper.js";
import { DebugEngine } from "./js/engines/debug-engine.js";
import { savePattern, getStats } from "./js/knowledge-db.js";
import {
  SUPPORTED_EXTENSIONS, getExt, detectLanguage,
  escapeHtml, formatSize, safePath
} from "./js/lib/utils.js";

// ── State ──
let projectFiles = {};   // { relativePath: textContent }
let fileMeta = [];       // [{name, size, type}]
let currentResult = null;
let allProblems = [];
let isAnalyzing = false;

// ── DOM ──
const $ = (s) => document.querySelector(s);
const uploadZone = $("#uploadZone");
const fileInput = $("#fileInput");
const browseBtn = $("#browseBtn");
const fileList = $("#fileList");
const languageSelect = $("#languageSelect");
const categorySelect = $("#categorySelect");
const levelSelect = $("#levelSelect");
const levelDesc = $("#levelDesc");
const startBtn = $("#startBtn");
const progressWrap = $("#progressWrap");
const progressFill = $("#progressFill");
const progressText = $("#progressText");
const headerStatus = $("#headerStatus");
const resultsEmpty = $("#resultsEmpty");
const resultsContent = $("#resultsContent");
const summaryCards = $("#summaryCards");
const testList = $("#testList");
const problemList = $("#problemList");
const problemCount = $("#problemCount");
const filters = $("#filters");
const severityFilter = $("#severityFilter");
const fileFilter = $("#fileFilter");
const localBadge = $("#localBadge");

const LEVEL_DESCRIPTIONS = {
  1: "Fast syntax & structural checks. Detects obvious errors, missing refs, broken selectors and basic logical inconsistencies. Fully local.",
  2: "Analyzes file relationships, functions, components, dependencies, HTML/CSS/JS interaction and deeper category-specific issues. Fully local.",
  3: "Comprehensive project analysis, complex dependency tracing, subtle logic & edge cases, architecture and performance deep dive. Fully local."
};

// ── Init ──
function init() {
  if (localBadge) {
    localBadge.textContent = "Local · Offline-capable · No server";
  }
  setStatus("Ready (browser-only)", "idle");

  levelSelect.addEventListener("change", () => {
    levelDesc.textContent = LEVEL_DESCRIPTIONS[levelSelect.value] || "";
  });
  levelDesc.textContent = LEVEL_DESCRIPTIONS[1];

  browseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => handleFiles(fileInput.files));

  ["dragenter", "dragover", "dragleave", "drop"].forEach(ev => {
    uploadZone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); });
  });
  uploadZone.addEventListener("dragover", () => uploadZone.classList.add("dragover"));
  uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
  uploadZone.addEventListener("drop", (e) => {
    uploadZone.classList.remove("dragover");
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  });

  startBtn.addEventListener("click", startAnalysis);
  severityFilter.addEventListener("change", renderProblems);
  fileFilter.addEventListener("change", renderProblems);

  getStats().then(s => {
    if (s.totalPatterns > 0) console.info(`Knowledge DB: ${s.totalPatterns} learned patterns`);
  }).catch(() => {});
}

function setStatus(text, state = "idle") {
  headerStatus.innerHTML = `<span class="dot ${state}"></span><span>${escapeHtml(text)}</span>`;
}

// ── File handling (100% client-side) ──
async function handleFiles(fileListObj) {
  if (!fileListObj || !fileListObj.length) return;
  setStatus("Reading files locally…", "working");
  startBtn.disabled = true;
  projectFiles = {};
  fileMeta = [];
  fileList.innerHTML = `<p class="empty-state">Processing…</p>`;

  try {
    const files = Array.from(fileListObj);
    for (const file of files) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        await extractZip(file);
      } else {
        await readSingleFile(file);
      }
    }

    if (!Object.keys(projectFiles).length) {
      throw new Error("No readable text files found");
    }

    renderFileList();
    startBtn.disabled = false;
    setStatus(`Local · ${fileMeta.length} file(s) ready`, "idle");
  } catch (err) {
    fileList.innerHTML = `<p class="empty-state" style="color:var(--danger)">${escapeHtml(err.message)}</p>`;
    setStatus("Read error", "error");
    startBtn.disabled = true;
  }
}

function readSingleFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error(`File too large (>8 MB): ${file.name}`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      const name = safePath(file.name);
      projectFiles[name] = text;
      fileMeta.push({
        name,
        size: file.size,
        type: SUPPORTED_EXTENSIONS[getExt(name)] || "unknown"
      });
      resolve();
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file, "UTF-8");
  });
}

async function extractZip(file) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip not loaded — cannot extract ZIP client-side");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("ZIP too large (>12 MB)");
  }
  const zip = await JSZip.loadAsync(file);
  let total = 0;
  const entries = [];
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) entries.push({ path: relativePath, entry });
  });

  for (const { path, entry } of entries) {
    const safe = safePath(path);
    if (!safe || safe.includes("..")) continue;
    const ext = getExt(safe);
    if ([".png",".jpg",".jpeg",".gif",".webp",".ico",".woff",".woff2",".ttf",".eot",".mp3",".mp4",".pdf",".exe",".dll"].includes(ext)) {
      continue;
    }
    try {
      const text = await entry.async("string");
      total += text.length;
      if (total > 15 * 1024 * 1024) throw new Error("Extracted content exceeds safe limit");
      projectFiles[safe] = text;
      fileMeta.push({
        name: safe,
        size: text.length,
        type: SUPPORTED_EXTENSIONS[ext] || "unknown"
      });
    } catch (e) {
      // skip unreadable binary-ish entries
    }
  }
}

function renderFileList() {
  if (!fileMeta.length) {
    fileList.innerHTML = `<p class="empty-state">No files loaded</p>`;
    return;
  }
  fileList.innerHTML = fileMeta.map(f => `
    <div class="file-item">
      <span class="name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
      <span class="meta">${formatSize(f.size)} · ${escapeHtml(f.type)}</span>
    </div>
  `).join("");
}

// ── Analysis pipeline ──
async function startAnalysis() {
  if (isAnalyzing || !Object.keys(projectFiles).length) return;
  isAnalyzing = true;
  startBtn.disabled = true;
  progressWrap.hidden = false;
  progressFill.style.width = "5%";
  progressText.textContent = "Building project map…";
  setStatus("Analyzing locally…", "working");
  resultsEmpty.hidden = true;
  resultsContent.hidden = true;

  let p = 5;
  const tick = setInterval(() => {
    p = Math.min(p + Math.random() * 8, 85);
    progressFill.style.width = p + "%";
  }, 200);

  try {
    await new Promise(r => setTimeout(r, 30));

    progressText.textContent = "Mapping project structure…";
    const mapper = new ProjectMapper(projectFiles);
    const graph = mapper.map();

    await new Promise(r => setTimeout(r, 20));
    progressText.textContent = "Running static analysis…";

    let lang = languageSelect.value;
    if (lang === "auto") lang = detectLanguage(projectFiles);

    const engine = new DebugEngine(
      projectFiles,
      lang,
      categorySelect.value,
      parseInt(levelSelect.value, 10),
      graph
    );
    const result = engine.run();

    progressText.textContent = "Updating local knowledge…";
    for (const prob of result.problems.slice(0, 30)) {
      await savePattern({
        language: lang,
        category: categorySelect.value,
        severity: prob.severity,
        description: prob.description,
        root_cause: prob.root_cause,
        patternKey: `${lang}|${prob.severity}|${prob.description?.slice(0, 60)}`
      });
    }

    clearInterval(tick);
    progressFill.style.width = "100%";
    progressText.textContent = "Analysis complete (local)";

    currentResult = result;
    allProblems = result.problems || [];
    renderResults(result);
    setStatus(`Done · ${allProblems.length} problem(s) · local only`, "idle");
  } catch (err) {
    clearInterval(tick);
    console.error(err);
    progressText.textContent = "Failed: " + err.message;
    setStatus("Analysis error", "error");
    resultsEmpty.hidden = false;
    resultsEmpty.innerHTML = `
      <div class="empty-icon">⚠️</div>
      <h3>Analysis failed</h3>
      <p>${escapeHtml(err.message)}</p>
    `;
  } finally {
    isAnalyzing = false;
    startBtn.disabled = false;
    setTimeout(() => { progressWrap.hidden = true; }, 900);
  }
}

// ── Results rendering ──
function renderResults(result) {
  resultsEmpty.hidden = true;
  resultsContent.hidden = false;
  filters.hidden = false;

  const summary = result.summary || {};
  const bySev = summary.by_severity || {};

  summaryCards.innerHTML = `
    <div class="card total"><div class="value">${summary.total_problems || 0}</div><div class="label">Total</div></div>
    <div class="card critical"><div class="value">${bySev.critical || 0}</div><div class="label">Critical</div></div>
    <div class="card high"><div class="value">${bySev.high || 0}</div><div class="label">High</div></div>
    <div class="card medium"><div class="value">${bySev.medium || 0}</div><div class="label">Medium</div></div>
    <div class="card low"><div class="value">${bySev.low || 0}</div><div class="label">Low</div></div>
    <div class="card info"><div class="value">${bySev.info || 0}</div><div class="label">Info</div></div>
  `;

  testList.innerHTML = (result.test_results || []).map(t => `
    <div class="test-item">
      <span class="status"></span>
      <span class="name">${escapeHtml(t.name || "Test")}</span>
      <span class="count">${t.problems_found != null ? t.problems_found + " issues" : t.status}</span>
    </div>
  `).join("") || `<div class="test-item"><span class="name">No test metadata</span></div>`;

  const files = summary.files_analyzed || [];
  fileFilter.innerHTML = `<option value="all">All files</option>` +
    files.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");

  problemCount.textContent = allProblems.length;
  renderProblems();
}

function renderProblems() {
  const sev = severityFilter.value;
  const file = fileFilter.value;
  let filtered = allProblems;
  if (sev !== "all") filtered = filtered.filter(p => p.severity === sev);
  if (file !== "all") filtered = filtered.filter(p => p.file_name === file);

  problemCount.textContent = filtered.length;

  if (!filtered.length) {
    problemList.innerHTML = `<p style="color:var(--text-dim);padding:1rem;text-align:center">No problems match the current filters.</p>`;
    return;
  }

  problemList.innerHTML = filtered.map(p => `
    <div class="problem-card">
      <div class="problem-header" onclick="this.parentElement.classList.toggle('open')">
        <span class="severity-badge ${escapeHtml(p.severity)}">${escapeHtml(p.severity)}</span>
        <div>
          <div class="problem-title">${escapeHtml(p.description)}</div>
          <div class="problem-meta">${escapeHtml(p.file_name)}${p.line ? " · line " + p.line : ""} · ${escapeHtml(p.problem_id)} · conf ${(p.confidence * 100 | 0)}%</div>
        </div>
      </div>
      <div class="problem-body">
        <div class="detail-grid">
          <div class="detail-row"><span class="label">Root cause</span><span class="value">${escapeHtml(p.root_cause)}</span></div>
          <div class="detail-row"><span class="label">Symptom</span><span class="value">${escapeHtml(p.symptom)}</span></div>
          <div class="detail-row"><span class="label">Why problematic</span><span class="value">${escapeHtml(p.why_problematic)}</span></div>
          <div class="detail-row"><span class="label">Expected</span><span class="value">${escapeHtml(p.expected_behavior)}</span></div>
          <div class="detail-row"><span class="label">Detected / Evidence</span><span class="value">${escapeHtml(p.evidence || p.detected_behavior)}</span></div>
          <div class="detail-row"><span class="label">Impact</span><span class="value">${escapeHtml(p.impact)}</span></div>
          <div class="detail-row"><span class="label">Recommendation</span><span class="value">${escapeHtml(p.recommended_correction_area)}</span></div>
          <div class="detail-row"><span class="label">Detected by</span><span class="value">${escapeHtml(p.test_detected)}</span></div>
          <div class="detail-row"><span class="label">Section</span><span class="value">${escapeHtml(p.section || "—")}</span></div>
        </div>
      </div>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", init);
