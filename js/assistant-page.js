(function () {
  function $(id) { return document.getElementById(id); }
  function append(role, text, meta) {
    var box = $("chatMessages");
    if (!box) return;
    var empty = $("chatEmpty");
    if (empty) empty.hidden = true;
    var div = document.createElement("div");
    div.className = "chat-bubble " + role;
    div.textContent = text;
    if (meta) {
      var m = document.createElement("div");
      m.className = "chat-meta";
      m.textContent = meta;
      div.appendChild(document.createElement("br"));
      div.appendChild(m);
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
  async function loadFindings() {
    if (typeof ADResultsStore === "undefined") return [];
    try {
      // load all keys is hard without listing; use last project key from localStorage
      var pk = localStorage.getItem("ad_last_project_key") || "default";
      return await ADResultsStore.loadFindings(pk);
    } catch (e) { return []; }
  }
  async function send(preset) {
    var input = $("chatInput");
    var msg = preset || (input && input.value.trim());
    if (!msg) return;
    if (input && !preset) input.value = "";
    append("user", msg);
    var findings = await loadFindings();
    var state = {
      projectKey: localStorage.getItem("ad_last_project_key") || "default",
      findings: findings,
      findingsCount: findings.length,
      category: localStorage.getItem("ad_last_category") || "Test All",
      level: parseInt(localStorage.getItem("ad_last_level") || "1", 10),
      fileNames: []
    };
    if (typeof ADLLM === "undefined") {
      append("assistant", "LLM module missing.");
      return;
    }
    try {
      var res = await ADLLM.chat(msg, state);
      append("assistant", res.reply, "source: " + (res.source || "local"));
    } catch (e) {
      append("assistant", String(e && e.message || e));
    }
  }
  function init() {
    var st = $("llmStatus");
    if (st && typeof ADLLM !== "undefined") {
      st.textContent = ADLLM.isProviderReady() ? "Provider connected" : "Local evidence mode";
    }
    if ($("chatSend")) $("chatSend").onclick = function () { send(); };
    if ($("chatInput")) $("chatInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    if ($("chatClear")) $("chatClear").onclick = function () {
      if (typeof ADLLM !== "undefined") ADLLM.clearHistory(localStorage.getItem("ad_last_project_key") || "default");
      var box = $("chatMessages");
      if (box) {
        box.innerHTML = "";
        var empty = document.createElement("div");
        empty.id = "chatEmpty";
        empty.className = "chat-empty";
        empty.textContent = "Conversation cleared.";
        box.appendChild(empty);
      }
    };
    if ($("chatSummarize")) $("chatSummarize").onclick = function () { send("Summarize the current findings by severity and confidence."); };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
