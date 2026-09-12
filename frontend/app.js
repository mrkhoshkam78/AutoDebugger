/**
 * Auto Debugger V1.02 — classic script (works on file://)
 * Depends on: ADUtils, ADi18n, ADProjectMapper, ADDebugEngine, ADKnowledge, JSZip
 */

(function () {
  "use strict";

  var projectFiles = {};
  var fileMeta = [];
  var allProblems = [];
  var currentProjectKey = "default";
  var analysisState = "none"; // none | done | error
  var lastUploadLabel = "";
  var isAnalyzing = false;

  function $(s) { return document.querySelector(s); }

  var uploadZone, fileInput, browseBtn, fileList, languageSelect, categorySelect,
      levelSelect, levelDesc, startBtn, progressWrap, progressFill, progressText,
      headerStatus, resultsEmpty, resultsContent, summaryCards, testList,
      problemList, problemCount, filters, severityFilter, fileFilter, categoryFilter,
      settingsOverlay, settingsBtn, settingsClose, clearAllBtn, uploadMeta, uploadProjectName;

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
    categoryFilter = $("#categoryFilter");
    settingsOverlay = $("#settingsOverlay");
    settingsBtn = $("#settingsBtn");
    settingsClose = $("#settingsClose");
    clearAllBtn = $("#clearAllBtn");
    uploadMeta = $("#uploadMeta");
    uploadProjectName = $("#uploadProjectName");
  }

  function loadTheme() {
    var theme = "light";
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
    if (analysisState === "done" || allProblems.length) {
      setResultsView("done");
      renderResults({ summary: { total_problems: allProblems.length, files_analyzed: Object.keys(projectFiles) }, test_results: [] });
    }
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

  function setResultsView(mode) {
    // mode: none | done | empty_done | error | analyzing
    if (!resultsEmpty || !resultsContent) return;
    if (mode === "analyzing") {
      resultsEmpty.hidden = true;
      resultsContent.hidden = true;
      return;
    }
    if (mode === "none") {
      analysisState = "none";
      resultsEmpty.hidden = false;
      resultsContent.hidden = true;
      if (filters) filters.hidden = true;
      resultsEmpty.innerHTML =
        '<div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></div>' +
        "<h3>" + ADUtils.escapeHtml(ADi18n.t("noAnalysis")) + "</h3>" +
        "<p>" + ADUtils.escapeHtml(ADi18n.t("noAnalysisHint")) + "</p>";
      return;
    }
    if (mode === "error") {
      analysisState = "error";
      resultsEmpty.hidden = false;
      resultsContent.hidden = true;
      return;
    }
    // done (with or without findings)
    analysisState = "done";
    resultsEmpty.hidden = true;
    resultsContent.hidden = false;
    if (filters) filters.hidden = false;
  }


  function updateUploadMeta(label) {
    lastUploadLabel = label || "";
    if (!uploadMeta || !uploadProjectName) return;
    if (!lastUploadLabel && !fileMeta.length) {
      uploadMeta.hidden = true;
      uploadProjectName.textContent = "";
      uploadProjectName.removeAttribute("title");
      return;
    }
    var name = lastUploadLabel || (fileMeta[0] && fileMeta[0].name) || "";
    uploadMeta.hidden = false;
    uploadProjectName.textContent = name;
    uploadProjectName.setAttribute("title", name);
  }

  function clearAllFiles() {
    projectFiles = {};
    fileMeta = [];
    lastUploadLabel = "";
    if (fileInput) fileInput.value = "";
    renderFileList();
    updateUploadMeta("");
    if (startBtn) startBtn.disabled = true;
    setStatus(ADi18n.t("statusReady"), "idle");
    // Keep analysis results (do not clear allProblems)
  }

  function copyFinding(p) {
    var sx = (p.simple && p.simple.id && ADi18n.simpleExpl) ? ADi18n.simpleExpl(p.simple.id, p.simple) : null;
    var lines = [
      "Problem: " + (sx && sx.title && sx.title.indexOf("sx.") !== 0 ? sx.title : p.description),
      "Severity: " + (p.severity || ""),
      "Status: " + (p.status || ""),
      "Category: " + (p.category || ""),
      "Confidence: " + (((p.confidence || 0) * 100) | 0) + "%",
      "File: " + (p.file_name || "") + (p.line ? " (L" + p.line + ")" : ""),
      "",
      "Why: " + (sx && sx.why && sx.why.indexOf("sx.") !== 0 ? sx.why : (p.why_problematic || "")),
      "Evidence: " + (sx && sx.evidence && sx.evidence.indexOf("sx.") !== 0 ? sx.evidence : (p.evidence || "")),
      "Recommendation: " + (sx && sx.fix && sx.fix.indexOf("sx.") !== 0 ? sx.fix : (p.recommended_correction_area || "")),
      "",
      "Root cause: " + (p.root_cause || ""),
      "Strategies: " + ((p.detecting_strategies || []).join(", ") || p.test_detected || ""),
      "ID: " + (p.stable_id || p.problem_id || "")
    ];
    var text = lines.join("\n");
    function ok() {
      var tip = document.getElementById("copyToast");
      if (!tip) {
        tip = document.createElement("div");
        tip.id = "copyToast";
        tip.className = "copy-toast";
        document.body.appendChild(tip);
      }
      tip.textContent = ADi18n.t("copied");
      tip.classList.add("show");
      setTimeout(function () { tip.classList.remove("show"); }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(function () {
        fallbackCopy(text); ok();
      });
    } else {
      fallbackCopy(text); ok();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
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
    if (categoryFilter) categoryFilter.addEventListener("change", renderProblems);

    // Settings panel
    function openSettings(open) {
      if (!settingsOverlay) return;
      if (open) {
        settingsOverlay.classList.add("open");
        if (settingsBtn) {
          settingsBtn.classList.add("is-open");
          settingsBtn.setAttribute("aria-expanded", "true");
        }
        syncSettingsUI();
      } else {
        settingsOverlay.classList.remove("open");
        if (settingsBtn) {
          settingsBtn.classList.remove("is-open");
          settingsBtn.setAttribute("aria-expanded", "false");
        }
      }
    }
    if (settingsBtn && settingsOverlay) {
      settingsBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openSettings(!settingsOverlay.classList.contains("open"));
      });
    }
    if (settingsClose && settingsOverlay) {
      settingsClose.addEventListener("click", function (e) {
        e.preventDefault();
        openSettings(false);
      });
    }
    if (settingsOverlay) {
      settingsOverlay.addEventListener("click", function (e) {
        if (e.target === settingsOverlay) openSettings(false);
      });
    }
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", function (e) {
        e.preventDefault();
        clearAllFiles();
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
      if (files.length === 1) lastUploadLabel = files[0].name;
      else if (files.length > 1) lastUploadLabel = files.length + " files";
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (file.name.toLowerCase().endsWith(".zip")) {
          lastUploadLabel = file.name;
          await extractZip(file);
        } else await readSingleFile(file);
      }
      if (!Object.keys(projectFiles).length) throw new Error(ADi18n.t("noReadable"));
      renderFileList();
      if (startBtn) startBtn.disabled = false;
      // Label: prefer ZIP name if present in last selection
      var label = lastUploadLabel;
      if (!label && fileMeta.length === 1) label = fileMeta[0].name;
      else if (!label && fileMeta.length > 1) label = fileMeta.length + " files";
      updateUploadMeta(label);
      currentProjectKey = ADResultsStore.projectKeyFromFiles(projectFiles);
      try {
        var prev = await ADResultsStore.loadFindings(currentProjectKey);
        if (prev && prev.length) {
          allProblems = prev;
          renderResults({ summary: { total_problems: prev.length, by_severity: {}, files_analyzed: Object.keys(projectFiles) }, test_results: [], problems: prev });
        }
      } catch (e) {}
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
    if (progressText) progressText.textContent = ADi18n.t("statusReading");
    setStatus(ADi18n.t("statusAnalyzing"), "working");
    setResultsView("analyzing");

    var p = 5;
    var tick = setInterval(function () {
      p = Math.min(p + Math.random() * 8, 85);
      if (progressFill) progressFill.style.width = p + "%";
    }, 200);

    try {
      function setProgress(pct, msgKey) {
        if (progressFill) progressFill.style.width = pct + "%";
        if (progressText) progressText.textContent = ADi18n.t(msgKey);
      }
      setProgress(12, "statusReading");
      await new Promise(function (r) { setTimeout(r, 30); });
      setProgress(28, "statusMapping");
      var mapper = new ADProjectMapper.ProjectMapper(projectFiles);
      var graph = mapper.map();
      await new Promise(function (r) { setTimeout(r, 20); });
      setProgress(45, "statusContext");
      await new Promise(function (r) { setTimeout(r, 20); });
      setProgress(60, "statusRules");

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
      setProgress(82, "statusValidate");
      await new Promise(function (r) { setTimeout(r, 15); });
      setProgress(92, "statusExplain");
      await new Promise(function (r) { setTimeout(r, 15); });

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

      var incoming = result.problems || [];
      currentProjectKey = ADResultsStore.projectKeyFromFiles(projectFiles);
      allProblems = ADResultsStore.mergeFindings(allProblems, incoming, currentProjectKey);
      try { await ADResultsStore.saveFindings(currentProjectKey, allProblems); } catch (e) {}
      result.summary = result.summary || {};
      result.summary.total_problems = allProblems.length;
      result.summary.strategies_run = result.strategies_count || 0;
      renderResults(result);
      setResultsView("done");
      setStatus(ADi18n.t("statusDone") + " · " + allProblems.length + " · " + (result.strategies_count || 0) + " strat.", "idle");
    } catch (err) {
      clearInterval(tick);
      console.error(err);
      if (progressText) progressText.textContent = err.message;
      setStatus(ADi18n.t("statusError"), "error");
      setResultsView("error");
      if (resultsEmpty) {
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
    setResultsView("done");

    var summary = result.summary || {};
    var bySev = summary.by_severity || {};
    if (!bySev || typeof bySev !== "object") bySev = {};
    // recompute severity counts from allProblems (persistent)
    bySev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    allProblems.forEach(function (p) { bySev[p.severity] = (bySev[p.severity] || 0) + 1; });


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

    var files = summary.files_analyzed || Object.keys(projectFiles);
    if (fileFilter) {
      fileFilter.innerHTML =
        '<option value="all">' + ADUtils.escapeHtml(ADi18n.t("allFiles")) + "</option>" +
        files.map(function (f) {
          return '<option value="' + ADUtils.escapeHtml(f) + '">' + ADUtils.escapeHtml(f) + "</option>";
        }).join("");
    }
    if (categoryFilter) {
      var cats = {};
      allProblems.forEach(function (p) {
        cats[p.category] = 1;
        (p.related_categories || []).forEach(function (c) { cats[c] = 1; });
      });
      var catKeys = Object.keys(cats);
      categoryFilter.innerHTML =
        '<option value="all">' + ADUtils.escapeHtml(ADi18n.t("allCategories")) + "</option>" +
        catKeys.map(function (c) {
          return '<option value="' + ADUtils.escapeHtml(c) + '">' + ADUtils.escapeHtml(c) + "</option>";
        }).join("");
    }

    if (problemCount) problemCount.textContent = allProblems.length;
    renderProblems();
    if (!allProblems.length && problemList) {
      problemList.innerHTML = '<p class="empty-filter analyzed-empty">' + ADUtils.escapeHtml(ADi18n.t("analyzedNoFindings")) + "</p>";
    }
  }

  function renderProblems() {
    if (!problemList) return;
    var sev = severityFilter ? severityFilter.value : "all";
    var file = fileFilter ? fileFilter.value : "all";
    var cat = categoryFilter ? categoryFilter.value : "all";
    var filtered = allProblems;
    if (sev !== "all") filtered = filtered.filter(function (p) { return p.severity === sev; });
    if (file !== "all") filtered = filtered.filter(function (p) { return p.file_name === file; });
    if (cat !== "all") filtered = filtered.filter(function (p) {
      if (p.category === cat) return true;
      var rel = p.related_categories || [];
      return rel.indexOf(cat) !== -1;
    });

    if (problemCount) problemCount.textContent = filtered.length;

    if (!filtered.length) {
      problemList.innerHTML = '<p class="empty-filter">' + ADUtils.escapeHtml(ADi18n.t("noMatch")) + "</p>";
      return;
    }

    problemList.innerHTML = filtered.map(function (p, i) {
      var ruleId = (p.simple && p.simple.id) || p.rule_id || "";
      var sx = ruleId && ADi18n.simpleExpl ? ADi18n.simpleExpl(ruleId, p.simple || {}) : null;
      var title = (sx && sx.title && sx.title.indexOf("sx.") !== 0) ? sx.title : p.description;
      var why = (sx && sx.why && sx.why.indexOf("sx.") !== 0) ? sx.why : p.why_problematic;
      var evidence = (sx && sx.evidence && sx.evidence.indexOf("sx.") !== 0) ? sx.evidence : (p.evidence || p.detected_behavior);
      var fix = (sx && sx.fix && sx.fix.indexOf("sx.") !== 0) ? sx.fix : p.recommended_correction_area;
      var statusLabel = ADi18n.t("status" + (p.status === "CONFIRMED" ? "Confirmed" : p.status === "POSSIBLE" ? "Possible" : "Likely"));
      var confPct = ((p.confidence != null ? p.confidence : 0.5) * 100) | 0;

      return (
        '<article class="problem-card sev-' + ADUtils.escapeHtml(p.severity) + ' fade-in">' +
        '<div class="problem-header" data-toggle-card>' +
        '<span class="severity-badge ' + ADUtils.escapeHtml(p.severity) + '">' + ADUtils.escapeHtml(p.severity) + "</span>" +
        '<div class="problem-main">' +
        '<div class="problem-title">' + ADUtils.escapeHtml(title) + "</div>" +
        '<div class="problem-meta">' +
        '<span class="status-pill status-' + ADUtils.escapeHtml((p.status || "LIKELY").toLowerCase()) + '">' + ADUtils.escapeHtml(statusLabel) + "</span>" +
        '<span class="conf-pill">' + ADi18n.t("conf") + " " + confPct + "%</span>" +
        "</div></div>" +
        '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>' +
        "</div>" +
        '<div class="problem-body">' +
        '<div class="simple-block">' +
        '<div class="simple-row"><span class="simple-label">' + ADUtils.escapeHtml(ADi18n.t("why")) + '</span><p>' + ADUtils.escapeHtml(why) + "</p></div>" +
        '<div class="simple-row"><span class="simple-label">' + ADUtils.escapeHtml(ADi18n.t("evidence")) + '</span><p>' + ADUtils.escapeHtml(evidence) + "</p></div>" +
        '<div class="simple-row recommend"><span class="simple-label">' + ADUtils.escapeHtml(ADi18n.t("recommendation")) + '</span><p>' + ADUtils.escapeHtml(fix) + "</p></div>" +
        '<div class="loc-row"><span class="loc-file">' + ADUtils.escapeHtml(p.file_name) + "</span>" +
        (p.line ? '<span class="loc-line">L' + p.line + "</span>" : "") +
        '<button type="button" class="btn secondary btn-sm copy-btn" data-copy-idx="' + i + '">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> ' +
        ADUtils.escapeHtml(ADi18n.t("copy")) + "</button>" +
        "</div></div>" +
        '<details class="tech-details">' +
        "<summary>" + ADUtils.escapeHtml(ADi18n.t("techDetails")) + "</summary>" +
        '<div class="detail-grid">' +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("rootCause")) + '</span><span class="value">' + ADUtils.escapeHtml(p.root_cause || "—") + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("expected")) + '</span><span class="value">' + ADUtils.escapeHtml(p.expected_behavior || "—") + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("detectedBy")) + '</span><span class="value">' + ADUtils.escapeHtml((p.detecting_strategies && p.detecting_strategies.join(', ')) || p.test_detected || "—") + "</span></div>" +
        '<div class="detail-row"><span class="label">' + ADUtils.escapeHtml(ADi18n.t("section")) + '</span><span class="value">' + ADUtils.escapeHtml(p.section || "—") + "</span></div>" +
        '<div class="detail-row"><span class="label">ID</span><span class="value code-like">' + ADUtils.escapeHtml(p.problem_id) + "</span></div>" +
        "</div></details>" +
        "</div></article>"
      );
    }).join("");

    var headers = problemList.querySelectorAll("[data-toggle-card]");
    for (var hi = 0; hi < headers.length; hi++) {
      headers[hi].addEventListener("click", function (e) {
        if (e.target.closest("details") || e.target.closest("a") || e.target.closest("button")) return;
        this.parentElement.classList.toggle("open");
      });
    }
    var copyBtns = problemList.querySelectorAll("[data-copy-idx]");
    for (var ci = 0; ci < copyBtns.length; ci++) {
      copyBtns[ci].addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var idx = parseInt(this.getAttribute("data-copy-idx"), 10);
        if (!isNaN(idx) && filtered[idx]) copyFinding(filtered[idx]);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
