/**
 * Conversational Explanation Layer V8.05 — language-aware, evidence-bound.
 */
(function (global) {
  "use strict";

  function lang() {
    if (typeof ADi18n !== "undefined" && ADi18n.getLang) return ADi18n.getLang();
    try { return localStorage.getItem("ad_lang") || "en"; } catch (e) { return "en"; }
  }
  function isFa() { return lang() === "fa"; }
  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  function loc(f) {
    var file = f.file_name || f.file || "";
    var line = f.line ? (isFa() ? ("خط " + f.line) : ("line " + f.line)) : "";
    if (file && line) return isFa() ? (file + "، " + line) : (file + ", " + line);
    return file || line || (isFa() ? "محل نامشخص" : "unknown location");
  }

  function catKey(c) {
    c = (c || "").toLowerCase();
    if (c.indexOf("security") >= 0) return "security";
    if (c.indexOf("math") >= 0 || c.indexOf("calcul") >= 0) return "math";
    if (c.indexOf("storage") >= 0 || c.indexOf("database") >= 0) return "storage";
    if (c.indexOf("performance") >= 0) return "performance";
    if (c.indexOf("responsive") >= 0) return "responsive";
    if (c.indexOf("syntax") >= 0) return "syntax";
    if (c === "ui") return "ui";
    if (c === "ux") return "ux";
    return "generic";
  }

  function evidenceStr(finding) {
    var evidence = finding.evidence;
    if (Array.isArray(evidence)) {
      return evidence.map(function (e) {
        if (!e) return "";
        if (typeof e === "string") return e;
        return clean(e.explanation || e.snippet || e.type || "");
      }).filter(Boolean).join("; ");
    }
    return clean(evidence || finding.detected_behavior || "");
  }

  function buildConversational(finding) {
    finding = finding || {};
    var ck = catKey(finding.category);
    var desc = clean(finding.description || finding.symptom || "");
    var root = clean(finding.root_cause || "");
    var why = clean(finding.why_it_matters || finding.impact || "");
    var fix = clean(finding.recommendation || finding.fix || "");
    var evidence = evidenceStr(finding);
    var title = clean(finding.simple_title || desc).slice(0, 140) || (isFa() ? "مورد بررسی" : "Issue found");
    var body = [];
    var place = loc(finding);

    if (isFa()) {
      body.push("در «" + place + "» موردی پیدا شد که ارزش بررسی دارد.");
      if (ck === "security") {
        if (desc) body.push("چه اتفاقی افتاده: " + desc);
        body.push("چرا مهم است: " + (why || "اگر داده از ورودی کاربر بیاید و بدون پالایش وارد صفحه یا دستور شود، ممکن است محتوای ناخواسته یا خطرناک اجرا شود."));
        if (root) body.push("علت ریشه‌ای (بر اساس شواهد): " + root);
        if (evidence) body.push("شواهد مسیر داده: " + evidence.slice(0, 300));
      } else if (ck === "math") {
        if (desc) body.push("چه اتفاقی افتاده: " + desc);
        body.push("چرا مهم است: " + (why || "عدد نامعتبر یا فرمول نادرست می‌تواند بقیه محاسبات و نتیجه نهایی را خراب کند."));
        if (root) body.push("علت ریشه‌ای: " + root);
        if (evidence) body.push("شواهد محاسبه: " + evidence.slice(0, 300));
      } else if (ck === "storage") {
        if (desc) body.push("چه اتفاقی افتاده: " + desc);
        body.push("چرا مهم است: " + (why || "اگر ذخیره و خواندن داده هم‌خوان نباشند، بعد از رفرش یا بارگذاری مجدد اطلاعات از دست می‌رود یا خطا می‌دهد."));
        if (root) body.push("علت ریشه‌ای: " + root);
        if (evidence) body.push("شواهد ذخیره‌سازی: " + evidence.slice(0, 300));
      } else if (ck === "syntax") {
        if (desc) body.push("از نظر ساختاری: " + desc);
        body.push("چرا مهم است: " + (why || "خطای نحوی معمولاً مانع اجرا یا رفتار درست برنامه می‌شود."));
      } else if (ck === "performance") {
        if (desc) body.push("چه چیزی کند به نظر می‌رسد: " + desc);
        body.push("چرا مهم است: " + (why || "در صفحات شلوغ یا موبایل، این الگو می‌تواند تأخیر محسوس ایجاد کند."));
      } else {
        if (desc) body.push("چه اتفاقی افتاده: " + desc);
        if (why) body.push("چرا مهم است: " + why);
      }
      if (fix) body.push("پیشنهاد عملی: " + fix);
      else body.push("پیشنهاد: همین محل را بازبینی کنید و قبل از استفاده از داده، اعتبار و مسیر آن را چک کنید.");
      body.push("توجه: این توضیح فقط بر اساس شواهد موتور تحلیل است؛ حدس جداگانه اضافه نشده.");
    } else {
      body.push("At " + place + " something is worth reviewing.");
      if (ck === "security") {
        if (desc) body.push("What happened: " + desc);
        body.push("Why it matters: " + (why || "If user-controlled data reaches the page or an executable sink without checks, unwanted content may run."));
        if (root) body.push("Root cause (from evidence): " + root);
        if (evidence) body.push("Data-path evidence: " + evidence.slice(0, 300));
      } else if (ck === "math") {
        if (desc) body.push("What happened: " + desc);
        body.push("Why it matters: " + (why || "Invalid numbers or a wrong formula can corrupt later results."));
        if (root) body.push("Root cause: " + root);
        if (evidence) body.push("Calculation evidence: " + evidence.slice(0, 300));
      } else if (ck === "storage") {
        if (desc) body.push("What happened: " + desc);
        body.push("Why it matters: " + (why || "If save and load paths disagree, data can vanish after refresh or fail to parse."));
        if (root) body.push("Root cause: " + root);
        if (evidence) body.push("Storage evidence: " + evidence.slice(0, 300));
      } else if (ck === "syntax") {
        if (desc) body.push("Structural issue: " + desc);
        body.push("Why it matters: " + (why || "Syntax problems usually block correct execution."));
      } else if (ck === "performance") {
        if (desc) body.push("What looks expensive: " + desc);
        body.push("Why it matters: " + (why || "On busy pages or mobile this pattern can add visible delay."));
      } else {
        if (desc) body.push("What happened: " + desc);
        if (why) body.push("Why it matters: " + why);
      }
      if (fix) body.push("What to do: " + fix);
      else body.push("What to do: review this location and validate data before use.");
      body.push("Note: this text is generated only from analyzer evidence — nothing extra was invented.");
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
