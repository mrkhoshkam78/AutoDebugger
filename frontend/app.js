/**
 * Auto Debugger V1.02 — UI/UX + i18n + Theme + File delete
 * Debug Engine logic unchanged.
 */

import { ProjectMapper } from "./js/project-mapper.js";
import { DebugEngine } from "./js/engines/debug-engine.js";
import { savePattern, getStats } from "./js/knowledge-db.js";
import {
  SUPPORTED_EXTENSIONS, getExt, detectLanguage,
  escapeHtml, formatSize, safePath
} from "./js/lib/utils.js";
import { t, getLang, setLang, loadLang, applyI18n } from "./js/i18n.js";

let projectFiles = {};
let fileMeta = [];
let allProblems = [];
let isAnalyzing = false;

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
const settingsOverlay = $("#settingsOverlay");
const settingsBtn = $("#settingsBtn");
const settingsClose = $("#settingsClose");

const LEVEL_KEYS = { 1: "level1Desc", 2: "level2Desc", 3: "level3Desc" };

function loadTheme() {
  let theme = "dark";
  try {
    const s = localStorage.getItem("ad_theme");
    if (s === "light" || s === "dark") theme = s;
  } catch {}
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}

function setTheme(theme) {
  theme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("ad_theme", theme); } catch {}
  syncSettingsUI();
}

function applyLanguage(lang) {
  setLang(lang);
  const dir = lang === "fa" ? "rtl" : "ltr";
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
  applyI18n(document);
  updateLevelDesc();
  renderFileList();
  if (allProblems.length) renderProblems();
  syncSettingsUI();
  const statusSpan = headerStatus.querySelector("span:not(.dot)");
  if (statusSpan && !isAnalyzing) statusSpan.textContent = t("statusReady");
}

function updateLevelDesc() {
  const key = LEVEL_KEYS[levelSelect.value] || "level1Desc";
  levelDesc.textContent = t(key);
}

function syncSettingsUI() {
  const lang = getLang();
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  $("#langEnBtn")?.classList.toggle("active", lang === "en");
  $("#langFaBtn")?.classList.toggle("active", lang === "fa");
  $("#themeDarkBtn")?.classList.toggle("active", theme === "dark");
  $("#themeLightBtn")?.classList.toggle("active", theme === "light");
}

function setStatus(text, state = "idle") {
  headerStatus.innerHTML = `<span class="dot ${state}"></span><span>${escapeHtml(text)}</span>`;
}

function init() {
  loadLang();
  loadTheme();
  applyLanguage(getLang());

  levelSelect.addEventListener("change", updateLevelDesc);

  browseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) handleFiles(fileInput.files);
  });

  ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
    uploadZone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
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

  settingsBtn.addEventListener("click", () => {
    settingsOverlay.classList.add("open");
    syncSettingsUI();
  });
  settingsClose.addEventListener("click", () => settingsOverlay.classList.remove("open"));
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.remove("open");
  });

  $("#langEnBtn")?.addEventListener("click", () => applyLanguage("en"));
  $("#langFaBtn")?.addEventListener("click", () => applyLanguage("fa"));
  $("#themeDarkBtn")?.addEventListener("click", () => setTheme("dark"));
  $("#themeLightBtn")?.addEventListener("click", () => setTheme("light"));

  getStats().then((s) => {
    if (s.totalPatterns > 0) console.info("Knowledge DB:", s.totalPatterns);
  }).catch(() => {});
}

async function handleFiles(fileListObj) {
  if (!fileListObj?.length) return;
  setStatus(t("statusReading"), "working");
  startBtn.disabled = true;

  try {
    const files = Array.from(fileListObj);
    for (const file of files) {
      if (file.name.toLowerCase().endsWith(".zip")) await extractZip(file);
      else await readSingleFile(file);
    }
    if (!Object.keys(projectFiles).length) throw new Error(t("noReadable"));
    renderFileList();
    startBtn.disabled = false;
    setStatus(t("localReady", { n: fileMeta.length }), "idle");
  } catch (err) {
    fileList.innerHTML = `<p class="empty-state" style="color:var(--danger)">${escapeHtml(err.message)}</p>`;
    setStatus(t("statusError"), "error");
    startBtn.disabled = !Object.keys(projectFiles).length;
  }
  fileInput.value = "";
}

function readSingleFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error(`${t("fileTooLarge")}: ${file.name}`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const name = safePath(file.name);
      if (projectFiles[name] !== undefined) {
        // replace existing same name
        fileMeta = fileMeta.filter((f) => f.name !== name);
      }
      projectFiles[name] = reader.result;
      fileMeta.push({
        name,
        size: file.size,
        type: SUPPORTED_EXTENSIONS[getExt(name)] || "unknown"
      });
      resolve();
    };
    reader.onerror = () => reject(new Error(file.name));
    reader.readAsText(file, "UTF-8");
  });
}

async function extractZip(file) {
  if (typeof JSZip === "undefined") throw new Error("JSZip missing");
  if (file.size > 12 * 1024 * 1024) throw new Error(t("zipTooLarge"));
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
    if ([".png",".jpg",".jpeg",".gif",".webp",".ico",".woff",".woff2",".ttf",".eot",".mp3",".mp4",".pdf",".exe",".dll"].includes(ext)) continue;
    try {
      const text = await entry.async("string");
      total += text.length;
      if (total > 15 * 1024 * 1024) throw new Error(t("zipTooLarge"));
      if (projectFiles[safe] !== undefined) {
        fileMeta = fileMeta.filter((f) => f.name !== safe);
      }
      projectFiles[safe] = text;
      fileMeta.push({
        name: safe,
        size: text.length,
        type: SUPPORTED_EXTENSIONS[ext] || "unknown"
      });
    } catch (e) {
      if (e.message === t("zipTooLarge")) throw e;
    }
  }
}

function removeFile(name) {
  delete projectFiles[name];
  fileMeta = fileMeta.filter((f) => f.name !== name);
  renderFileList();
  startBtn.disabled = !fileMeta.length;
  if (!fileMeta.length) {
    setStatus(t("statusReady"), "idle");
  } else {
    setStatus(t("localReady", { n: fileMeta.length }), "idle");
  }
}

function renderFileList() {
  if (!fileMeta.length) {
    fileList.innerHTML = `<p class="empty-state">${escapeHtml(t("noFiles"))}</p>`;
    return;
  }
  const delLabel = t("deleteFile");
  fileList.innerHTML = fileMeta
    .map(
      (f) => `
    <div class="file-item" data-name="${escapeHtml(f.name)}">
      <span class="name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
      <span class="meta">${formatSize(f.size)} · ${escapeHtml(f.type)}</span>
      <button type="button" class="btn danger-ghost" data-delete="${escapeHtml(f.name)}" title="${escapeHtml(delLabel)}" aria-label="${escapeHtml(delLabel)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
      </button>
    </div>`
    )
    .join("");

  fileList.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFile(btn.getAttribute("data-delete"));
    });
  });
}

async function startAnalysis() {
  if (isAnalyzing || !Object.keys(projectFiles).length) return;
  isAnalyzing = true;
  startBtn.disabled = true;
  progressWrap.hidden = false;
  progressFill.style.width = "5%";
  progressText.textContent = t("analyzing");
  setStatus(t("statusAnalyzing"), "working");
  resultsEmpty.hidden = true;
  resultsContent.hidden = true;

  let p = 5;
  const tick = setInterval(() => {
    p = Math.min(p + Math.random() * 8, 85);
    progressFill.style.width = p + "%";
  }, 200);

  try {
    await new Promise((r) => setTimeout(r, 20));
    const mapper = new ProjectMapper(projectFiles);
    const graph = mapper.map();
    await new Promise((r) => setTimeout(r, 10));

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
    progressText.textContent = t("statusDone");

    allProblems = result.problems || [];
    renderResults(result);
    setStatus(`${t("statusDone")} · ${allProblems.length}`, "idle");
  } catch (err) {
    clearInterval(tick);
    console.error(err);
    progressText.textContent = err.message;
    setStatus(t("statusError"), "error");
    resultsEmpty.hidden = false;
    resultsEmpty.innerHTML = `
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg></div>
      <h3>${escapeHtml(t("analysisFailed"))}</h3>
      <p>${escapeHtml(err.message)}</p>`;
  } finally {
    isAnalyzing = false;
    startBtn.disabled = false;
    setTimeout(() => {
      progressWrap.hidden = true;
    }, 800);
  }
}

function renderResults(result) {
  resultsEmpty.hidden = true;
  resultsContent.hidden = false;
  filters.hidden = false;

  const summary = result.summary || {};
  const bySev = summary.by_severity || {};

  summaryCards.innerHTML = `
    <div class="card total"><div class="value">${summary.total_problems || 0}</div><div class="label">${escapeHtml(t("total"))}</div></div>
    <div class="card critical"><div class="value">${bySev.critical || 0}</div><div class="label">${escapeHtml(t("critical"))}</div></div>
    <div class="card high"><div class="value">${bySev.high || 0}</div><div class="label">${escapeHtml(t("high"))}</div></div>
    <div class="card medium"><div class="value">${bySev.medium || 0}</div><div class="label">${escapeHtml(t("medium"))}</div></div>
    <div class="card low"><div class="value">${bySev.low || 0}</div><div class="label">${escapeHtml(t("low"))}</div></div>
    <div class="card info"><div class="value">${bySev.info || 0}</div><div class="label">${escapeHtml(t("info"))}</div></div>`;

  testList.innerHTML = (result.test_results || [])
    .map(
      (tr) => `
    <div class="test-item">
      <span class="status"></span>
      <span class="name">${escapeHtml(tr.name || "Test")}</span>
      <span class="count">${tr.problems_found != null ? tr.problems_found : tr.status}</span>
    </div>`
    )
    .join("") || `<div class="test-item"><span class="name">—</span></div>`;

  const files = summary.files_analyzed || [];
  fileFilter.innerHTML =
    `<option value="all">${escapeHtml(t("allFiles"))}</option>` +
    files.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");

  problemCount.textContent = allProblems.length;
  renderProblems();
}

function renderProblems() {
  const sev = severityFilter.value;
  const file = fileFilter.value;
  let filtered = allProblems;
  if (sev !== "all") filtered = filtered.filter((p) => p.severity === sev);
  if (file !== "all") filtered = filtered.filter((p) => p.file_name === file);

  problemCount.textContent = filtered.length;

  if (!filtered.length) {
    problemList.innerHTML = `<p style="color:var(--text-dim);padding:1rem;text-align:center">${escapeHtml(t("noMatch"))}</p>`;
    return;
  }

  problemList.innerHTML = filtered
    .map(
      (p) => `
    <div class="problem-card">
      <div class="problem-header" onclick="this.parentElement.classList.toggle('open')">
        <span class="severity-badge ${escapeHtml(p.severity)}">${escapeHtml(p.severity)}</span>
        <div>
          <div class="problem-title">${escapeHtml(p.description)}</div>
          <div class="problem-meta">${escapeHtml(p.file_name)}${p.line ? " · L" + p.line : ""} · ${escapeHtml(p.problem_id)} · ${t("conf")} ${(p.confidence * 100) | 0}%</div>
        </div>
      </div>
      <div class="problem-body">
        <div class="detail-grid">
          <div class="detail-row"><span class="label">${escapeHtml(t("rootCause"))}</span><span class="value">${escapeHtml(p.root_cause)}</span></div>
          <div class="detail-row"><span class="label">${escapeHtml(t("symptom"))}</span><span class="value">${escapeHtml(p.symptom)}</span></div>
          <div class="detail-row"><span class="label">${escapeHtml(t("why"))}</span><span class="value">${escapeHtml(p.why_problematic)}</span></div>
          <div class="detail-row"><span class="label">${escapeHtml(t("expected"))}</span><span class="value">${escapeHtml(p.expected_behavior)}</span></div>
          <div class="detail-row"><span class="label">${escapeHtml(t("evidence"))}</span><span class="value code-like">${escapeHtml(p.evidence || p.detected_behavior)}</span></div>
          <div class="detail-row"><span class="label">${escapeHtml(t("impact"))}</span><span class="value">${escapeHtml(p.impact)}</span></div>
          <div class="detail-row"><span class="label">${escapeHtml(t("recommendation"))}</span><span class="value">${escapeHtml(p.recommended_correction_area)}</span></div>
          <div class="detail-row"><span class="label">${escapeHtml(t("detectedBy"))}</span><span class="value">${escapeHtml(p.test_detected)}</span></div>
          <div class="detail-row"><span class="label">${escapeHtml(t("section"))}</span><span class="value">${escapeHtml(p.section || "—")}</span></div>
        </div>
      </div>
    </div>`
    )
    .join("");
}

document.addEventListener("DOMContentLoaded", init);
