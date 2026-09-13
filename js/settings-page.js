(function () {
  function $(id) { return document.getElementById(id); }
  function init() {
    var theme = localStorage.getItem("ad_theme") || document.documentElement.getAttribute("data-theme") || "dark";
    var lang = localStorage.getItem("ad_lang") || "en";
    var level = localStorage.getItem("ad_default_level") || "1";
    if ($("setTheme")) $("setTheme").value = theme;
    if ($("setLang")) $("setLang").value = lang;
    if ($("setLevel")) $("setLevel").value = level;
    document.documentElement.setAttribute("data-theme", theme);
    if (typeof ADLLM !== "undefined") {
      var c = ADLLM.getConfig();
      if ($("setProvider")) $("setProvider").value = c.provider || "none";
      if ($("setEndpoint")) $("setEndpoint").value = c.endpoint || "";
      if ($("setModel")) $("setModel").value = c.model || "";
    }
    if ($("setTheme")) $("setTheme").onchange = function () {
      localStorage.setItem("ad_theme", this.value);
      document.documentElement.setAttribute("data-theme", this.value);
    };
    if ($("setLang")) $("setLang").onchange = function () {
      localStorage.setItem("ad_lang", this.value);
      if (typeof ADi18n !== "undefined" && ADi18n.setLang) ADi18n.setLang(this.value);
    };
    if ($("setLevel")) $("setLevel").onchange = function () {
      localStorage.setItem("ad_default_level", this.value);
    };
    if ($("saveLlm")) $("saveLlm").onclick = function () {
      if (typeof ADLLM === "undefined") return;
      ADLLM.configure({
        provider: $("setProvider").value,
        endpoint: $("setEndpoint").value.trim(),
        model: $("setModel").value.trim(),
        apiKey: $("setApiKey").value,
        persistKey: true
      });
      var msg = $("llmSaveMsg");
      if (msg) { msg.hidden = false; msg.textContent = "Saved. Key kept in sessionStorage only."; }
    };
    if ($("clearChatMem")) $("clearChatMem").onclick = function () {
      if (typeof ADLLM !== "undefined") ADLLM.clearHistory("default");
      alert("Conversation memory cleared.");
    };
    if ($("clearFindings")) $("clearFindings").onclick = function () {
      var pk = localStorage.getItem("ad_last_project_key");
      if (pk && typeof ADResultsStore !== "undefined" && ADResultsStore.clearProject) {
        ADResultsStore.clearProject(pk).then(function () { alert("Findings cleared for " + pk); });
      } else alert("No project key in this browser.");
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
