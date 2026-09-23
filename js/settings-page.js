(function () {
  function $(id) { return document.getElementById(id); }

  function applyLang(lang) {
    if (typeof ADi18n === "undefined") return;
    if (lang) ADi18n.setLang(lang);
    else if (ADi18n.loadLang) ADi18n.loadLang();
    var L = ADi18n.getLang();
    document.documentElement.lang = L;
    document.documentElement.dir = L === "fa" ? "rtl" : "ltr";
    ADi18n.applyI18n(document);
  }

  function init() {
    try {
      var theme = localStorage.getItem("ad_theme") || "midnight";
      if (theme === "dark") theme = "midnight";
      if (theme === "light") theme = "clearspace";
      document.documentElement.setAttribute("data-theme", theme);
      if ($("setTheme")) $("setTheme").value = theme;
    } catch (e) {}

    applyLang();

    var lang = typeof ADi18n !== "undefined" ? ADi18n.getLang() : "en";
    var level = "1";
    try {
      level = localStorage.getItem("ad_default_level") || "1";
    } catch (e) {}
    if ($("setLang")) $("setLang").value = lang;
    if ($("setLevel")) $("setLevel").value = level;

    if (typeof ADLLM !== "undefined") {
      var c = ADLLM.getConfig();
      if ($("setProvider")) $("setProvider").value = c.provider || "none";
      if ($("setEndpoint")) $("setEndpoint").value = c.endpoint || "";
      if ($("setModel")) $("setModel").value = c.model || "";
    }

    // LLM collapsed by default
    var toggle = $("llmToggle");
    var body = $("llmBody");
    if (toggle && body) {
      body.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", function () {
        var open = body.hidden;
        body.hidden = !open;
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        var chev = toggle.querySelector(".collapse-chevron");
        if (chev) chev.textContent = open ? "▾" : "▸";
        toggle.classList.toggle("open", open);
      });
    }

    if ($("setTheme")) $("setTheme").onchange = function () {
      var t = this.value;
      if (t === "dark") t = "midnight";
      if (t === "light") t = "clearspace";
      localStorage.setItem("ad_theme", t);
      document.documentElement.setAttribute("data-theme", t);
    };
    if ($("setLang")) $("setLang").onchange = function () {
      localStorage.setItem("ad_lang", this.value);
      applyLang(this.value);
    };
    if ($("setLevel")) $("setLevel").onchange = function () {
      localStorage.setItem("ad_default_level", this.value);
    };
    if ($("saveLlm")) $("saveLlm").onclick = function () {
      if (typeof ADLLM === "undefined") return;
      ADLLM.configure({
        provider: $("setProvider").value,
        endpoint: ($("setEndpoint").value || "").trim(),
        model: ($("setModel").value || "").trim(),
        apiKey: $("setApiKey").value,
        persistKey: true
      });
      var msg = $("llmSaveMsg");
      if (msg) {
        msg.hidden = false;
        msg.textContent = typeof ADi18n !== "undefined" ? ADi18n.t("settingsLlmSaved") : "Saved.";
      }
    };
    if ($("clearChatMem")) $("clearChatMem").onclick = function () {
      if (typeof ADLLM !== "undefined") ADLLM.clearHistory("default");
      alert(typeof ADi18n !== "undefined" ? ADi18n.t("conversationCleared") : "Cleared.");
    };
    if ($("clearFindings")) $("clearFindings").onclick = function () {
      var pk = localStorage.getItem("ad_last_project_key");
      if (pk && typeof ADResultsStore !== "undefined" && ADResultsStore.clearProject) {
        ADResultsStore.clearProject(pk).then(function () {
          alert(pk);
        });
      }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
