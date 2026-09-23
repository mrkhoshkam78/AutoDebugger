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
  var lastResult = null;
  var isAnalyzing = false;

  function $(s) { return document.querySelector(s); }

  var uploadZone, fileInput, browseBtn, fileList, languageSelect, categorySelect,
      levelSelect, levelDesc, startBtn, progressWrap, progressFill, progressText, progressMeta, progressStages,
      headerStatus, resultsEmpty, resultsContent, summaryCards, testList,
      problemList, problemCount, filters, severityFilter, fileFilter, categoryFilter,
      settingsOverlay, settingsBtn, settingsClose, clearAllBtn, uploadMeta, uploadProjectName, finalPromptSection, finalPromptBox, copyPromptBtn;

  var LEVEL_KEYS = { 1: "level1Desc", 2: "level2Desc", 3: "level3Desc", 4: "level4Desc" };

  function cacheDom() {
    uploadZone = $("#uploadZone");
    fileInput = $("#fileInput");
    browseBtn = $("#browseBtn");
    fileList = $("#fileList");
    languageSelect = $("#languageSelect");
    categorySelect = $("#categorySelect");
    levelSelect = $("#levelValue") || $("#levelSelect");
    var levelOptions = document.getElementById("levelSelect");
    levelDesc = $("#levelDesc");
    startBtn = $("#startBtn");
    progressWrap = $("#progressWrap");
    progressFill = $("#progressFill");
    progressText = $("#progressText");
    progressMeta = $("#progressMeta");
    progressStages = $("#progressStages");
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
    finalPromptSection = $("#finalPromptSection");
    finalPromptBox = $("#finalPromptBox");
    copyPromptBtn = $("#copyPromptBtn");
  }

  function normalizeTheme(theme) {
    theme = String(theme || "").toLowerCase();
    if (theme === "light" || theme === "clearspace") return "clearspace";
    if (theme === "dark" || theme === "midnight") return "midnight";
    return "midnight";
  }

  function loadTheme() {
    var theme = "midnight";
    try {
      var s = localStorage.getItem("ad_theme");
      if (s) theme = normalizeTheme(s);
    } catch (e) {}
    document.documentElement.setAttribute("data-theme", theme);
    return theme;
  }

  function setTheme(theme) {
    theme = normalizeTheme(theme);
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("ad_theme", theme); } catch (e) {}
    syncSettingsUI();
  }

  function applyLanguage(lang) {
    lang = lang === "fa" ? "fa" : "en";
    ADi18n.setLang(lang);
    var dir = lang === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
    document.body.lang = lang;
    document.body.dir = dir;
    document.body.setAttribute("dir", dir);
    ADi18n.applyI18n(document);
    // Translate fixed <option> labels that are not data-i18n (category/language/level)
    localizeSelectOptions();
    updateLevelDesc();
    renderFileList();
    if (analysisState === "done" || allProblems.length) {
      if (typeof ADExplain !== "undefined" && ADExplain.reLocalizeFinding) {
        allProblems = allProblems.map(function (p) { return ADExplain.reLocalizeFinding(p); });
      }
      setResultsView("done");
      renderResults({ summary: { total_problems: allProblems.length, files_analyzed: Object.keys(projectFiles) }, test_results: [] });
    }
    syncSettingsUI();
    if (headerStatus && !isAnalyzing) {
      var statusSpan = headerStatus.querySelector("span:not(.dot)");
      if (statusSpan) statusSpan.textContent = ADi18n.t("statusReady");
    }
  }

  function localizeSelectOptions() {
    if (typeof ADi18n === "undefined") return;
    var fa = ADi18n.getLang() === "fa";
    var catMap = {
      "Test All": fa ? "همه دسته‌ها" : "Test All",
      "Code / Logic": fa ? "کد / منطق" : "Code / Logic",
      "Security": fa ? "امنیت" : "Security",
      "Mathematical / Calculations": fa ? "ریاضی / محاسبات" : "Mathematical / Calculations",
      "Database / Storage": fa ? "دیتابیس / ذخیره" : "Database / Storage",
      "Performance": fa ? "عملکرد" : "Performance",
      "UI": fa ? "رابط کاربری (UI)" : "UI",
      "UX": fa ? "تجربه کاربری (UX)" : "UX",
      "Responsive behavior": fa ? "رفتار واکنش‌گرا" : "Responsive behavior",
      "Syntax": fa ? "نحو (Syntax)" : "Syntax",
      "Structure / Architecture": fa ? "ساختار / معماری" : "Structure / Architecture"
    };
    var catEl = document.getElementById("categorySelect");
    if (catEl && catEl.options) {
      Array.prototype.forEach.call(catEl.options, function (o) {
        if (catMap[o.value]) o.textContent = catMap[o.value];
      });
    }
    var langEl = document.getElementById("languageSelect");
    if (langEl && langEl.options) {
      var langMap = {
        auto: fa ? "خودکار" : "Auto",
        javascript: "JavaScript",
        typescript: "TypeScript",
        python: "Python",
        html: "HTML",
        css: "CSS",
        php: "PHP",
        java: "Java"
      };
      Array.prototype.forEach.call(langEl.options, function (o) {
        if (langMap[o.value]) o.textContent = langMap[o.value];
      });
    }
    var levelEl = document.getElementById("levelSelect");
    if (levelEl && levelEl.tagName === "SELECT" && levelEl.options) {
      var levels = fa
        ? ["1 — سریع", "2 — کامل", "3 — تخصصی", "4 — عمیق"]
        : ["1 — Quick", "2 — Full", "3 — Specialized", "4 — Deep"];
      Array.prototype.forEach.call(levelEl.options, function (o, i) {
        if (levels[i]) o.textContent = levels[i];
      });
    }
    document.querySelectorAll(".mode-pill").forEach(function (pill, i) {
      var labels = fa ? ["سریع", "کامل", "تخصصی", "عمیق"] : ["Quick", "Full", "Specialized", "Deep"];
      if (labels[i]) pill.textContent = labels[i];
    });
    var td = document.getElementById("themeDarkBtn");
    var tl = document.getElementById("themeLightBtn");
    if (td) td.textContent = fa ? "تاریک" : "Midnight";
    if (tl) tl.textContent = fa ? "روشن" : "Clear";
  }

  function updateLevelDesc() {
    if (!levelDesc) return;
    var hv = document.getElementById("levelValue");
    var val = (hv && hv.value) || (levelSelect && levelSelect.value) || "1";
    var key = LEVEL_KEYS[val] || "level1Desc";
    levelDesc.textContent = ADi18n.t(key);
  }

  function syncSettingsUI() {
    var lang = ADi18n.getLang();
    var theme = normalizeTheme(document.documentElement.getAttribute("data-theme") || "midnight");
    var langEnBtn = $("#langEnBtn");
    var langFaBtn = $("#langFaBtn");
    var themeDarkBtn = $("#themeDarkBtn");
    var themeLightBtn = $("#themeLightBtn");
    if (langEnBtn) langEnBtn.classList.toggle("active", lang === "en");
    if (langFaBtn) langFaBtn.classList.toggle("active", lang === "fa");
    if (themeDarkBtn) themeDarkBtn.classList.toggle("active", theme === "midnight");
    if (themeLightBtn) themeLightBtn.classList.toggle("active", theme === "clearspace");
    document.querySelectorAll("[data-theme-set]").forEach(function (btn) {
      var t = normalizeTheme(btn.getAttribute("data-theme-set"));
      btn.classList.toggle("active", t === theme);
    });
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


  function applyDefaultLevelFromSettings() {
    var def = "1";
    try {
      def = localStorage.getItem("ad_default_level") || "1";
    } catch (e) {}
    def = String(parseInt(def, 10) || 1);
    if (def < "1" || def > "4") def = "1";
    var hv = document.getElementById("levelValue");
    if (hv) hv.value = def;
    // Keep levelSelect pointing at the real <select>, never the hidden input
    var sel = document.getElementById("levelSelect");
    if (sel && sel.tagName === "SELECT") {
      levelSelect = sel;
      sel.value = def;
    }
    var levelOpts = document.querySelectorAll(".level-opt");
    for (var i = 0; i < levelOpts.length; i++) {
      var on = levelOpts[i].getAttribute("data-level") === def;
      levelOpts[i].classList.toggle("active", on);
      levelOpts[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    updateLevelDesc();
  }

  function init() {
    try {
    cacheDom();
    if (typeof ADi18n !== "undefined") {
      ADi18n.loadLang();
    }
    loadTheme();
    try { applyLanguage(ADi18n.getLang()); } catch (eLang) { console.warn("i18n", eLang); }
    try { applyDefaultLevelFromSettings(); } catch (eLv) { console.warn("level", eLv); }
    // Restore select reference if something corrupted it
    var realLevel = document.getElementById("levelSelect");
    if (realLevel && realLevel.tagName === "SELECT") levelSelect = realLevel;

    var levelOpts = document.querySelectorAll(".level-opt");
    for (var li = 0; li < levelOpts.length; li++) {
      levelOpts[li].addEventListener("click", function () {
        var lv = this.getAttribute("data-level");
        for (var j = 0; j < levelOpts.length; j++) {
          levelOpts[j].classList.toggle("active", levelOpts[j] === this);
          levelOpts[j].setAttribute("aria-pressed", levelOpts[j] === this ? "true" : "false");
        }
        var hv = document.getElementById("levelValue");
        if (hv) hv.value = lv;
        var sel = document.getElementById("levelSelect");
        if (sel && sel.tagName === "SELECT") {
          levelSelect = sel;
          sel.value = lv;
        }
        try { localStorage.setItem("ad_default_level", String(lv)); } catch (eLv) {}
        updateLevelDesc();
      });
    }
    if (levelSelect && levelSelect.tagName === "SELECT") levelSelect.addEventListener("change", updateLevelDesc);

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
      uploadZone.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;
        if (fileInput) fileInput.click();
      });
      uploadZone.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (fileInput) fileInput.click();
        }
      });
    }

    if (startBtn) startBtn.addEventListener("click", startAnalysis);

    if (levelSelect) {
      levelSelect.addEventListener("change", function () {
        var hv = document.getElementById("levelValue");
        if (hv) hv.value = levelSelect.value;
        updateLevelDesc();
        document.querySelectorAll(".mode-pill").forEach(function (pill, i) {
          pill.classList.toggle("on", String(i + 1) === String(levelSelect.value));
        });
      });
    }

    var pauseBtn = document.getElementById("pauseBtn");
    var resumeBtn = document.getElementById("resumeBtn");
    var cancelBtn = document.getElementById("cancelBtn");
    if (pauseBtn) pauseBtn.addEventListener("click", pauseAnalysis);
    if (resumeBtn) resumeBtn.addEventListener("click", resumeAnalysis);
    if (cancelBtn) cancelBtn.addEventListener("click", cancelAnalysis);
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
    if (copyPromptBtn) {
      copyPromptBtn.addEventListener("click", function (e) {
        e.preventDefault();
        var text = finalPromptBox ? finalPromptBox.textContent : "";
        if (!text) return;
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
          navigator.clipboard.writeText(text).then(ok).catch(function () { fallbackCopy(text); ok(); });
        } else { fallbackCopy(text); ok(); }
      });
    }

    var langEnBtn = $("#langEnBtn");
    var langFaBtn = $("#langFaBtn");
    var themeDarkBtn = $("#themeDarkBtn");
    var themeLightBtn = $("#themeLightBtn");
    if (langEnBtn) langEnBtn.addEventListener("click", function () { applyLanguage("en"); });
    if (langFaBtn) langFaBtn.addEventListener("click", function () { applyLanguage("fa"); });
    document.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyLanguage(btn.getAttribute("data-lang"));
      });
    });
    if (themeDarkBtn) themeDarkBtn.addEventListener("click", function () { setTheme("midnight"); });
    if (themeLightBtn) themeLightBtn.addEventListener("click", function () { setTheme("clearspace"); });
    document.querySelectorAll("[data-theme-set]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTheme(btn.getAttribute("data-theme-set"));
      });
    });

    try {
      if (typeof ADKnowledge !== "undefined" && ADKnowledge.getStats) {
        ADKnowledge.getStats().then(function (s) {
          if (s.totalPatterns > 0) console.info("Knowledge DB:", s.totalPatterns);
        }).catch(function () {});
      }
    } catch (e) {}
    } catch (initErr) {
      console.error("[AutoDebugger] init failed", initErr);
    }
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


  function setStageProgress(pct, stage, detail) {
    if (progressFill) progressFill.style.width = Math.max(0, Math.min(100, pct)) + "%";
    if (progressText && detail) progressText.textContent = detail;
    if (progressMeta) progressMeta.textContent = detail || "";
    if (!progressStages) return;
    var order = ["understand","context","select","ast","analyze","security","merge","report"];
    var idx = order.indexOf(stage);
    var items = progressStages.querySelectorAll("li");
    for (var i = 0; i < items.length; i++) {
      var s = items[i].getAttribute("data-stage");
      var si = order.indexOf(s);
      items[i].classList.remove("active", "done");
      if (si >= 0 && si < idx) items[i].classList.add("done");
      else if (si === idx) items[i].classList.add("active");
    }
  }

  var currentWorker = null;
  var workerState = "IDLE";

  function updateWorkerControls(state) {
    workerState = state || "IDLE";
    var wc = document.getElementById("workerControls");
    var pauseB = document.getElementById("pauseBtn");
    var resumeB = document.getElementById("resumeBtn");
    var cancelB = document.getElementById("cancelBtn");
    if (!wc) return;
    if (state === "RUNNING" || state === "PAUSING" || state === "PAUSED" || state === "RESUMING") {
      wc.hidden = false;
      wc.style.display = "flex";
      if (pauseB) pauseB.hidden = (state === "PAUSED" || state === "PAUSING");
      if (resumeB) resumeB.hidden = !(state === "PAUSED" || state === "PAUSING");
      if (cancelB) cancelB.hidden = false;
    } else {
      wc.hidden = true;
      wc.style.display = "";
      if (pauseB) pauseB.hidden = false;
      if (resumeB) resumeB.hidden = true;
    }
  }

  function runAnalysisInWorker(files, language, category, level) {
    return new Promise(function (resolve, reject) {
      var worker;
      try {
        worker = new Worker("js/worker/analysis-worker.js");
        currentWorker = worker;
      } catch (e) {
        reject(e);
        return;
      }
      var finished = false;
      updateWorkerControls("RUNNING");
      worker.onmessage = function (ev) {
        var msg = ev.data || {};
        if (msg.type === "progress") {
          setStageProgress(msg.percent || 0, msg.stage, msg.detail || "");
          if (msg.state) updateWorkerControls(msg.state);
        } else if (msg.type === "state") {
          updateWorkerControls(msg.state);
          if (msg.state === "PAUSED") setStatus(ADi18n.t("statusPaused") || "Paused", "working");
        } else if (msg.type === "result") {
          finished = true;
          updateWorkerControls("COMPLETED");
          try { worker.terminate(); } catch (e) {}
          currentWorker = null;
          resolve(msg.result);
        } else if (msg.type === "cancelled") {
          finished = true;
          updateWorkerControls("CANCELLED");
          try { worker.terminate(); } catch (e) {}
          currentWorker = null;
          reject(new Error("ANALYSIS_CANCELLED"));
        } else if (msg.type === "error") {
          finished = true;
          updateWorkerControls("FAILED");
          try { worker.terminate(); } catch (e) {}
          currentWorker = null;
          reject(new Error(msg.message || "Worker error"));
        }
      };
      worker.onerror = function (err) {
        if (finished) return;
        updateWorkerControls("FAILED");
        try { worker.terminate(); } catch (e) {}
        currentWorker = null;
        reject(err && err.message ? err : new Error("Worker failed"));
      };
      var uiLang = (typeof ADi18n !== "undefined" && ADi18n.getLang) ? ADi18n.getLang() : (localStorage.getItem("ad_lang") || "en");
      worker.postMessage({ type: "analyze", files: files, language: language, category: category, level: level, uiLang: uiLang });
    });
  }

  function pauseAnalysis() {
    if (currentWorker && workerState === "RUNNING") {
      currentWorker.postMessage({ type: "pause" });
    }
  }
  function resumeAnalysis() {
    if (currentWorker && (workerState === "PAUSED" || workerState === "PAUSING")) {
      currentWorker.postMessage({ type: "resume" });
    }
  }
  function cancelAnalysis() {
    if (currentWorker) {
      currentWorker.postMessage({ type: "cancel" });
      // hard terminate after short grace
      setTimeout(function () {
        if (currentWorker) {
          try { currentWorker.terminate(); } catch (e) {}
          currentWorker = null;
          updateWorkerControls("CANCELLED");
          isAnalyzing = false;
          if (startBtn) startBtn.disabled = !Object.keys(projectFiles).length;
          setStatus(ADi18n.t("statusCancelled") || "Cancelled", "idle");
          if (progressWrap) progressWrap.hidden = true;
        }
      }, 800);
    }
  }

  function runAnalysisMain(files, language, category, level) {
    setStageProgress(10, "understand", "Understanding project");
    var graph = new ADProjectMapper.ProjectMapper(files).map();
    setStageProgress(20, "context", "Mapping context");
    var astMap = null;
    if (globalThis.ADAst) {
      setStageProgress(30, "ast", "AST parsing");
      astMap = ADAst.analyzeProject(files);
    }
    setStageProgress(40, "select", "Selecting strategies");
    var engine = new ADDebugEngine.DebugEngine(files, language, category, level, graph);
    if (astMap) engine.astMap = astMap;
    setStageProgress(55, "analyze", "Running analysis");
    var result = engine.run();
    setStageProgress(75, "security", "Security analysis · " + (result.strategies_count || 0) + " strategies");
    setStageProgress(90, "merge", "Merging findings");
    if (typeof ADCentralIntelligence !== "undefined" && ADCentralIntelligence.review) {
      try {
        result = ADCentralIntelligence.review(result, { category: category, level: level });
      } catch (e) {}
    }
    setStageProgress(95, "intelligence", "Central Intelligence");
    return result;
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
      var lang = languageSelect ? languageSelect.value : "auto";
      if (lang === "auto") lang = ADUtils.detectLanguage(projectFiles);
      var cat = categorySelect ? categorySelect.value : "Code / Logic";
      var lvl = parseInt((document.getElementById("levelValue") || levelSelect || { value: "1" }).value, 10);

      var result;
      try {
        result = await runAnalysisInWorker(projectFiles, lang, cat, lvl);
      } catch (workerErr) {
        console.warn("Worker fallback:", workerErr);
        result = runAnalysisMain(projectFiles, lang, cat, lvl);
      }
      result.pipeline = result.pipeline || [
        "Project Understanding", "Context Mapping", "Strategy Selection",
        "AST Parsing", "Static Analysis", "Evidence Correlation", "Root Cause",
        "False Positive Reduction", "Finding Merge", "Confidence",
        "Explanation", "Final Report"
      ];
      setStageProgress(100, "report", ADi18n.t("strategiesRun") + ": " + (result.strategies_count || 0));
      await new Promise(function (r) { setTimeout(r, 20); });

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
      lastResult = result;
      allProblems = ADResultsStore.mergeFindings(allProblems, incoming, currentProjectKey);
      try {
        localStorage.setItem("ad_last_project_key", currentProjectKey || "");
        localStorage.setItem("ad_last_category", categorySelect ? categorySelect.value : "");
        localStorage.setItem("ad_last_level", String(lvl || 1));
      } catch (e) {}
      try { await ADResultsStore.saveFindings(currentProjectKey, allProblems); } catch (e) {}
      result.summary = result.summary || {};
      result.summary.total_problems = allProblems.length;
      result.summary.strategies_run = result.strategies_count || 0;
      renderResults(result);
      setResultsView("done");
      updateFinalPrompt({
        category: categorySelect ? categorySelect.value : "",
        level: (document.getElementById("levelValue") || {}).value || "1"
      });
      setStatus(ADi18n.t("statusDone") + " · " + allProblems.length + " · " + (result.strategies_count || 0) + " strat.", "idle");
    } catch (err) {
      clearInterval(tick);
      var isCancel = err && (err.message === "ANALYSIS_CANCELLED" || String(err.message).indexOf("cancel") >= 0);
      if (isCancel) {
        setStatus(ADi18n.t("statusCancelled") || "Cancelled", "idle");
        if (progressText) progressText.textContent = ADi18n.t("statusCancelled") || "Cancelled";
        // Do not register incomplete results as final
        setResultsView("empty");
      } else {
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
      }
    } finally {
      isAnalyzing = false;
      updateWorkerControls("IDLE");
      if (startBtn) startBtn.disabled = !Object.keys(projectFiles).length;
      setTimeout(function () {
        if (progressWrap) progressWrap.hidden = true;
      }, 800);
    }
  }


  function updateFinalPrompt(meta) {
    if (!finalPromptSection || !finalPromptBox || !globalThis.ADFinalPrompt) return;
    meta = meta || {};
    if (lastResult && lastResult.promptReadyFindings) {
      meta.promptReadyFindings = lastResult.promptReadyFindings;
    }
    var gen = ADFinalPrompt.generate(allProblems, meta);
    finalPromptSection.hidden = false;
    finalPromptBox.textContent = gen.text;
    finalPromptBox.dataset.empty = gen.empty ? "1" : "0";
  }

  function renderResults(result) {
    setResultsView("done");

    var summary = result.summary || {};
    var bySev = summary.by_severity || {};
    if (!bySev || typeof bySev !== "object") bySev = {};
    // recompute severity counts from allProblems (persistent)
    bySev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    allProblems.forEach(function (p) { bySev[p.severity] = (bySev[p.severity] || 0) + 1; });


    // Keep HTML sum-card structure in sync (do not replace with mismatched classes)
    var totalCount = summary.total_problems || allProblems.length || 0;
    var warnCount = (bySev.medium || 0) + (bySev.high || 0) + (bySev.low || 0);
    var critCount = bySev.critical || 0;
    var infoCount = bySev.info || 0;
    var elSumTotal = document.getElementById("sumTotal");
    var elSumWarn = document.getElementById("sumWarn");
    var elSumCrit = document.getElementById("sumCrit");
    var elSumInfo = document.getElementById("sumInfo");
    if (elSumTotal) elSumTotal.textContent = String(totalCount);
    if (elSumWarn) elSumWarn.textContent = String(warnCount);
    if (elSumCrit) elSumCrit.textContent = String(critCount);
    if (elSumInfo) elSumInfo.textContent = String(infoCount);
    // Severity tab badges
    var elCountInfo = document.getElementById("countInfo");
    var elCountWarn = document.getElementById("countWarn");
    var elCountCrit = document.getElementById("countCrit");
    if (elCountInfo) elCountInfo.textContent = String(infoCount);
    if (elCountWarn) elCountWarn.textContent = String(warnCount);
    if (elCountCrit) elCountCrit.textContent = String(critCount);
    if (summaryCards) summaryCards.hidden = false;

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
    // Map UI tabs: warning = medium+high+low, critical, info, all
    if (sev !== "all") {
      filtered = filtered.filter(function (p) {
        if (sev === "warning") return p.severity === "medium" || p.severity === "high" || p.severity === "low" || p.severity === "warning";
        if (sev === "critical") return p.severity === "critical";
        if (sev === "info") return p.severity === "info";
        return p.severity === sev;
      });
    }
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
      var why = (sx && sx.why && sx.why.indexOf("sx.") !== 0) ? sx.why : (p.why_problematic || p.why_it_matters || p.impact || "");
      var evidence = (sx && sx.evidence && sx.evidence.indexOf("sx.") !== 0) ? sx.evidence : (p.evidence || p.detected_behavior);
      var fix = (sx && sx.fix && sx.fix.indexOf("sx.") !== 0) ? sx.fix : (p.recommended_correction_area || p.recommendation || "");
      if (typeof ADExplain !== "undefined" && !p.conversational) {
        try { ADExplain.enrichFinding(p); } catch (eEn) {}
      }
      var convo = p.conversational || "";
      if (typeof evidence !== "string") {
        try {
          evidence = Array.isArray(evidence)
            ? evidence.map(function (e) { return e && (e.explanation || e.snippet || ""); }).filter(Boolean).join("; ")
            : String(evidence || "");
        } catch (eEv) { evidence = ""; }
      }
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
        (convo ? ('<div class="simple-row conversational"><p class="conversational-text">' + ADUtils.escapeHtml(convo) + "</p></div>") : "") +
        '<div class="simple-row"><span class="simple-label">' + ADUtils.escapeHtml(ADi18n.t("why")) + '</span><p>' + ADUtils.escapeHtml(why) + "</p></div>" +
        '<div class="simple-row"><span class="simple-label">' + ADUtils.escapeHtml(ADi18n.t("evidence")) + '</span><p class="evidence-block">' + ADUtils.escapeHtml(String(evidence || "")) + "</p></div>" +
        '<div class="simple-row recommend"><span class="simple-label">' + ADUtils.escapeHtml(ADi18n.t("recommendation")) + '</span><p>' + ADUtils.escapeHtml(fix) + "</p></div>" +
        '<div class="loc-row"><span class="loc-file">' + ADUtils.escapeHtml(p.file_name) + "</span>" +
        (p.line ? '<span class="loc-line">L' + p.line + "</span>" : "") +
        '<button type="button" class="btn secondary btn-sm copy-btn" data-copy-idx="' + i + '">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> ' +
        ADUtils.escapeHtml(ADi18n.t("copy")) + "</button>" +
        '<button type="button" class="btn secondary btn-sm ask-assistant-btn" data-ask-idx="' + i + '">' +
        ADUtils.escapeHtml(ADi18n.t("askAssistant") || "Ask Assistant") + "</button>" +
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
    var askBtns = problemList.querySelectorAll("[data-ask-idx]");
    for (var ai = 0; ai < askBtns.length; ai++) {
      askBtns[ai].addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var idx = parseInt(this.getAttribute("data-ask-idx"), 10);
        if (!isNaN(idx) && filtered[idx]) {
          window.__adFocusFinding = filtered[idx];
          var panel = document.getElementById("assistantPanel");
          if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
          sendChatMessage("چرا این Finding گزارش شده؟ " + (filtered[idx].description || "").slice(0, 80));
        }
      });
    }
  }


  function getAssistantAppState(focusFinding) {
    var names = Object.keys(projectFiles || {});
    return {
      projectKey: currentProjectKey || ADResultsStore.projectKeyFromFiles(projectFiles),
      fileCount: names.length,
      fileNames: names,
      category: categorySelect ? categorySelect.value : "Test All",
      level: parseInt((document.getElementById("levelValue") || { value: "1" }).value, 10) || 1,
      findings: allProblems || [],
      focusFinding: focusFinding || null,
      languages: (lastResult && lastResult.context && lastResult.context.languages) || {}
    };
  }

  function appendChatBubble(role, text, meta) {
    var box = document.getElementById("chatMessages");
    if (!box) return;
    var empty = document.getElementById("chatEmpty");
    if (empty) empty.hidden = true;
    var div = document.createElement("div");
    div.className = "chat-bubble " + role;
    div.textContent = text;
    if (meta) {
      var m = document.createElement("div");
      m.className = "chat-meta";
      m.textContent = meta;
      div.appendChild(m);
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  async function sendChatMessage(preset) {
    if (typeof ADLLM === "undefined") {
      appendChatBubble("assistant", "LLM module not loaded. Static analysis still works.");
      return;
    }
    var input = document.getElementById("chatInput");
    var msg = preset || (input && input.value.trim());
    if (!msg) return;
    if (input && !preset) input.value = "";
    appendChatBubble("user", msg);
    var status = document.getElementById("llmStatus");
    if (status) status.textContent = ADLLM.isProviderReady() ? "Provider…" : (typeof ADi18n !== "undefined" ? ADi18n.t("assistantLocal") : "Local");
    try {
      var res = await ADLLM.chat(msg, getAssistantAppState(window.__adFocusFinding || null));
      appendChatBubble("assistant", res.reply, res.source ? ("source: " + res.source) : "");
      if (res.suggestedCategory && categorySelect) {
        // Suggest only — do not auto-run without user confirm; set select value as hint
        var opt = Array.prototype.find.call(categorySelect.options, function (o) { return o.value === res.suggestedCategory; });
        if (opt) {
          appendChatBubble("assistant", "Suggested category: " + res.suggestedCategory + " — select it and run Analysis to apply.");
        }
      }
    } catch (e) {
      appendChatBubble("assistant", "Chat error: " + (e && e.message || e));
    }
  }

  function bindAssistantUI() {
    var send = document.getElementById("chatSend");
    var input = document.getElementById("chatInput");
    var clear = document.getElementById("chatClear");
    var sum = document.getElementById("chatSummarize");
    if (send) send.addEventListener("click", function () { sendChatMessage(); });
    if (input) input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
    if (clear) clear.addEventListener("click", function () {
      if (typeof ADLLM !== "undefined") ADLLM.clearHistory(currentProjectKey || "default");
      var box = document.getElementById("chatMessages");
      if (box) {
        box.innerHTML = "";
        var empty = document.createElement("div");
        empty.className = "chat-empty";
        empty.id = "chatEmpty";
        empty.textContent = typeof ADi18n !== "undefined" ? ADi18n.t("assistantEmpty") : "Ask about findings…";
        box.appendChild(empty);
      }
    });
    if (sum) sum.addEventListener("click", function () { sendChatMessage("خلاصه نتایج را بگو"); });
    var st = document.getElementById("llmStatus");
    if (st && typeof ADLLM !== "undefined") {
      st.textContent = ADLLM.isProviderReady() ? ("Provider: " + (ADLLM.getConfig().provider || "")) : (typeof ADi18n !== "undefined" ? ADi18n.t("assistantLocal") : "Local");
    }
  }




  /** Event delegation — guarantees critical controls work even if direct bind failed */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var langBtn = t.closest("[data-lang]");
    if (langBtn) {
      e.preventDefault();
      try { applyLanguage(langBtn.getAttribute("data-lang")); } catch (err) { console.warn(err); }
      return;
    }
    var themeBtn = t.closest("[data-theme-set]");
    if (themeBtn) {
      e.preventDefault();
      try { setTheme(themeBtn.getAttribute("data-theme-set")); } catch (err) { console.warn(err); }
      return;
    }
    if (t.closest("#startBtn")) {
      e.preventDefault();
      var sb = document.getElementById("startBtn");
      if (sb && sb.disabled) {
        // UX: explain why Start is disabled
        setStatus(ADi18n.t("needFiles") || "ابتدا فایل کد را آپلود کنید", "idle");
        var uz = document.getElementById("uploadZone");
        if (uz) {
          uz.classList.add("dragover");
          setTimeout(function () { uz.classList.remove("dragover"); }, 1200);
          try { uz.focus(); } catch (fe) {}
        }
        return;
      }
      try { startAnalysis(); } catch (err) { console.error(err); }
      return;
    }
    if (t.closest("#browseBtn")) {
      e.preventDefault();
      var fi = document.getElementById("fileInput");
      if (fi) fi.click();
      return;
    }
    if (t.closest("#pauseBtn")) { try { pauseAnalysis(); } catch (err) {} return; }
    if (t.closest("#resumeBtn")) { try { resumeAnalysis(); } catch (err) {} return; }
    if (t.closest("#cancelBtn")) { try { cancelAnalysis(); } catch (err) {} return; }
    if (t.closest("#clearAllBtn")) { try { clearAllFiles(); } catch (err) {} return; }
    if (t.closest("#sidebarOpen")) {
      var side = document.getElementById("appSidebar");
      var ov = document.getElementById("sidebarOverlay");
      if (side) side.classList.add("open");
      if (ov) { ov.hidden = false; ov.classList.add("show", "open"); }
      return;
    }
    if (t.closest("#sidebarClose") || (t.id === "sidebarOverlay")) {
      var side2 = document.getElementById("appSidebar");
      var ov2 = document.getElementById("sidebarOverlay");
      if (side2) side2.classList.remove("open");
      if (ov2) { ov2.hidden = true; ov2.classList.remove("show", "open"); }
      return;
    }
    // Dead nav links (Projects / History / Search) — give clear UX feedback instead of silent #
    var deadNav = t.closest('a.nav-item[href="#"], a.bnav-item[href="#"]');
    if (deadNav) {
      e.preventDefault();
      var msg = (typeof ADi18n !== "undefined" && ADi18n.t) ? ADi18n.t("navComingSoon") : "Coming soon";
      setStatus(msg, "idle");
      return;
    }
  }, true);

  var _origInit = init;
  init = function () {
    _origInit();
    try { bindAssistantUI(); } catch (e) { console.warn("assistant UI", e); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
