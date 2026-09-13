/**
 * Auto Debugger — Modular Conversational LLM Assistant
 * LLM is NOT the source of truth. Evidence from engines only.
 * Provider-agnostic adapter. Works offline without provider.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "ad_llm_conversations_v1";
  var MAX_TURNS = 40;
  var MAX_CONTEXT_FINDINGS = 12;

  // ─── Provider Adapter interface ───
  // configure({ provider, endpoint, apiKey, model, headers })
  var config = {
    provider: "none", // none | openai-compatible | custom
    endpoint: "",
    apiKey: "",
    model: "",
    headers: null
  };

  function configure(opts) {
    opts = opts || {};
    if (opts.provider != null) config.provider = opts.provider;
    if (opts.endpoint != null) config.endpoint = opts.endpoint;
    if (opts.apiKey != null) config.apiKey = opts.apiKey;
    if (opts.model != null) config.model = opts.model;
    if (opts.headers != null) config.headers = opts.headers;
    try {
      localStorage.setItem("ad_llm_config", JSON.stringify({
        provider: config.provider,
        endpoint: config.endpoint,
        model: config.model
        // never persist apiKey by default into plain localStorage in cleartext if empty skip
      }));
      if (opts.persistKey && opts.apiKey) {
        sessionStorage.setItem("ad_llm_key", opts.apiKey);
      }
    } catch (e) {}
  }

  function loadConfig() {
    try {
      var raw = localStorage.getItem("ad_llm_config");
      if (raw) {
        var o = JSON.parse(raw);
        config.provider = o.provider || config.provider;
        config.endpoint = o.endpoint || "";
        config.model = o.model || "";
      }
      var k = sessionStorage.getItem("ad_llm_key");
      if (k) config.apiKey = k;
    } catch (e) {}
  }
  loadConfig();

  function isProviderReady() {
    return config.provider && config.provider !== "none" && !!config.endpoint;
  }

  // ─── Conversation memory ───
  function loadHistory(projectKey) {
    try {
      var all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return all[projectKey || "default"] || [];
    } catch (e) { return []; }
  }

  function saveHistory(projectKey, turns) {
    try {
      var all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      all[projectKey || "default"] = (turns || []).slice(-MAX_TURNS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  function clearHistory(projectKey) {
    try {
      var all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      delete all[projectKey || "default"];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  // ─── Context Builder (targeted, not full project) ───
  function buildContext(appState) {
    appState = appState || {};
    var findings = (appState.findings || []).slice(0, MAX_CONTEXT_FINDINGS);
    var summary = findings.map(function (f, i) {
      return {
        index: i + 1,
        id: f.problem_id || f.stable_id || ("F" + (i + 1)),
        classification: f.classification || "",
        status: f.status || "",
        severity: f.severity || "",
        confidence: f.confidence || 0,
        file: f.file_name || "",
        line: f.line || 0,
        symptom: (f.symptom || f.description || "").slice(0, 160),
        rootCause: (f.root_cause || f.rootCause || "").slice(0, 160),
        evidence: (typeof f.evidence === "string" ? f.evidence : "").slice(0, 120),
        category: f.category || ""
      };
    });
    return {
      projectKey: appState.projectKey || "default",
      fileCount: appState.fileCount || 0,
      fileNames: (appState.fileNames || []).slice(0, 30),
      selectedCategory: appState.category || "Test All",
      analysisLevel: appState.level || 1,
      findingsCount: (appState.findings || []).length,
      findings: summary,
      focusFinding: appState.focusFinding || null,
      languages: appState.languages || {},
      note: "Source of truth is static analysis evidence. LLM must not invent bugs."
    };
  }

  // ─── Intent detection (local, no LLM required) ───
  function detectIntent(message) {
    var m = (message || "").toLowerCase();
    if (/امنیت|security|xss|injection|فقط.*امن/.test(m)) return { intent: "run_security", category: "Security" };
    if (/ui\b|رابط|ظاهر/.test(m) && /بررسی|تحلیل|analyze|check/.test(m)) return { intent: "run_category", category: "UI" };
    if (/performance|عملکرد|سرعت/.test(m)) return { intent: "run_category", category: "Performance" };
    if (/مهم.?ترین|most important|priority|اولویت/.test(m)) return { intent: "prioritize" };
    if (/چرا|why|علت|root.?cause|چطور/.test(m)) return { intent: "explain_why" };
    if (/خلاصه|summary|summarize|جمع.?بندی/.test(m)) return { intent: "summarize" };
    if (/confidence|اطمینان|severity|شدت/.test(m)) return { intent: "explain_confidence" };
    if (/finding\s*#?(\d+)|مشکل\s*(\d+)|#([A-Z0-9-]+)/i.test(message || "")) return { intent: "explain_finding" };
    if (/تحلیل|analyze|run analysis|شروع/.test(m)) return { intent: "suggest_analysis" };
    return { intent: "chat" };
  }

  // ─── Local evidence-based responder (always available) ───
  function localRespond(message, context, history) {
    var intent = detectIntent(message);
    var findings = context.findings || [];
    var lines = [];

    if (intent.intent === "run_security" || intent.intent === "run_category") {
      lines.push("برای بررسی «" + (intent.category || "Security") + "» باید همان Category را در پنل تحلیل انتخاب کنید و Analysis را دوباره اجرا کنید.");
      lines.push("من فقط روی Evidence موجود توضیح می‌دهم؛ خودم Finding جعلی نمی‌سازم.");
      lines.push("Suggested action: set category → " + (intent.category || "Security") + " → Start Analysis.");
      return { text: lines.join("\n"), intent: intent, source: "local", suggestedCategory: intent.category };
    }

    if (intent.intent === "prioritize") {
      if (!findings.length) {
        return { text: "هنوز Findingای ثبت نشده. ابتدا پروژه را تحلیل کنید.", intent: intent, source: "local" };
      }
      var sorted = findings.slice().sort(function (a, b) {
        var sev = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
        var sa = sev[a.severity] || 0, sb = sev[b.severity] || 0;
        if (sb !== sa) return sb - sa;
        return (b.confidence || 0) - (a.confidence || 0);
      });
      var top = sorted[0];
      lines.push("بر اساس Severity + Confidence موجود:");
      lines.push("۱) [" + top.severity + " / conf " + Math.round((top.confidence || 0) * 100) + "%] " + top.symptom);
      lines.push("   فایل: " + top.file + ":" + top.line);
      if (top.rootCause) lines.push("   Root cause (از موتور): " + top.rootCause);
      if (sorted[1]) lines.push("۲) " + sorted[1].symptom + " (" + sorted[1].severity + ")");
      lines.push("\nمنبع: نتایج Static Analysis — نه نظر مستقل LLM.");
      return { text: lines.join("\n"), intent: intent, source: "local", focusId: top.id };
    }

    if (intent.intent === "summarize") {
      if (!findings.length) return { text: "نتیجه‌ای برای خلاصه وجود ندارد.", intent: intent, source: "local" };
      var bySev = {};
      findings.forEach(function (f) { bySev[f.severity] = (bySev[f.severity] || 0) + 1; });
      lines.push("خلاصه Findings (از موتور تحلیل):");
      lines.push("تعداد: " + context.findingsCount + " | Category انتخابی: " + context.selectedCategory);
      Object.keys(bySev).forEach(function (k) { lines.push("• " + k + ": " + bySev[k]); });
      lines.push("Top issues:");
      findings.slice(0, 5).forEach(function (f, i) {
        lines.push((i + 1) + ". [" + f.severity + "] " + f.symptom + " @" + f.file + ":" + f.line);
      });
      return { text: lines.join("\n"), intent: intent, source: "local" };
    }

    if (intent.intent === "explain_why" || intent.intent === "explain_finding" || intent.intent === "explain_confidence") {
      var focus = context.focusFinding;
      if (!focus && findings.length) focus = findings[0];
      if (!focus) {
        return { text: "Finding مشخصی در Context نیست. یک Finding را از لیست انتخاب کنید یا تحلیل را اجرا کنید.", intent: intent, source: "local" };
      }
      lines.push("توضیح بر اساس Evidence موتور (نه حدس LLM):");
      lines.push("• Symptom: " + (focus.symptom || focus.description || ""));
      lines.push("• Root cause: " + (focus.rootCause || focus.root_cause || "INCONCLUSIVE — root cause در نتایج ثبت نشده"));
      lines.push("• Severity: " + (focus.severity || "?") + " | Confidence: " + Math.round((focus.confidence || 0) * 100) + "% | Status: " + (focus.status || ""));
      lines.push("• Location: " + (focus.file || focus.file_name || "") + ":" + (focus.line || ""));
      if (focus.evidence) lines.push("• Evidence: " + String(focus.evidence).slice(0, 200));
      if ((focus.confidence || 0) < 0.5) {
        lines.push("\nNOT ENOUGH EVIDENCE برای قطعی دانستن این مورد. Confidence پایین است.");
      }
      lines.push("\nLLM Opinion ≠ Bug Evidence");
      return { text: lines.join("\n"), intent: intent, source: "local" };
    }

    // generic help
    lines.push("دستیار تحلیل Auto Debugger (حالت محلی — Provider تنظیم نشده یا پاسخ محلی).");
    lines.push("می‌توانید بپرسید: خلاصه نتایج، مهم‌ترین مشکل، چرا این خطا، فقط امنیت.");
    lines.push("منبع حقیقت: AST / Data Flow / CFG / Evidence Graph — نه این چت.");
    if (findings.length) lines.push("Findings فعلی در Context: " + findings.length);
    else lines.push("هنوز تحلیلی در Context نیست.");
    return { text: lines.join("\n"), intent: intent, source: "local" };
  }

  // ─── Remote provider (openai-compatible optional) ───
  async function remoteRespond(message, context, history) {
    if (!isProviderReady()) return localRespond(message, context, history);

    var system = [
      "You are Auto Debugger Assistant. You explain STATIC ANALYSIS results only.",
      "NEVER invent bugs. If evidence is missing, say INCONCLUSIVE / NOT ENOUGH EVIDENCE.",
      "LLM Opinion ≠ Bug Evidence. Source of truth is engine findings JSON below.",
      "Respond in the user's language. Be concise.",
      "Context: " + JSON.stringify(context)
    ].join("\n");

    var messages = [{ role: "system", content: system }];
    (history || []).slice(-8).forEach(function (t) {
      messages.push({ role: t.role === "assistant" ? "assistant" : "user", content: t.text });
    });
    messages.push({ role: "user", content: message });

    var headers = { "Content-Type": "application/json" };
    if (config.apiKey) headers["Authorization"] = "Bearer " + config.apiKey;
    if (config.headers) {
      Object.keys(config.headers).forEach(function (k) { headers[k] = config.headers[k]; });
    }

    var body = {
      model: config.model || "gpt-4o-mini",
      messages: messages,
      temperature: 0.2
    };

    try {
      var res = await fetch(config.endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        var errText = await res.text();
        return {
          text: "LLM provider error (" + res.status + "). Falling back to local evidence mode.\n" + localRespond(message, context, history).text,
          intent: detectIntent(message),
          source: "fallback",
          error: errText.slice(0, 200)
        };
      }
      var data = await res.json();
      var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
        || data.content || data.output_text || JSON.stringify(data).slice(0, 500);
      // Response validator: reject obvious fabricated finding claims without evidence markers
      if (/CONFIRMED_BUG|I found a new bug|باگ جدید پیدا کردم/i.test(content) && !(context.findings && context.findings.length)) {
        content += "\n\n[Validator] No engine findings in context — treat any new bug claim as INCONCLUSIVE.";
      }
      return { text: content, intent: detectIntent(message), source: "provider" };
    } catch (e) {
      var local = localRespond(message, context, history);
      local.text = "Provider unreachable. Local mode:\n" + local.text;
      local.source = "fallback";
      local.error = String(e && e.message || e);
      return local;
    }
  }

  async function chat(message, appState) {
    var context = buildContext(appState);
    var history = loadHistory(context.projectKey);
    history.push({ role: "user", text: message, ts: Date.now() });
    var reply = isProviderReady()
      ? await remoteRespond(message, context, history)
      : localRespond(message, context, history);
    history.push({ role: "assistant", text: reply.text, ts: Date.now(), source: reply.source });
    saveHistory(context.projectKey, history);
    return {
      reply: reply.text,
      intent: reply.intent,
      source: reply.source,
      suggestedCategory: reply.suggestedCategory || null,
      focusId: reply.focusId || null,
      history: history
    };
  }

  global.ADLLM = {
    configure: configure,
    isProviderReady: isProviderReady,
    buildContext: buildContext,
    detectIntent: detectIntent,
    chat: chat,
    localRespond: localRespond,
    loadHistory: loadHistory,
    clearHistory: clearHistory,
    getConfig: function () { return { provider: config.provider, endpoint: config.endpoint, model: config.model, hasKey: !!config.apiKey }; }
  };
})(typeof window !== "undefined" ? window : globalThis);
