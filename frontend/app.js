/**
 * Auto Debugger V1.02 — classic script (works on file://)
 * Depends on: ADUtils, ADi18n, ADProjectMapper, ADDebugEngine, ADKnowledge, JSZip
 */

(function () {
  "use strict";

  var projectFiles = {};
  var fileMeta = [];
  var allProblems = [];
  var isAnalyzing = false;

  function $(s) { return document.querySelector(s); }

  var uploadZone, fileInput, browseBtn, fileList, languageSelect, categorySelect,
      levelSelect, levelDesc, startBtn, progressWrap, progressFill, progressText,
      headerStatus, resultsEmpty, resultsContent, summaryCards, testList,
      problemList, problemCount, filters, severityFilter, fileFilter,
      settingsOverlay, settingsBtn, settingsClose;

  var LEVEL_KEYS = { 1: "level1Desc", 2: "level2Desc", 3: "level3Desc" };

  function cacheDom() {
    uploadZone = $("#uploadZone");
    fileInput = $("#fileInput");
    browseBtn = $("#browseBtn");
    fileList = $("#fileList");
    languageSelect = $("#languageSelect");
    categorySelect = $("#categorySelect");
    levelSelect = $("#levelSelect");
    levelDesc = $("#levelDesc");
    startBtn = $("#startBtn");
    progressWrap = $("#progressWrap");
    progressFill = $("#progressFill");
    progressText = $("#progressText");
    headerStatus = $("#headerStatus");
    resultsEmpty = $("#resultsEmpty");
    resultsContent = $("#resultsContent");
    summaryCards = $("#summaryCards");
    testList = $("#testList");
    problemList = $("#problemList");
    problemCount = $("#problemCount");
    filters = $("#filters");
    severityFilter = $("#severityFilter");
    fileFilter = $("#fileFilter");
    settingsOverlay = $("#settingsOverlay");
    settingsBtn = $("#settingsBtn");
    settingsClose = $("#settingsClose");
  }

  function loadTheme() {
    var theme = "dark";
    try {
      var s = localStorage.getItem("ad_theme");
      if (s === "light" || s === "dark") theme = s;
    } catch (e) {}
    document.documentElement.setAttribute("data-theme", theme);
    return theme;
  }

  function setTheme(theme) {
    theme = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("ad_theme", theme); } catch (e) {}
    syncSettingsUI();
  }

  function applyLanguage(lang) {
    ADi18n.setLang(lang);
    var dir = lang === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    ADi18n.applyI18n(document);
    updateLevelDesc();
    renderFileList();
    if (allProblems.length) renderProblems();
    syncSettingsUI();
    if (headerStatus && !isAnalyzing) {
      var statusSpan = headerStatus.querySelector("span:not(.dot)");
      if (statusSpan) statusSpan.textContent = ADi18n.t("statusReady");
    }
  }

  function updateLevelDesc() {
    if (!levelSelect || !levelDesc) return;
    var key = LEVEL_KEYS[levelSelect.value] || "level1Desc";
    levelDesc.textContent = ADi18n.t(key);
  }

  function syncSettingsUI() {
    var lang = ADi18n.getLang();
    var theme = document.documentElement.getAttribute("data-theme") || "dark";
    var langEnBtn = $("#langEnBtn");
    var langFaBtn = $("#langFaBtn");
    var themeDarkBtn = $("#themeDarkBtn");
    var themeLightBtn = $("#themeLightBtn");
    if (langEnBtn) langEnBtn.classList.toggle("active", lang === "en");
    if (langFaBtn) langFaBtn.classList.toggle("active", lang === "fa");
    if (themeDarkBtn) themeDarkBtn.classList.toggle("active", theme === "dark");
    if (themeLightBtn) themeLightBtn.classList.toggle("active", theme === "light");
  }

  function setStatus(text, state) {
    state = state || "idle";
    if (!headerStatus) return;
    headerStatus.innerHTML = '<span class="dot ' + state + '"></span><span>' + ADUtils.escapeHtml(text) + "</span>";
  }

  function init() {
    cacheDom();
    ADi18n.loadLang();
    loadTheme();
    applyLanguage(ADi18n.getLang());

    if (levelSelect) levelSelect.addEventListener("change", updateLevelDesc);

    if (browseBtn && fileInput) {
      browseBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", function () {
        if (fileInput.files && fileInput.files.length) handleFiles(fileInput.files);
      });
    }

    if (uploadZone) {
      ["dragenter", "dragover", "dragleave", "drop"].forEach(function (ev) {
        uploadZone.addEventListener(ev, function (e) {
          e.preventDefault();
          e.stopPropagation();
        });
      });
      uploadZone.addEventListener("dragover", function () {
        uploadZone.classList.add("dragover");
      });
      uploadZone.addEventListener("dragleave", function () {
        uploadZone.classList.remove("dragover");
      });
      uploadZone.addEventListener("drop", function (e) {
        uploadZone.classList.remove("dragover");
        if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      });
    }

    if (startBtn) startBtn.addEventListener("click", startAnalysis);
    if (severityFilter) severityFilter.addEventListener("change", renderProblems);
    if (fileFilter) fileFilter.addEventListener("change", renderProblems);

    // Settings panel
    if (settingsBtn && settingsOverlay) {
      settingsBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        settingsOverlay.classList.add("open");
        syncSettingsUI();
      });
    }
    if (settingsClose && settingsOverlay) {
      settingsClose.addEventListener("click", function (e) {
        e.preventDefault();
        settingsOverlay.classList.remove("open");
      });
    }
    if (settingsOverlay) {
      settingsOverlay.addEventListener("click", function (e) {
        if (e.target === settingsOverlay) settingsOverlay.classList.remove("open");
      });
    }

    var langEnBtn = $("#langEnBtn");
    var langFaBtn = $("#langFaBtn");
    var themeDarkBtn = $("#themeDarkBtn");
    var themeLightBtn = $("#themeLightBtn");
    if (langEnBtn) langEnBtn.addEventListener("click", function () { applyLanguage("en"); });
    if (langFaBtn) langFaBtn.addEventListener("click", function () { applyLanguage("fa"); });
    if (themeDarkBtn) themeDarkBtn.addEventListener("click", function () { setTheme("dark"); });
    if (themeLightBtn) themeLightBtn.addEventListener("click", function () { setTheme("light"); });

    try {
      ADKnowledge.getStats().then(function (s) {
        if (s.totalPatterns > 0) console.info("Knowledge DB:", s.totalPatterns);
      }).catch(function () {});
    } catch (e) {}
  }

  async function handleFiles(fileListObj) {
    if (!fileListObj || !fileListObj.length) return;
    setStatus(ADi18n.t("statusReading"), "working");
    if (startBtn) startBtn.disabled = true;

    try {
      var files = Array.prototype.slice.call(fileListObj);
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (file.name.toLowerCase().endsWith(".zip")) await extractZip(file);
        else await readSingleFile(file);
      }
      if (!Object.keys(projectFiles).length) throw new Error(ADi18n.t("noReadable"));
      renderFileList();
      if (startBtn) startBtn.disabled = false;
      setStatus(ADi18n.t("localReady", { n: fileMeta.length }), "idle");
    } catch (err) {
      if (fileList) {
        fileList.innerHTML = '<p class="empty-state" style="color:var(--danger)">' + ADUtils.escapeHtml(err.message) + "</p>";
      }
      setStatus(ADi18n.t("statusError"), "error");
      if (startBtn) startBtn.disabled = !Object.keys(projectFiles).length;
    }
    if (fileInput) fileInput.value = "";
  }

  function readSingleFile(file) {
    return new Promise(function (resolve, reject) {
      if (file.size > 8 * 1024 * 1024) {
        reject(new Error(ADi18n.t("fileTooLarge") + ": " + file.name));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var name = ADUtils.safePath(file.name);
        if (projectFiles[name] !== undefined) {
          fileMeta = fileMeta.filter(function (f) { return f.name !== name; });
        }
        projectFiles[name] = reader.result;
        fileMeta.push({
          name: name,
          size: file.size,
          type: ADUtils.SUPPORTED_EXTENSIONS[ADUtils.getExt(name)] || "unknown"
        });
        resolve();
      };
      reader.onerror = function () { reject(new Error(file.name)); };
      reader.readAsText(file, "UTF-8");
    });
  }

  async function extractZip(file) {
    if (typeof JSZip === "undefined") throw new Error("JSZip missing");
    if (file.size > 12 * 1024 * 1024) throw new Error(ADi18n.t("zipTooLarge"));
    var zip = await JSZip.loadAsync(file);
    var total = 0;
    var entries = [];
    zip.forEach(function (relativePath, entry) {
      if (!entry.dir) entries.push({ path: relativePath, entry: entry });
    });
    for (var i = 0; i < entries.length; i++) {
      var path = entries[i].path;
      var entry = entries[i].entry;
      var safe = ADUtils.safePath(path);
      if (!safe || safe.indexOf("..") !== -1) continue;
      var ext = ADUtils.getExt(safe);
      if ([".png",".jpg",".jpeg",".gif",".webp",".ico",".woff",".woff2",".ttf",".eot",".mp3",".mp4",".pdf",".exe",".dll"].indexOf(ext) !== -1) continue;
      try {
        var text = await entry.async("string");
        total += text.length;
        if (total > 15 * 1024 * 1024) throw new Error(ADi18n.t("zipTooLarge"));
        if (projectFiles[safe] !== undefined) {
          fileMeta = fileMeta.filter(function (f) { return f.name !== safe; });
        }
        projectFiles[safe] = text;
        fileMeta.push({
          name: safe,
          size: text.length,
          type: ADUtils.SUPPORTED_EXTENSIONS[ext] || "unknown"
        });
      } catch (e) {
        if (e.message === ADi18n.t("zipTooLarge")) throw e;
      }
    }
  }

  function removeFile(name) {
    delete projectFiles[name];
    fileMeta = fileMeta.filter(function (f) { return f.name !== name; });
    renderFileList();
    if (startBtn) startBtn.disabled = !fileMeta.length;
    if (!fileMeta.length) setStatus(ADi18n.t("statusReady"), "idle");
    else setStatus(ADi18n.t("localReady", { n: fileMeta.length }), "idle");
  }

  function renderFileList() {
    if (!fileList) return;
    if (!fileMeta.length) {
      fileList.innerHTML = '<p class="empty-state">' + ADUtils.escapeHtml(ADi18n.t("noFiles")) + "</p>";
      return;
    }
    var delLabel = ADi18n.t("deleteFile");
    fileList.innerHTML = fileMeta.map(function (f) {
      return (
        '<div class="file-item" data-name="' + ADUtils.escapeHtml(f.name) + '">' +
        '<span class="name" title="' + ADUtils.escapeHtml(f.name) + '">' + ADUtils.escapeHtml(f.name) + "</span>" +
        '<span class="meta">' + ADUtils.formatSize(f.size) + " · " + ADUtils.escapeHtml(f.type) + "</span>" +
        '<button type="button" class="btn danger-ghost" data-delete="' + ADUtils.escapeHtml(f.name) + '" title="' + ADUtils.escapeHtml(delLabel) + '" aria-label="' + ADUtils.escapeHtml(delLabel) + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>' +
        "</button></div>"
      );
    }).join("");

    var btns = fileList.querySelectorAll("[data-delete]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          removeFile(btn.getAttribute("data-delete"));
        });
      })(btns[i]);
    }
  }

  async function startAnalysis() {
    if (isAnalyzing || !Object.keys(projectFiles).length) return;
    isAnalyzing = true;
    if (startBtn) startBtn.disabled = true;
    if (progressWrap) progressWrap.hidden = false;
    if (progressFill) progressFill.style.width = "5%";
    if (progressText) progressText.textContent = ADi18n.t("analyzing");
    setStatus(ADi18n.t("statusAnalyzing"), "working");
    if (resultsEmpty) resultsEmpty.hidden = true;
    if (resultsContent) resultsContent.hidden = true;

    var p = 5;
    var tick = setInterval(function () {
      p = Math.min(p + Math.random() * 8, 85);
      if (progressFill) progressFill.style.width = p + "%";
    }, 200);

    try {
      await new Promise(function (r) { setTimeout(r, 20); });
      var mapper = new ADProjectMapper.ProjectMapper(projectFiles);
      var graph = mapper.map();
      await new Promise(function (r) { setTimeout(r, 10); });

      var lang = languageSelect ? languageSelect.value : "auto";
      if (lang === "auto") lang = ADUtils.detectLanguage(projectFiles);

      var engine = new ADDebugEngine.DebugEngine(
        projectFiles,
        lang,
        categorySelect ? categorySelect.value : "Code / Logic",
        parseInt(levelSelect ? levelSelect.value : "1", 10),
        graph
      );
      var result = engine.run();

      for (var i = 0; i < Math.min(result.problems.length, 30); i++) {
        var prob = result.problems[i];
        try {
          await ADKnowledge.savePattern({
            language: lang,
            category: categorySelect ? categorySelect.value : "",
            severity: prob.severity,
            description: prob.description,
            root_cause: prob.root_cause,
            patternKey: lang + "|" + prob.severity + "|" + (prob.description || "").slice(0, 60)
          });
        } catch (e) {}
      }

      clearInterval(tick);
      if (progressFill) progressFill.style.width = "100%";
      if (progressText) progressText.textContent = ADi18n.t("statusDone");

      allProblems = result.problems || [];
      renderResults(result);
      setStatus(ADi18n.t("statusDone") + " · " + allProblems.length, "idle");
    } catch (err) {
      clearInterval(tick);
      console.error(err);
      if (progressText) progressText.textContent = err.message;
      setStatus(ADi18n.t("statusError"), "error");
      if (resultsEmpty) {
        resultsEmpty.hidden = false;
        resultsEmpty.innerHTML =
          '<div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg></div>' +
          "<h3>" + ADUtils.escapeHtml(ADi18n.t("analysisFailed")) + "</h3>" +
          "<p>" + ADUtils.escapeHtml(err.message) + "</p>";
      }
    } finally {
      isAnalyzing = false;
      if (startBtn) startBtn.disabled = false;
      setTimeout(function () {
        if (progressWrap) progressWrap.hidden = true;
      }, 800);
    }
  }

  function renderResults(result) {
    if (resultsEmpty) resultsEmpty.hidden = true;
    if (resultsContent) resultsContent.hidden = false;
    if (filters) filters.hidden = false;

    var summary = result.summary || {};
    var bySev = summary.by_severity || {};

    if (summaryCards) {
      summaryCards.innerHTML =
        '<div class="card total"><div class="value">' + (summary.total_problems || 0) + '</div><div class="label">' + ADUtils.escapeHtml(ADi18n.t("total")) + "</div></div>" +
        '<div class="card critical"><div class="value">' + (bySev.critical || 0) + '</div><div class="label">' + ADUtils.escapeHtml(ADi18n.t("critical")) + "</div></div>" +
        '<div class="card high"><div class="value">' + (bySev.high || 0) + '</div><div class="label">' + ADUtils.escapeHtml(ADi18n.t("high")) + "</div></div>" +
        '<div class="card medium"><div class="value">' + (bySev.medium || 0) + '</div><div class="label">' + ADUtils.escapeHtml(ADi18n.t("medium")) + "</div></div>" +
        '<div class="card low"><div class="value">' + (bySev.low || 0) + '</div><div class="label">' + ADUtils.escapeHtml(ADi18n.t("low")) + "</div></div>" +
        '<div class="card info"><div class="value">' + (bySev.info || 0) + '</div><div class="label">' + ADUtils.escapeHtml(ADi18n.t("info")) + "</div></div>";
    }

    if (testList) {
      var tests = result.test_results || [];
      testList.innerHTML = tests.length
        ? tests.map(function (tr) {
            return '<div class="test-item"><span class="status"></span><span class="name">' +
              ADUtils.escapeHtml(tr.name || "Test") + '</span><span class="count">' +
              (tr.problems_found != null ? tr.problems_found : tr.status) + "</span></div>";
          }).join("")
        : '<div class="test-item"><span class="name">—</span></div>';
    }

    var files = summary.files_analyzed || [];
    if (fileFilter) {
      fileFilter.innerHTML =
        '<option value="all">' + ADUtils.escapeHtml(ADi18n.t("allFiles")) + "</option>" +
        files.map(function (f) {
          return '<option value="' + ADUtils.escapeHtml(f) + '">' + ADUtils.escapeHtml(f) + "</option>";
        }).join("");
    }

    if (problemCount) problemCount.textContent = allProblems.length;
    renderProblems();
  }

  function renderProblems() {
    if (!problemList) return;
    var sev = severityFilter ? severityFilter.value : "all";
    var file = fileFilter ? fileFilter.value : "all";
    var filtered = allProblems;
    if (sev !== "all") filtered = filtered.filter(function (p) { return p.severity === sev; });
    if (file !== "all") filtered = filtered.filter(function (p) { return p.file_name === file; });

    if (problemCount) problemCount.textContent = filtered.length;

    if (!filtered.length) {
      problemList.innerHTML = '<p style="color:var(--text-dim);padding:1rem;text-align:center">' + ADUtils.escapeHtml(ADi18n.t("noMatch")) + "</p>";
      return;
    }

    problemList.innerHTML = filtered.map(function (p) {
      return (
        '<div class="problem-card">' +
        '<div class="problem-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
        '<span class="severity-badge ' + ADUtils.escapeHtml(p.severity) + '">' + ADUtils.escapeHtml(p.severity) + "</span>" +
        "<div><div class=\"problem-title\">" + ADUtils.escapeHtml(p.description) + "</div>" +
        '<div class="problem-meta">' + ADUtils.escapeHtml(p.file_name) +
        (p.line ? " · L" + p.line : "") + " · " + ADUtils.escapeHtml(p.problem_id) +
        " · " + ADi18n.t("conf") + " " + ((p.confidence * 100) | 0) + "%</div></div></div>" +
        '<div class="problem-body"><div class="detail-grid">' +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("rootCause")) + '</span><span class="value">' + ADUtils.escapeHtml(p.root_cause) + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("symptom")) + '</span><span class="value">' + ADUtils.escapeHtml(p.symptom) + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("why")) + '</span><span class="value">' + ADUtils.escapeHtml(p.why_problematic) + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("expected")) + '</span><span class="value">' + ADUtils.escapeHtml(p.expected_behavior) + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("evidence")) + '</span><span class="value code-like">' + ADUtils.escapeHtml(p.evidence || p.detected_behavior) + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("impact")) + '</span><span class="value">' + ADUtils.escapeHtml(p.impact) + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("recommendation")) + '</span><span class="value">' + ADUtils.escapeHtml(p.recommended_correction_area) + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("detectedBy")) + '</span><span class="value">' + ADUtils.escapeHtml(p.test_detected) + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("section")) + '</span><span class="value">' + ADUtils.escapeHtml(p.section || "—") + "</span></div>" +
        "</div></div></div>"
      );
    }).join("");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
