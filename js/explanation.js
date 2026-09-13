/**
 * Conversational Explanation Layer — evidence-based only.
 * Does not invent bugs; rewrites known finding fields into natural language.
 */
(function (global) {
  "use strict";

  function lang() {
    if (typeof ADi18n !== "undefined" && ADi18n.getLang) return ADi18n.getLang();
    try { return localStorage.getItem("ad_lang") || "en"; } catch (e) { return "en"; }
  }

  function isFa() { return lang() === "fa"; }

  function clean(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function loc(f) {
    var file = f.file_name || f.file || "";
    var line = f.line ? (isFa() ? ("خط " + f.line) : ("line " + f.line)) : "";
    if (file && line) return isFa() ? (file + "، " + line) : (file + ", " + line);
    return file || line || (isFa() ? "محل نامشخص" : "unknown location");
  }

  function buildConversational(finding) {
    finding = finding || {};
    var cat = (finding.category || "").toLowerCase();
    var desc = clean(finding.description || finding.symptom || "");
    var root = clean(finding.root_cause || "");
    var why = clean(finding.why_it_matters || finding.impact || "");
    var fix = clean(finding.recommendation || finding.fix || "");
    var evidence = finding.evidence;
    if (Array.isArray(evidence)) {
      evidence = evidence.map(function (e) {
        if (!e) return "";
        if (typeof e === "string") return e;
        return clean(e.explanation || e.snippet || e.type || "");
      }).filter(Boolean).join("; ");
    } else {
      evidence = clean(evidence || finding.detected_behavior || "");
    }

    var title = clean(finding.simple_title || desc).slice(0, 120) || (isFa() ? "مورد بررسی" : "Issue found");
    var body = [];

    if (isFa()) {
      body.push("در «" + loc(finding) + "» چیزی دیده شد که بهتر است بررسی شود.");
      if (desc) body.push("چه اتفاقی افتاده: " + desc);
      if (why) body.push("چرا مهم است: " + why);
      else if (/xss|innerhtml|eval|sink/i.test(desc + cat)) {
        body.push("چرا مهم است: اگر داده از ورودی کاربر بیاید، ممکن است محتوای ناخواسته وارد صفحه شود.");
      } else if (/div|zero|nan|infinity|math/i.test(desc + cat)) {
        body.push("چرا مهم است: نتیجهٔ عددی ممکن است نامعتبر شود و بقیهٔ محاسبات را خراب کند.");
      } else if (/storage|json\.parse|localstorage/i.test(desc + cat)) {
        body.push("چرا مهم است: دادهٔ ذخیره‌شده ممکن است هنگام خواندن از بین برود یا خطا بدهد.");
      }
      if (root && root !== desc) body.push("علت ریشه‌ای (بر اساس شواهد): " + root);
      if (evidence) body.push("شواهد: " + evidence.slice(0, 280));
      if (fix) body.push("پیشنهاد عملی: " + fix);
      else body.push("پیشنهاد: محل ذکرشده را بازبینی کنید و قبل از استفاده از داده، اعتبار آن را بسنجید.");
    } else {
      body.push("Something at " + loc(finding) + " is worth a closer look.");
      if (desc) body.push("What happened: " + desc);
      if (why) body.push("Why it matters: " + why);
      else if (/xss|innerhtml|eval|sink/i.test(desc + cat)) {
        body.push("Why it matters: if this value comes from user input, unexpected content could appear on the page.");
      } else if (/div|zero|nan|infinity|math/i.test(desc + cat)) {
        body.push("Why it matters: the number can become invalid and break later calculations.");
      } else if (/storage|json\.parse|localstorage/i.test(desc + cat)) {
        body.push("Why it matters: saved data may fail to load or throw when read back.");
      }
      if (root && root !== desc) body.push("Root cause (from evidence): " + root);
      if (evidence) body.push("Evidence: " + evidence.slice(0, 280));
      if (fix) body.push("What to do: " + fix);
      else body.push("What to do: review this spot and validate data before using it.");
    }

    return {
      title: title,
      conversational: body.join("\n"),
      impact: why || "",
      evidence: evidence || "",
      rootCause: root || "",
      recommendation: fix || ""
    };
  }

  function enrichFinding(finding) {
    var exp = buildConversational(finding);
    finding.conversational = exp.conversational;
    finding.simple_title = finding.simple_title || exp.title;
    if (!finding.symptom && finding.description) finding.symptom = finding.description;
    return finding;
  }

  global.ADExplain = {
    buildConversational: buildConversational,
    enrichFinding: enrichFinding
  };
})(typeof window !== "undefined" ? window : globalThis);
