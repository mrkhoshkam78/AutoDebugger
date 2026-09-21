/**
 * Final Prompt Generator — Auto Debugger V10.1.0
 * Evidence-Driven Prompt Engineering Engine.
 * Pipeline: Valid Findings → Group by Root Cause → Rank → Build Context → Adaptive Sections → Quality Check → Prompt
 * Language-aware (Persian / English). Max soft ceiling ~2000 lines; prefer short for simple cases.
 * Never invents bugs, evidence, or root causes.
 */
(function (global) {
  "use strict";

  var SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  var MAX_LINES = 2000;

  function lang() {
    if (typeof ADi18n !== "undefined" && ADi18n.getLang) return ADi18n.getLang();
    try { return localStorage.getItem("ad_lang") || "en"; } catch (e) { return "en"; }
  }
  function isFa() { return lang() === "fa"; }

  function isValidFinding(p, opts) {
    if (!p) return false;
    opts = opts || {};
    // Central Intelligence gates (V10.1.0)
    if (p._ci_suppress_prompt === true) return false;
    if (p._ci_suppressed === true) return false;
    if (p._ci_prompt_ready === false && opts.forceAll !== true) return false;
    if (p._ci_heuristic === true && (p.confidence || 0) < 0.8) return false;

    var cls = (p.classification || "").toUpperCase();
    var st = (p.status || "").toUpperCase();
    if (st === "NOT_APPLICABLE" || st === "SKIPPED" || st === "DO_NOT_REPORT") return false;
    var conf = p.confidence || 0;
    if (conf > 1) conf = conf / 100;

    var allowWeak = opts.includePossible === true;

    // Prefer explicit CI prompt-ready
    if (p._ci_prompt_ready === true && conf >= 0.55) return true;

    // Classification alone is not enough for security without readiness
    if (cls === "SECURITY_ISSUE" || cls === "CONFIRMED_SECURITY_ISSUE") {
      if (p._ci_has_dataflow === false || p._ci_heuristic === true) return allowWeak && conf >= 0.7;
      return conf >= 0.7;
    }
    if (cls === "CONFIRMED_BUG" || cls === "PERFORMANCE_ISSUE" || cls === "CONFIRMED_PERFORMANCE_ISSUE") {
      return conf >= 0.65 && st !== "POSSIBLE";
    }
    if (allowWeak && (cls === "POSSIBLE_ISSUE" || cls === "CODE_SMELL" || st === "INCONCLUSIVE" || st === "POSSIBLE")) {
      return conf >= 0.6;
    }
    if (!cls) {
      if (st === "POSSIBLE") return false;
      if (conf < 0.55) return false;
      return st === "CONFIRMED" || st === "LIKELY" || conf >= 0.75;
    }
    if (conf >= 0.8 && (st === "CONFIRMED" || st === "LIKELY")) return true;
    return false;
  }

  function sortFindings(list, meta) {
    return (list || []).slice().filter(function (p) { return isValidFinding(p, meta); }).sort(function (a, b) {
      var sa = SEV_ORDER[a.severity] != null ? SEV_ORDER[a.severity] : 9;
      var sb = SEV_ORDER[b.severity] != null ? SEV_ORDER[b.severity] : 9;
      if (sa !== sb) return sa - sb;
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }

  function rootKey(p) {
    var r = (p.root_cause || p.rootCause || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
    if (r) return r;
    return (p.category || "general") + "|" + (p.rule_id || p.simple && p.simple.id || "").slice(0, 40);
  }

  /** Group findings that share the same underlying root cause */
  function groupByRootCause(valid) {
    var map = Object.create(null);
    var order = [];
    valid.forEach(function (p) {
      var k = rootKey(p);
      if (!map[k]) {
        map[k] = { key: k, root: p.root_cause || p.rootCause || "", findings: [], severity: p.severity, confidence: p.confidence || 0 };
        order.push(k);
      }
      map[k].findings.push(p);
      var sev = SEV_ORDER[p.severity];
      if (sev != null && (SEV_ORDER[map[k].severity] == null || sev < SEV_ORDER[map[k].severity])) {
        map[k].severity = p.severity;
      }
      if ((p.confidence || 0) > map[k].confidence) map[k].confidence = p.confidence || 0;
    });
    return order.map(function (k) { return map[k]; });
  }

  function collectFiles(valid) {
    var files = {};
    valid.forEach(function (p) {
      var f = p.file_name || p.file;
      if (f) files[f] = 1;
    });
    return Object.keys(files);
  }

  function evidenceSummary(p) {
    var ev = p.evidence;
    if (Array.isArray(ev)) {
      return ev.slice(0, 5).map(function (e) {
        if (!e) return "";
        if (typeof e === "string") return e.slice(0, 100);
        var parts = [];
        if (e.type) parts.push(e.type);
        if (e.snippet) parts.push(String(e.snippet).slice(0, 70));
        if (e.explanation) parts.push(String(e.explanation).slice(0, 80));
        if (e.file) parts.push(e.file + (e.line ? ":" + e.line : ""));
        return parts.join(" · ");
      }).filter(Boolean).join(" | ");
    }
    return String(ev || p.detected_behavior || "").slice(0, 200);
  }

  function complexityScore(valid, groups, fileList) {
    var score = 0;
    score += Math.min(valid.length * 2, 30);
    score += Math.min(groups.length * 3, 20);
    score += Math.min(fileList.length * 2, 15);
    var hasSec = valid.some(function (p) { return /security/i.test(p.category || "") || /security/i.test(p.classification || ""); });
    var hasCross = fileList.length > 2;
    var hasFlow = valid.some(function (p) { return (p.flow && p.flow.length) || (p.evidence && Array.isArray(p.evidence) && p.evidence.some(function (e) { return e && e.type === "dataflow"; })); });
    if (hasSec) score += 15;
    if (hasCross) score += 10;
    if (hasFlow) score += 10;
    var highSev = valid.filter(function (p) { return p.severity === "critical" || p.severity === "high"; }).length;
    score += Math.min(highSev * 3, 15);
    return score;
  }

  function confPct(p) {
    var c = p.confidence;
    if (c == null) return "—";
    if (c <= 1) return Math.round(c * 100) + "%";
    return Math.round(c) + "%";
  }

  // ─── English builders ───────────────────────────────────────────
  function buildEn(valid, groups, fileList, meta, depth) {
    var lines = [];
    var cat = {};
    valid.forEach(function (p) { cat[p.category || "General"] = (cat[p.category || "General"] || 0) + 1; });

    lines.push("[ROLE]");
    lines.push("You are a Senior Full-Stack Developer fixing confirmed static-analysis findings in an existing project.");
    lines.push("Work from evidence only. Prefer the smallest safe change that resolves the root cause.");
    lines.push("");

    lines.push("[PROJECT CONTEXT]");
    lines.push("A local browser-only debugger (Auto Debugger V10.1.0) analyzed the project.");
    lines.push("Files involved: " + (fileList.join(", ") || "n/a"));
    if (meta.category) lines.push("Category focus: " + meta.category);
    if (meta.level) lines.push("Analysis level: " + meta.level);
    lines.push("Confirmed / high-confidence issues: " + valid.length);
    lines.push("Root-cause groups: " + groups.length);
    lines.push("By category: " + Object.keys(cat).map(function (k) { return k + "=" + cat[k]; }).join(", "));
    lines.push("");

    lines.push("[CURRENT BEHAVIOR]");
    lines.push("The application exhibits the confirmed issues listed below. Symptoms appear at the cited locations under the conditions implied by the evidence.");
    lines.push("");

    lines.push("[EXPECTED BEHAVIOR]");
    lines.push("After the fix, each confirmed issue should no longer reproduce under the same evidence conditions. Unrelated behavior must remain unchanged.");
    lines.push("");

    lines.push("[CONFIRMED ISSUES]");
    valid.forEach(function (p, i) {
      var loc = (p.file_name || p.file || "unknown") + (p.line ? " (line " + p.line + ")" : "");
      lines.push((i + 1) + ". [" + (p.severity || "medium").toUpperCase() + " | " + confPct(p) + " | " + (p.classification || p.status || "LIKELY") + "]");
      lines.push("   Symptom: " + (p.symptom || p.description || p.simple_title || "Issue"));
      lines.push("   Location: " + loc);
      if (p.category) lines.push("   Category: " + p.category);
      var ev = evidenceSummary(p);
      if (ev) lines.push("   Evidence: " + ev);
      if (p.flow && p.flow.length) lines.push("   Flow: " + p.flow.slice(0, 4).join(" → "));
      lines.push("   Root cause: " + (p.root_cause || p.rootCause || "—"));
      if (p.impact || p.why_it_matters || p.why_problematic) {
        lines.push("   Impact: " + (p.impact || p.why_it_matters || p.why_problematic));
      }
      if (p.recommendation || p.recommended_correction_area) {
        lines.push("   Suggested direction: " + (p.recommendation || p.recommended_correction_area));
      }
      lines.push("");
    });

    lines.push("[ROOT CAUSE ANALYSIS]");
    groups.forEach(function (g, i) {
      lines.push((i + 1) + ". Shared root: " + (g.root || g.key || "see findings"));
      lines.push("   Severity peak: " + (g.severity || "—") + " | findings in group: " + g.findings.length);
      g.findings.forEach(function (p) {
        lines.push("   - " + (p.file_name || p.file || "?") + (p.line ? ":" + p.line : "") + " — " + (p.symptom || p.description || "").slice(0, 90));
      });
      lines.push("");
    });

    lines.push("[IMPACT]");
    var hasCrit = valid.some(function (p) { return p.severity === "critical"; });
    var hasHigh = valid.some(function (p) { return p.severity === "high"; });
    if (hasCrit) lines.push("- Critical issues can break security, data integrity, or core execution paths.");
    if (hasHigh) lines.push("- High-severity issues can cause incorrect results, data loss, or user-visible failures.");
    lines.push("- Medium/low items should still be fixed when evidence is solid, without expanding scope.");
    lines.push("");

    lines.push("[RELATED FILES]");
    lines.push(fileList.length ? fileList.map(function (f) { return "- " + f; }).join("\n") : "- (derived from findings)");
    lines.push("Before changing any file, review its dependencies and callers.");
    lines.push("");

    if (depth >= 2) {
      lines.push("[DEPENDENCIES]");
      lines.push("Treat the listed files as entry points only. Confirm import/export and data-flow edges before editing.");
      lines.push("Shared modules that appear in multiple findings may need a single coordinated fix.");
      lines.push("");
    }

    lines.push("[OBJECTIVE]");
    lines.push("Resolve the confirmed root causes with the smallest safe set of changes. Do not invent additional bugs.");
    lines.push("");

    lines.push("[IMPLEMENTATION STRATEGY]");
    lines.push("1. Re-read the evidence for each root-cause group.");
    lines.push("2. Choose the minimal fix that addresses the underlying cause, not only the symptom.");
    lines.push("3. Prefer existing project patterns; do not introduce new frameworks or backends.");
    lines.push("4. If several valid approaches exist, pick the one that matches the codebase style and risks the least regression.");
    lines.push("");

    lines.push("[IMPLEMENTATION SCOPE]");
    lines.push("- Only files required to resolve the listed root causes: " + (fileList.join(", ") || "related files"));
    lines.push("- Public APIs, unrelated UI flows, and data formats stay unchanged unless a listed issue requires them.");
    lines.push("");

    lines.push("[NON-SCOPE]");
    lines.push("- Do not rewrite unrelated features.");
    lines.push("- Do not add servers, Docker, databases, or external services.");
    lines.push("- Do not weaken security controls or remove validation.");
    lines.push("- Do not expand the change set for style-only or speculative improvements.");
    lines.push("");

    lines.push("[CONSTRAINTS]");
    lines.push("- Minimal safe fix only.");
    lines.push("- Preserve offline / browser-only architecture if the project uses it.");
    lines.push("- If evidence is insufficient for a change, skip that item and document why.");
    lines.push("");

    if (valid.some(function (p) { return /security/i.test(p.category || "") || /security/i.test(p.classification || ""); })) {
      lines.push("[SECURITY REQUIREMENTS]");
      lines.push("- For each security finding: identify Source → Transform → Sink and ensure the path is closed or sanitized.");
      lines.push("- Do not leave user-controlled data reaching executable or HTML sinks without validation.");
      lines.push("");
    }

    if (valid.some(function (p) { return /math|calcul/i.test(p.category || ""); })) {
      lines.push("[MATH / CALCULATION REQUIREMENTS]");
      lines.push("- For calculation findings: state the formula, expected result (independent path), actual result, tolerance, and convention used.");
      lines.push("- Do not treat valid alternative financial conventions as bugs.");
      lines.push("");
    }

    if (valid.some(function (p) { return /storage|database/i.test(p.category || ""); })) {
      lines.push("[STORAGE / PERSISTENCE REQUIREMENTS]");
      lines.push("- Align write key, read key, serialization, and restore path. Guard JSON.parse and async persistence.");
      lines.push("- Verify state after refresh matches intended persistence.");
      lines.push("");
    }

    lines.push("[EDGE CASES]");
    lines.push("- Null / undefined / empty inputs, missing keys, corrupt storage, network failure (if relevant), and boundary numeric values.");
    lines.push("");

    lines.push("[VALIDATION REQUIREMENTS]");
    lines.push("- Reproduce each original issue (or the evidence path) before and after the fix.");
    lines.push("- Confirm the root cause is addressed, not only the surface symptom.");
    lines.push("- Keep syntax and module structure valid.");
    lines.push("");

    lines.push("[REGRESSION TESTS]");
    lines.push("- Re-run the same category analysis if possible.");
    lines.push("- Exercise upload → analysis → results → language/settings flows if those areas were touched.");
    lines.push("- For storage/math/security: verify the specific evidence path no longer fails.");
    lines.push("");

    if (depth >= 2) {
      lines.push("[REAL USER SIMULATION]");
      lines.push("- Open the affected UI or entry point.");
      lines.push("- Perform the user steps that previously exposed the symptom.");
      lines.push("- Refresh / re-open where persistence is involved.");
      lines.push("- Confirm the symptom is gone and no new errors appear.");
      lines.push("");
    }

    lines.push("[ACCEPTANCE CRITERIA]");
    lines.push("- Given the evidence conditions for each confirmed issue, when the user follows the related path, then the issue no longer occurs.");
    lines.push("- Unrelated features continue to work as before.");
    lines.push("");

    lines.push("[FINAL REPORT]");
    lines.push("List: files changed, issues fixed, issues skipped (with reason), residual risks, and any convention assumptions for math/finance.");

    return lines;
  }

  // ─── Persian builders (natural, professional) ───────────────────
  function buildFa(valid, groups, fileList, meta, depth) {
    var lines = [];
    var cat = {};
    valid.forEach(function (p) { cat[p.category || "عمومی"] = (cat[p.category || "عمومی"] || 0) + 1; });

    lines.push("[ROLE]");
    lines.push("تو یک Senior Full-Stack Developer هستی که باید یافته‌های تأییدشدهٔ تحلیل استاتیک را در پروژهٔ موجود اصلاح کنی.");
    lines.push("فقط بر اساس Evidence عمل کن. کمترین تغییر امنی را اعمال کن که Root Cause را واقعاً برطرف کند.");
    lines.push("");

    lines.push("[PROJECT CONTEXT]");
    lines.push("یک دیباگر محلی و مرورگرمحور (Auto Debugger V10.1.0) پروژه را تحلیل کرده است.");
    lines.push("فایل‌های درگیر: " + (fileList.join("، ") || "نامشخص"));
    if (meta.category) lines.push("تمرکز دسته: " + meta.category);
    if (meta.level) lines.push("سطح تحلیل: " + meta.level);
    lines.push("تعداد مسائل تأییدشده / با اطمینان بالا: " + valid.length);
    lines.push("گروه‌های Root Cause: " + groups.length);
    lines.push("بر اساس دسته: " + Object.keys(cat).map(function (k) { return k + "=" + cat[k]; }).join("، "));
    lines.push("");

    lines.push("[CURRENT BEHAVIOR]");
    lines.push("برنامه در حال حاضر مسائل تأییدشدهٔ زیر را نشان می‌دهد. علائم در محل‌های ذکرشده و تحت شرایطی که Evidence نشان می‌دهد ظاهر می‌شوند.");
    lines.push("");

    lines.push("[EXPECTED BEHAVIOR]");
    lines.push("پس از اصلاح، هر مسئلهٔ تأییدشده تحت همان شرایط Evidence دیگر نباید بازتولید شود. رفتارهای نامرتبط باید بدون تغییر باقی بمانند.");
    lines.push("");

    lines.push("[CONFIRMED ISSUES]");
    valid.forEach(function (p, i) {
      var loc = (p.file_name || p.file || "نامشخص") + (p.line ? " (خط " + p.line + ")" : "");
      lines.push((i + 1) + ". [" + (p.severity || "medium").toUpperCase() + " | " + confPct(p) + " | " + (p.classification || p.status || "LIKELY") + "]");
      lines.push("   علامت (Symptom): " + (p.symptom || p.description || p.simple_title || "مورد"));
      lines.push("   محل: " + loc);
      if (p.category) lines.push("   دسته: " + p.category);
      var ev = evidenceSummary(p);
      if (ev) lines.push("   شواهد: " + ev);
      if (p.flow && p.flow.length) lines.push("   مسیر داده: " + p.flow.slice(0, 4).join(" → "));
      lines.push("   علت ریشه‌ای: " + (p.root_cause || p.rootCause || "—"));
      if (p.impact || p.why_it_matters || p.why_problematic) {
        lines.push("   تأثیر: " + (p.impact || p.why_it_matters || p.why_problematic));
      }
      if (p.recommendation || p.recommended_correction_area) {
        lines.push("   جهت پیشنهادی: " + (p.recommendation || p.recommended_correction_area));
      }
      lines.push("");
    });

    lines.push("[ROOT CAUSE ANALYSIS]");
    groups.forEach(function (g, i) {
      lines.push((i + 1) + ". علت مشترک: " + (g.root || g.key || "طبق یافته‌ها"));
      lines.push("   اوج شدت: " + (g.severity || "—") + " | تعداد یافته در گروه: " + g.findings.length);
      g.findings.forEach(function (p) {
        lines.push("   - " + (p.file_name || p.file || "؟") + (p.line ? ":" + p.line : "") + " — " + (p.symptom || p.description || "").slice(0, 90));
      });
      lines.push("");
    });

    lines.push("[IMPACT]");
    var hasCrit = valid.some(function (p) { return p.severity === "critical"; });
    var hasHigh = valid.some(function (p) { return p.severity === "high"; });
    if (hasCrit) lines.push("- مسائل Critical می‌توانند امنیت، یکپارچگی داده یا مسیر اجرای اصلی را بشکنند.");
    if (hasHigh) lines.push("- مسائل High می‌توانند نتایج اشتباه، از دست رفتن داده یا خطای قابل‌مشاهده برای کاربر ایجاد کنند.");
    lines.push("- موارد متوسط و پایین هم در صورت وجود Evidence محکم باید اصلاح شوند، بدون گسترش دامنه.");
    lines.push("");

    lines.push("[RELATED FILES]");
    lines.push(fileList.length ? fileList.map(function (f) { return "- " + f; }).join("\n") : "- (از یافته‌ها استخراج شده)");
    lines.push("قبل از تغییر هر فایل، وابستگی‌ها و فراخوان‌کننده‌های آن را بررسی کن.");
    lines.push("");

    if (depth >= 2) {
      lines.push("[DEPENDENCIES]");
      lines.push("فایل‌های فهرست‌شده فقط نقطهٔ ورود هستند. قبل از ویرایش، یال‌های import/export و data-flow را تأیید کن.");
      lines.push("ماژول‌های مشترکی که در چند یافته ظاهر می‌شوند ممکن است به یک اصلاح هماهنگ نیاز داشته باشند.");
      lines.push("");
    }

    lines.push("[OBJECTIVE]");
    lines.push("علت‌های ریشه‌ای تأییدشده را با کمترین مجموعهٔ تغییر امن برطرف کن. باگ یا Evidence جعلی اضافه نکن.");
    lines.push("");

    lines.push("[IMPLEMENTATION STRATEGY]");
    lines.push("۱. Evidence هر گروه Root Cause را دوباره بخوان.");
    lines.push("۲. کمترین Fixی را انتخاب کن که علت زیربنایی را حل کند، نه فقط علامت سطحی را.");
    lines.push("۳. الگوی موجود پروژه را ترجیح بده؛ فریمورک یا بک‌اند جدید اضافه نکن.");
    lines.push("۴. اگر چند رویکرد معتبر وجود دارد، آن را انتخاب کن که با سبک کدبیس هم‌خوان باشد و کمترین ریسک Regression را داشته باشد.");
    lines.push("");

    lines.push("[IMPLEMENTATION SCOPE]");
    lines.push("- فقط فایل‌های لازم برای حل علت‌های ریشه‌ای فهرست‌شده: " + (fileList.join("، ") || "فایل‌های مرتبط"));
    lines.push("- APIهای عمومی، جریان‌های UI نامرتبط و فرمت داده بدون تغییر بمانند مگر اینکه مسئلهٔ فهرست‌شده واقعاً آن‌ها را ایجاب کند.");
    lines.push("");

    lines.push("[NON-SCOPE]");
    lines.push("- قابلیت‌های نامرتبط را بازنویسی نکن.");
    lines.push("- سرور، Docker، دیتابیس یا سرویس خارجی اضافه نکن.");
    lines.push("- کنترل‌های امنیتی را تضعیف نکن و Validation را حذف نکن.");
    lines.push("- دامنه تغییر را برای بهبودهای صرفاً سبکی یا حدسی گسترش نده.");
    lines.push("");

    lines.push("[CONSTRAINTS]");
    lines.push("- فقط Minimal Safe Fix.");
    lines.push("- معماری آفلاین / مرورگرمحور پروژه را در صورت وجود حفظ کن.");
    lines.push("- اگر Evidence برای یک تغییر کافی نیست، آن مورد را رد کن و دلیل را بنویس.");
    lines.push("");

    if (valid.some(function (p) { return /security/i.test(p.category || "") || /security/i.test(p.classification || ""); })) {
      lines.push("[SECURITY REQUIREMENTS]");
      lines.push("- برای هر یافته امنیتی: مسیر Source → Transform → Sink را مشخص کن و آن را ببند یا Sanitize کن.");
      lines.push("- دادهٔ کنترل‌شده توسط کاربر نباید بدون بررسی به sink اجرایی یا HTML برسد.");
      lines.push("");
    }

    if (valid.some(function (p) { return /math|calcul/i.test(p.category || ""); })) {
      lines.push("[MATH / CALCULATION REQUIREMENTS]");
      lines.push("- برای یافته‌های محاسباتی: فرمول، نتیجه مورد انتظار (مسیر مستقل)، نتیجه واقعی، تلورانس و Convention را ذکر کن.");
      lines.push("- Conventionهای مالی معتبر را به‌عنوان باگ در نظر نگیر.");
      lines.push("");
    }

    if (valid.some(function (p) { return /storage|database/i.test(p.category || ""); })) {
      lines.push("[STORAGE / PERSISTENCE REQUIREMENTS]");
      lines.push("- کلید نوشتن، کلید خواندن، Serialization و مسیر Restore را هم‌تراز کن. JSON.parse و Persistence ناهمگام را محافظت کن.");
      lines.push("- بعد از Refresh، State باید با Persistence مورد نظر هم‌خوان باشد.");
      lines.push("");
    }

    lines.push("[EDGE CASES]");
    lines.push("- ورودی null / undefined / خالی، کلید مفقود، storage خراب، خطای شبکه (در صورت مرتبط بودن) و مقادیر مرزی عددی.");
    lines.push("");

    lines.push("[VALIDATION REQUIREMENTS]");
    lines.push("- هر مسئلهٔ اصلی (یا مسیر Evidence) را قبل و بعد از Fix بازتولید کن.");
    lines.push("- مطمئن شو Root Cause برطرف شده، نه فقط علامت سطحی.");
    lines.push("- نحو و ساختار ماژول معتبر بماند.");
    lines.push("");

    lines.push("[REGRESSION TESTS]");
    lines.push("- در صورت امکان همان دستهٔ تحلیل را دوباره اجرا کن.");
    lines.push("- جریان‌های آپلود → تحلیل → نتایج → زبان/تنظیمات را اگر درگیر بودند تمرین کن.");
    lines.push("- برای storage/math/security: مسیر Evidence خاص دیگر نباید شکست بخورد.");
    lines.push("");

    if (depth >= 2) {
      lines.push("[REAL USER SIMULATION]");
      lines.push("- UI یا نقطهٔ ورود درگیر را باز کن.");
      lines.push("- مراحل کاربری که قبلاً علامت را نشان می‌داد انجام بده.");
      lines.push("- در صورت درگیر بودن Persistence، Refresh / باز کردن مجدد را هم تست کن.");
      lines.push("- تأیید کن علامت از بین رفته و خطای جدیدی ظاهر نشده است.");
      lines.push("");
    }

    lines.push("[ACCEPTANCE CRITERIA]");
    lines.push("- با فرض شرایط Evidence هر مسئلهٔ تأییدشده، وقتی کاربر مسیر مرتبط را طی می‌کند، آن مسئله دیگر رخ ندهد.");
    lines.push("- قابلیت‌های نامرتبط مثل قبل کار کنند.");
    lines.push("");

    lines.push("[FINAL REPORT]");
    lines.push("فهرست کن: فایل‌های تغییرکرده، مسائل رفع‌شده، مسائل ردشده (با دلیل)، ریسک‌های باقی‌مانده و هر فرض Convention برای محاسبات مالی.");

    return lines;
  }

  function qualityCheck(lines, valid) {
    var text = lines.join("\n");
    var issues = [];
    if (!valid.length) issues.push("no-valid-findings");
    if (text.indexOf("[ROOT CAUSE") < 0 && text.indexOf("[ROOT CAUSE ANALYSIS]") < 0) issues.push("missing-root-cause-section");
    if (text.length < 80) issues.push("too-short");
    // soft trim to MAX_LINES
    if (lines.length > MAX_LINES) {
      lines = lines.slice(0, MAX_LINES - 2);
      lines.push("");
      lines.push(isFa()
        ? "… (Prompt به سقف امن طول رسید؛ جزئیات کامل در Findings موجود است.)"
        : "… (Prompt truncated at safe length ceiling; full detail remains in Findings.)");
    }
    return { lines: lines, issues: issues, score: Math.max(0, 100 - issues.length * 15) };
  }

  function generate(findings, meta) {
    meta = meta || {};
    // Prefer CI-marked prompt-ready set when provided via meta
    var source = findings || [];
    if (meta.promptReadyFindings && meta.promptReadyFindings.length) {
      source = meta.promptReadyFindings;
    } else {
      var ready = source.filter(function (p) { return p && p._ci_prompt_ready === true; });
      if (ready.length) source = ready;
    }
    var valid = sortFindings(source, meta);

    if (!valid.length) {
      return {
        empty: true,
        text: isFa()
          ? "مشکل قطعی و قابل‌اقدامی برای تولید Prompt اصلاحی پیدا نشد."
          : "No confirmed actionable issue was found, so no fix prompt is required.",
        count: 0,
        qualityScore: 100,
        language: lang()
      };
    }

    var groups = groupByRootCause(valid);
    var fileList = collectFiles(valid);
    var score = complexityScore(valid, groups, fileList);
    // depth 1 = simple, 2 = medium/complex
    var depth = score >= 35 || valid.length >= 4 || groups.length >= 3 || fileList.length >= 3 ? 2 : 1;

    var lines = isFa()
      ? buildFa(valid, groups, fileList, meta, depth)
      : buildEn(valid, groups, fileList, meta, depth);

    var checked = qualityCheck(lines, valid);

    return {
      empty: false,
      text: checked.lines.join("\n"),
      count: valid.length,
      groups: groups.length,
      files: fileList.length,
      depth: depth,
      qualityScore: checked.score,
      language: lang(),
      qualityIssues: checked.issues
    };
  }

  global.ADFinalPrompt = {
    generate: generate,
    isValidFinding: isValidFinding,
    groupByRootCause: groupByRootCause,
    version: "V10.1.0"
  };
})(typeof window !== "undefined" ? window : globalThis);
