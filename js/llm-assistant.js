/**
 * Auto Debugger V10.1.0 — LLM Assistant
 * Evidence-only. Never invents bugs.
 * Optimizations: compact context, response cache, AbortController, lean prompts.
 */
(function (global) {
  "use strict";

  var config = {
    provider: "none",
    endpoint: "",
    model: "",
    apiKey: "",
    headers: null
  };

  var responseCache = Object.create(null);
  var CACHE_MAX = 48;
  var CACHE_TTL_MS = 5 * 60 * 1000;
  var cacheKeys = [];
  var activeAbort = null;

  function loadConfig() {
    try {
      var raw = localStorage.getItem("ad_llm_config");
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o.provider) config.provider = o.provider;
      if (o.endpoint) config.endpoint = o.endpoint;
      if (o.model) config.model = o.model;
      if (o.headers && typeof o.headers === "object") config.headers = o.headers;
      var k = localStorage.getItem("ad_llm_key");
      if (k) config.apiKey = k;
    } catch (e) {}
  }

  function isProviderReady() {
    loadConfig();
    return !!(config.endpoint && config.provider && config.provider !== "none");
  }

  function loadHistory(projectKey) {
    try {
      var raw = localStorage.getItem("ad_chat_" + (projectKey || "default"));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveHistory(projectKey, turns) {
    try {
      var slim = (turns || []).slice(-20).map(function (t) {
        return { role: t.role, text: String(t.text || "").slice(0, 2000) };
      });
      localStorage.setItem("ad_chat_" + (projectKey || "default"), JSON.stringify(slim));
    } catch (e) {}
  }

  function clearHistory(projectKey) {
    try { localStorage.removeItem("ad_chat_" + (projectKey || "default")); } catch (e) {}
  }

  function compactFinding(f, i) {
    if (!f) return null;
    var conf = f.confidence;
    if (conf > 1) conf = conf / 100;
    return {
      i: i + 1,
      id: f.problem_id || f.id || ("F" + (i + 1)),
      sev: f.severity || "?",
      st: f.status || "",
      conf: conf != null ? Math.round(conf * 100) / 100 : null,
      cat: f.category || "",
      file: f.file_name || f.file || "",
      line: f.line || 0,
      sym: String(f.symptom || f.description || "").slice(0, 120),
      rc: String(f.root_cause || f.rootCause || "").slice(0, 100),
      ready: f._ci_prompt_ready === true,
      heur: f._ci_heuristic === true || f.heuristicOnly === true
    };
  }

  function buildContext(appState) {
    appState = appState || {};
    var findings = appState.findings || appState.problems || [];
    var sorted = findings.slice().sort(function (a, b) {
      var ca = (a.confidence > 1 ? a.confidence / 100 : a.confidence) || 0;
      var cb = (b.confidence > 1 ? b.confidence / 100 : b.confidence) || 0;
      if (a._ci_prompt_ready && !b._ci_prompt_ready) return -1;
      if (!a._ci_prompt_ready && b._ci_prompt_ready) return 1;
      return cb - ca;
    });
    var compact = sorted.slice(0, 10).map(compactFinding).filter(Boolean);
    var focus = appState.focusFinding ? compactFinding(appState.focusFinding, 0) : null;
    return {
      findingsCount: findings.length,
      selectedCategory: appState.category || appState.selectedCategory || "",
      level: appState.level || "",
      findings: compact,
      focusFinding: focus,
      ci: appState.centralIntelligence
        ? { actionable: appState.centralIntelligence.actionableCount, suppressed: appState.centralIntelligence.suppressed }
        : null
    };
  }

  function detectIntent(message) {
    var m = String(message || "").toLowerCase();
    if (/خلاصه|summary|summarize|overview/.test(m)) return { intent: "summarize" };
    if (/چرا|why|root.?cause|علت/.test(m)) return { intent: "explain_why" };
    if (/اطمینان|confidence|چقدر مطمئن/.test(m)) return { intent: "explain_confidence" };
    if (/finding|یافته|مورد\s*\d+|issue\s*#?\d+/i.test(m)) return { intent: "explain_finding" };
    if (/fix|اصلاح|چطور درست|how to fix|repair/.test(m)) return { intent: "fix_hint" };
    if (/امنیت|security|xss|injection/.test(m)) return { intent: "security" };
    if (/top|مهم|critical|خطرناک/.test(m)) return { intent: "top" };
    return { intent: "general" };
  }

  function cacheKey(intent, context, message) {
    var ids = (context.findings || []).map(function (f) { return f.id + ":" + f.st + ":" + f.conf; }).join(",");
    return intent + "|" + ids + "|" + String(message || "").slice(0, 80);
  }

  function cacheGet(key) {
    var e = responseCache[key];
    if (!e) return null;
    if (Date.now() - e.ts > CACHE_TTL_MS) { delete responseCache[key]; return null; }
    return e.text;
  }

  function cacheSet(key, text) {
    if (cacheKeys.length >= CACHE_MAX) {
      var old = cacheKeys.shift();
      delete responseCache[old];
    }
    if (!responseCache[key]) cacheKeys.push(key);
    responseCache[key] = { text: text, ts: Date.now() };
  }

  function localRespond(message, context, history) {
    var intent = detectIntent(message);
    var findings = context.findings || [];
    var lines = [];
    var langFa = /[\u0600-\u06FF]/.test(message || "");

    if (intent.intent === "top") {
      if (!findings.length) {
        return { text: langFa ? "یافته‌ای در Context نیست. ابتدا تحلیل را اجرا کنید." : "No findings in context. Run analysis first.", intent: intent, source: "local" };
      }
      var top = findings[0];
      if (langFa) {
        lines.push("مهم‌ترین یافته (از موتور، نه حدس LLM):");
        lines.push("۱) [" + top.sev + " | " + Math.round((top.conf || 0) * 100) + "% | " + top.st + "] " + top.sym);
        lines.push("   فایل: " + top.file + ":" + top.line);
        if (top.rc) lines.push("   Root cause: " + top.rc);
        if (top.heur) lines.push("   ⚠ heuristic — قطعی نیست.");
        if (findings[1]) lines.push("۲) " + findings[1].sym + " (" + findings[1].sev + ")");
        lines.push("\nمنبع: Static Analysis — LLM Opinion ≠ Bug Evidence");
      } else {
        lines.push("Top finding (engine evidence only):");
        lines.push("1) [" + top.sev + " | " + Math.round((top.conf || 0) * 100) + "% | " + top.st + "] " + top.sym);
        lines.push("   at " + top.file + ":" + top.line);
        if (top.rc) lines.push("   Root cause: " + top.rc);
        if (top.heur) lines.push("   ⚠ heuristic — not confirmed.");
        lines.push("\nSource: Static Analysis — LLM Opinion ≠ Bug Evidence");
      }
      return { text: lines.join("\n"), intent: intent, source: "local", focusId: top.id };
    }

    if (intent.intent === "summarize") {
      if (!findings.length) {
        return { text: langFa ? "نتیجه‌ای برای خلاصه نیست." : "Nothing to summarize.", intent: intent, source: "local" };
      }
      var bySev = {};
      findings.forEach(function (f) { bySev[f.sev] = (bySev[f.sev] || 0) + 1; });
      lines.push(langFa ? "خلاصه Findings (موتور):" : "Findings summary (engine):");
      lines.push((langFa ? "تعداد کل: " : "Total: ") + context.findingsCount + " | " + (langFa ? "دسته: " : "Category: ") + (context.selectedCategory || "—"));
      if (context.ci) {
        lines.push("Actionable: " + (context.ci.actionable || 0) + " | suppressed: " + (context.ci.suppressed || 0));
      }
      Object.keys(bySev).forEach(function (k) { lines.push("• " + k + ": " + bySev[k]); });
      findings.slice(0, 5).forEach(function (f, i) {
        lines.push((i + 1) + ". [" + f.sev + "] " + f.sym + " @" + f.file + ":" + f.line + (f.ready ? " ✓prompt-ready" : "") + (f.heur ? " ~heuristic" : ""));
      });
      return { text: lines.join("\n"), intent: intent, source: "local" };
    }

    if (intent.intent === "explain_why" || intent.intent === "explain_finding" || intent.intent === "explain_confidence") {
      var focus = context.focusFinding || findings[0];
      if (!focus) {
        return { text: langFa ? "Finding مشخصی در Context نیست." : "No finding in context.", intent: intent, source: "local" };
      }
      lines.push(langFa ? "توضیح بر اساس Evidence موتور:" : "Explanation from engine evidence:");
      lines.push("• Symptom: " + (focus.sym || ""));
      lines.push("• Root cause: " + (focus.rc || (langFa ? "ثبت نشده (INCONCLUSIVE)" : "not recorded (INCONCLUSIVE)")));
      lines.push("• Severity: " + focus.sev + " | Confidence: " + Math.round((focus.conf || 0) * 100) + "% | Status: " + focus.st);
      lines.push("• Location: " + focus.file + ":" + focus.line);
      if (focus.heur) {
        lines.push(langFa ? "\n⚠ این مورد heuristic است — قطعی نیست." : "\n⚠ Heuristic finding — not confirmed.");
      }
      if ((focus.conf || 0) < 0.5) {
        lines.push(langFa ? "\nNOT ENOUGH EVIDENCE برای قطعی دانستن." : "\nNOT ENOUGH EVIDENCE to treat as confirmed.");
      }
      lines.push("\nLLM Opinion ≠ Bug Evidence");
      return { text: lines.join("\n"), intent: intent, source: "local" };
    }

    if (intent.intent === "fix_hint") {
      var f2 = context.focusFinding || findings.filter(function (x) { return x.ready; })[0] || findings[0];
      if (!f2) {
        return { text: langFa ? "Finding برای راهنمای Fix نیست." : "No finding for fix guidance.", intent: intent, source: "local" };
      }
      if (f2.heur || !f2.ready) {
        return {
          text: langFa
            ? "این Finding برای Fix آماده نیست (heuristic یا evidence ضعیف)."
            : "This finding is not prompt-ready (heuristic or weak evidence).",
          intent: intent,
          source: "local"
        };
      }
      lines.push(langFa ? "راهنمای کلی (root cause موتور):" : "Guidance (engine root cause):");
      lines.push("• " + (f2.rc || f2.sym));
      lines.push("• File: " + f2.file + ":" + f2.line);
      lines.push(langFa ? "جزئیات را از Final Prompt بگیرید." : "Use the Evidence-Driven Final Prompt for full brief.");
      return { text: lines.join("\n"), intent: intent, source: "local" };
    }

    if (!findings.length) {
      return {
        text: langFa ? "Context خالی است. تحلیل را اجرا کنید." : "Empty context. Run analysis first.",
        intent: intent,
        source: "local"
      };
    }
    lines.push(langFa
      ? "می‌توانم خلاصه، توضیح Finding یا علت ریشه‌ای را از Evidence بگویم."
      : "I can summarize or explain findings from engine evidence.");
    lines.push((langFa ? "یافته‌ها: " : "Findings: ") + context.findingsCount);
    return { text: lines.join("\n"), intent: intent, source: "local" };
  }

  async function remoteRespond(message, context, history) {
    if (activeAbort) {
      try { activeAbort.abort(); } catch (e) {}
    }
    activeAbort = typeof AbortController !== "undefined" ? new AbortController() : null;

    var system = [
      "Auto Debugger V10.1.0 Assistant. STATIC ANALYSIS only.",
      "NEVER invent bugs. Missing evidence → INCONCLUSIVE.",
      "POSSIBLE/heuristic ≠ CONFIRMED. LLM Opinion ≠ Bug Evidence.",
      "User language. Concise.",
      "Findings:" + JSON.stringify(context.findings || []),
      "Focus:" + JSON.stringify(context.focusFinding || null),
      "CI:" + JSON.stringify(context.ci || null)
    ].join("\n");

    var messages = [{ role: "system", content: system }];
    (history || []).slice(-6).forEach(function (t) {
      messages.push({ role: t.role === "assistant" ? "assistant" : "user", content: String(t.text || "").slice(0, 1500) });
    });
    messages.push({ role: "user", content: String(message || "").slice(0, 2000) });

    var headers = { "Content-Type": "application/json" };
    if (config.apiKey) headers["Authorization"] = "Bearer " + config.apiKey;
    if (config.headers) {
      Object.keys(config.headers).forEach(function (k) { headers[k] = config.headers[k]; });
    }

    var body = {
      model: config.model || "gpt-4o-mini",
      messages: messages,
      temperature: 0.15,
      max_tokens: 800
    };

    try {
      var res = await fetch(config.endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
        signal: activeAbort ? activeAbort.signal : undefined
      });
      if (!res.ok) {
        var errText = await res.text();
        var local = localRespond(message, context, history);
        return {
          text: "LLM provider error (" + res.status + "). Local mode:\n" + local.text,
          intent: detectIntent(message),
          source: "fallback",
          error: errText.slice(0, 160)
        };
      }
      var data = await res.json();
      var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
        || data.content || data.output_text || JSON.stringify(data).slice(0, 400);
      if (/CONFIRMED_BUG|I found a new bug|باگ جدید پیدا کردم/i.test(content) && !(context.findings && context.findings.length)) {
        content += "\n\n[Validator] No engine findings — treat new bug claims as INCONCLUSIVE.";
      }
      return { text: content, intent: detectIntent(message), source: "provider" };
    } catch (e) {
      if (e && e.name === "AbortError") {
        return { text: "Request cancelled.", intent: detectIntent(message), source: "aborted" };
      }
      var local2 = localRespond(message, context, history);
      local2.text = "Provider unreachable. Local mode:\n" + local2.text;
      local2.source = "fallback";
      local2.error = String(e && e.message || e);
      return local2;
    } finally {
      activeAbort = null;
    }
  }

  function runInternalTool(name, args, appState) {
    var findings = (appState && (appState.findings || appState.problems)) || [];
    if (name === "get_finding") {
      var id = args && args.id;
      var f = id
        ? findings.filter(function (x) { return (x.problem_id || x.id) === id; })[0]
        : findings[0];
      return { ok: !!f, data: f ? compactFinding(f, 0) : null };
    }
    if (name === "list_findings") {
      return { ok: true, data: findings.slice(0, 15).map(compactFinding) };
    }
    return { ok: false, error: "unknown_tool" };
  }

  async function chat(message, appState) {
    loadConfig();
    var context = buildContext(appState);
    var intent = detectIntent(message);
    var key = cacheKey(intent.intent, context, message);
    var cached = cacheGet(key);
    if (cached) {
      return { text: cached, intent: intent, source: "cache" };
    }

    var history = loadHistory(appState && appState.projectKey);
    var result;
    if (isProviderReady()) {
      result = await remoteRespond(message, context, history);
    } else {
      result = localRespond(message, context, history);
    }

    if (result && result.text && result.source !== "aborted") {
      cacheSet(key, result.text);
      history.push({ role: "user", text: message });
      history.push({ role: "assistant", text: result.text });
      saveHistory(appState && appState.projectKey, history);
    }
    return result;
  }

  function abort() {
    if (activeAbort) {
      try { activeAbort.abort(); } catch (e) {}
      activeAbort = null;
    }
  }

  global.ADLLM = {
    version: "V10.1.0",
    loadConfig: loadConfig,
    isProviderReady: isProviderReady,
    detectIntent: detectIntent,
    chat: chat,
    localRespond: localRespond,
    runInternalTool: runInternalTool,
    loadHistory: loadHistory,
    clearHistory: clearHistory,
    abort: abort,
    getConfig: function () {
      return { provider: config.provider, endpoint: config.endpoint, model: config.model, hasKey: !!config.apiKey };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
