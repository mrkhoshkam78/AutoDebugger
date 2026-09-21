/**
 * Conversational Explanation + Localization Layer V10.0
 * Engines produce structured data / English keys; this layer builds user-facing text.
 * ADi18n.getLang() → normalizeFindingLanguage() → Finding Explanation → UI
 */
(function (global) {
  "use strict";

  function lang() {
    if (typeof self !== "undefined" && self.__AD_UI_LANG) return self.__AD_UI_LANG;
    if (typeof ADi18n !== "undefined" && ADi18n.getLang) return ADi18n.getLang();
    try { return localStorage.getItem("ad_lang") || "en"; } catch (e) { return "en"; }
  }
  function isFa() { return lang() === "fa"; }
  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  /** Common English → Persian phrase map for hard-coded engine strings (root cause, description, etc.) */
  var FA_MAP = {
    // ── Math ──
    "Division by zero literal": "تقسیم بر صفر (لیترال)",
    "Division by zero": "تقسیم بر صفر",
    "NaN / Infinity signal": "سیگنال NaN یا Infinity",
    "parseInt without radix": "parseInt بدون پایه (radix)",
    "parseFloat without NaN guard nearby": "parseFloat بدون بررسی NaN در نزدیکی",
    "Expression yields non-finite value": "عبارت مقدار غیرمتناهی تولید می‌کند",
    "Floating-point literal arithmetic": "محاسبه حسابی با لیترال ممیز شناور",
    "Percentage scale may be wrong (× percent without ÷100)": "مقیاس درصد ممکن است اشتباه باشد (ضرب در درصد بدون تقسیم بر ۱۰۰)",
    "Multi-step numeric formula chain": "زنجیره فرمول عددی چندمرحله‌ای",
    "Boundary length-1 / min-max pattern": "الگوی مرزی length-1 / min-max",
    "Possible division risk": "ریسک احتمالی تقسیم",
    // ── Storage ──
    "Sensitive data in localStorage": "داده حساس در localStorage",
    "JSON.parse on storage without try/catch": "JSON.parse روی داده ذخیره‌شده بدون try/catch",
    "Mixed sessionStorage write and localStorage read": "نوشتن در sessionStorage و خواندن از localStorage",
    "IndexedDB without visible error handling": "IndexedDB بدون مدیریت خطای قابل مشاهده",
    "Storage writes without any getItem in project": "نوشتن در storage بدون هیچ getItem در پروژه",
    "Storage key written but not read in file": "کلید storage نوشته شده اما در فایل خوانده نشده",
    "Storage read may not drive UI update in nearby code": "خواندن از storage ممکن است به‌روزرسانی UI را در کد نزدیک هدایت نکند",
    "Secrets pattern + browser storage": "الگوی اسرار + ذخیره‌سازی مرورگر",
    // ── Security ──
    "Use of eval()": "استفاده از eval()",
    "innerHTML assignment": "انتساب به innerHTML",
    "document.write()": "استفاده از document.write()",
    "Hardcoded password-like string": "رشته شبیه رمز عبور hardcode شده",
    "Hardcoded API key": "کلید API hardcode شده",
    "Inline event handlers": "رویدادهای اینلاین",
    "postMessage with wildcard origin": "postMessage با origin ستاره (*)",
    "iframe without sandbox": "iframe بدون sandbox",
    "target=_blank without rel=noopener": "target=_blank بدون rel=noopener",
    "Possible user input to HTML sink": "احتمال رسیدن ورودی کاربر به sink HTML",
    "Possible SQL string with user input": "رشته SQL احتمالی با ورودی کاربر",
    "pickle.load/loads usage": "استفاده از pickle.load/loads",
    "yaml.load without SafeLoader": "yaml.load بدون SafeLoader",
    "Possible command injection signal": "سیگنال احتمال تزریق فرمان",
    "document.cookie assignment": "انتساب به document.cookie",
    "javascript: URL": "آدرس javascript:",
    "Function constructor": "سازنده Function",
    "outerHTML assignment": "انتساب به outerHTML",
    "insertAdjacentHTML usage": "استفاده از insertAdjacentHTML",
    "Localhost URL in source": "آدرس localhost در سورس",
    "SQL-like string concatenation with dynamic input": "الحاق رشته شبیه SQL با ورودی پویا",
    "User/URL/storage/network data reaches innerHTML without sanitization": "داده کاربر/URL/storage/شبکه بدون پالایش به innerHTML می‌رسد",
    "Never pass user/URL/storage data to eval; use safe parsing.": "هرگز داده کاربر/URL/storage را به eval ندهید؛ از پارس امن استفاده کنید.",
    "Missing null check": "بررسی مقدار null انجام نشده است",
    "A required null check is missing.": "بررسی لازم برای مقدار null انجام نشده است.",
    // ── Syntax / Structure ──
    "Empty or blank file": "فایل خالی یا بدون محتوا",
    "Unbalanced braces/parentheses": "پرانتز یا براکت نامتعادل",
    "Unbalanced brackets (Python)": "براکت‌های نامتعادل (پایتون)",
    "Malformed method call": "فراخوانی متد ناقص",
    "Possible missing colon": "احتمال نبودن دونقطه (:)",
    "Mixed tabs and spaces": "ترکیب تب و فاصله",
    "Invalid JSON": "JSON نامعتبر",
    "Unbalanced CSS braces": "براکت‌های CSS نامتعادل",
    "Empty CSS rule": "قانون CSS خالی",
    "Missing DOCTYPE": "DOCTYPE موجود نیست",
    // ── Logic ──
    "Input value used without empty check": "مقدار ورودی بدون بررسی خالی بودن استفاده شده",
    "DOM node used without null check": "گره DOM بدون بررسی null استفاده شده",
    "Loose equality usage": "استفاده از برابری سست (==)",
    "Loop uses <= length": "حلقه از <= length استفاده می‌کند",
    "Empty catch block": "بلوک catch خالی",
    "Promise without catch": "Promise بدون catch",
    "addEventListener without remove": "addEventListener بدون remove",
    // ── UI / UX / Perf / Responsive ──
    "Button without type": "دکمه بدون type",
    "Form may allow double submit": "فرم ممکن است ارسال دوباره را اجازه دهد",
    "Extremely high z-index": "z-index بسیار بالا",
    "Infinite CSS animation": "انیمیشن CSS بی‌نهایت",
    "Synchronous XHR": "XHR همزمان",
    "Very long file (function density risk)": "فایل بسیار طولانی (ریسک تراکم توابع)",
    "Many JS modules (": "تعداد زیاد ماژول JS (",
    // ── Generic recommendations / why ──
    "Empty files do nothing.": "فایل‌های خالی کاری انجام نمی‌دهند.",
    "Usually causes parse errors.": "معمولاً باعث خطای پارس می‌شود.",
    "Space between . and ( is invalid.": "فاصله بین . و ( نامعتبر است.",
    "Python compound statements need ':'.": "دستورات مرکب پایتون به «:» نیاز دارند.",
    "Often causes IndentationError.": "اغلب باعث IndentationError می‌شود.",
    "Breaks layout.": "چیدمان را خراب می‌کند.",
    "May trigger quirks mode.": "ممکن است حالت quirks را فعال کند.",
    "Breaks cascade.": "آبشار CSS را خراب می‌کند.",
    "Noise / incomplete style.": "نویز یا استایل ناقص.",
    "Apps cannot parse it.": "برنامه‌ها نمی‌توانند آن را پارس کنند.",
    "Secrets can leak.": "اسرار ممکن است افشا شوند.",
    "Keys can be abused.": "کلیدها ممکن است مورد سوءاستفاده قرار گیرند.",
    "Harder to secure and maintain.": "امن‌سازی و نگهداری سخت‌تر است.",
    "Can delay styles.": "می‌تواند استایل‌ها را به تأخیر بیندازد.",
    "Can slow first load.": "می‌تواند بارگذاری اولیه را کند کند.",
    "Disrupts natural focus order.": "ترتیب طبیعی فوکوس را مختل می‌کند.",
    "Defaults to submit in forms.": "در فرم‌ها به‌صورت پیش‌فرض submit است.",
    "Can hinder navigation.": "می‌تواند ناوبری را مختل کند.",
    "Consider complexity.": "پیچیدگی را در نظر بگیرید.",
    "Review intent.": "قصد را بازبینی کنید.",
    "Add content or remove.": "محتوا اضافه کنید یا فایل را حذف کنید.",
    "Fix matching brackets.": "براکت‌های متناظر را اصلاح کنید.",
    "Use spaces only.": "فقط از فاصله استفاده کنید.",
    "Close the tag.": "تگ را ببندید.",
    "Add DOCTYPE first.": "ابتدا DOCTYPE اضافه کنید.",
    "Balance braces.": "براکت‌ها را متعادل کنید.",
    "Remove or complete.": "حذف یا تکمیل کنید.",
    "Fix syntax.": "نحو را اصلاح کنید.",
    "Move out of source.": "از سورس خارج کنید.",
    "Externalize.": "خارج‌سازی کنید.",
    "Set type explicitly.": "type را صریح تنظیم کنید.",
    "Prefer <link>.": "ترجیح دهید از <link> استفاده کنید.",
    "Bundle or defer.": "باندل یا defer کنید.",
    "Use HTTPS URLs.": "از URLهای HTTPS استفاده کنید.",
    "Add viewport meta.": "متا viewport اضافه کنید.",
    "Add alt text.": "متن alt اضافه کنید.",
    "Add lang attribute.": "ویژگی lang اضافه کنید.",
    "Add a title.": "عنوان اضافه کنید.",
    "Add meta description.": "توضیح متا اضافه کنید.",
    "Add labels.": "برچسب اضافه کنید.",
    "Provide :focus styles.": "استایل :focus فراهم کنید.",
    "Avoid positive tabindex.": "از tabindex مثبت اجتناب کنید.",
    "Increase hit area.": "ناحیه کلیک را بزرگ‌تر کنید.",
    "Add breakpoints.": "نقطه شکست اضافه کنید.",
    "Use max-width or %.": "از max-width یا % استفاده کنید.",
    "Add responsive image CSS.": "CSS تصویر واکنش‌گرا اضافه کنید.",
    "Consider rem.": "rem را در نظر بگیرید.",
    "Prefer class selectors.": "سلکتور کلاس را ترجیح دهید.",
    "Refactor specificity.": "اختصاص‌پذیری را بازآرایی کنید.",
    "Split the file.": "فایل را تقسیم کنید.",
    "Extract constants.": "ثابت‌ها را استخراج کنید.",
    "Move to stylesheet.": "به استایل‌شیت منتقل کنید.",
    "Move JS to scripts.": "JS را به اسکریپت‌ها منتقل کنید.",
    "Strip for production.": "برای پروداکشن حذف کنید.",
    "Finish or track.": "تکمیل یا پیگیری کنید.",
    "Add element or guard.": "عنصر اضافه کنید یا محافظ بگذارید.",
    "Clear boundaries": "مرزهای واضح",
    "Clear module strategy": "استراتژی ماژول واضح",
    "Rename one file.": "یکی از فایل‌ها را تغییر نام دهید.",
    "Rename or namespace.": "تغییر نام یا namespace.",
    "Flatten folders if possible.": "در صورت امکان پوشه‌ها را تخت کنید.",
    "Add or fix path.": "مسیر را اضافه یا اصلاح کنید.",
    "Use a standard name.": "از نام استاندارد استفاده کنید.",
    "obj.method()": "obj.method()",
    "Valid content.": "محتوای معتبر.",
    "Empty.": "خالی.",
    "Balanced delimiters.": "جداکننده‌های متعادل.",
    "Consistent indentation.": "تورفتگی یکنواخت.",
    "Both found.": "هر دو یافت شد.",
    "Matching close tag.": "تگ بسته متناظر.",
    "None found.": "هیچ‌کدام یافت نشد.",
    "Equal braces.": "براکت‌های برابر.",
    "Non-empty rules.": "قوانین غیرخالی.",
    "Empty { }.": "خالی { }.",
    "Valid JSON.": "JSON معتبر.",
    "External secrets.": "اسرار خارجی.",
    "Env/config.": "محیط/پیکربندی.",
    "password = '...'": "password = '...'",
    "api_key =": "api_key =",
    "Hardcoded secrets combined with client storage increases exposure.": "اسرار hardcode شده همراه با ذخیره‌سازی سمت کلاینت ریسک افشا را افزایش می‌دهد.",
    "Corrupt or non-JSON storage values throw and can break app boot.": "مقادیر ذخیره‌شده خراب یا غیر JSON باعث throw می‌شوند و ممکن است بوت برنامه را بشکنند.",
    "Use one consistent storage scope per key.": "برای هر کلید از یک scope ذخیره‌سازی یکسان استفاده کنید.",
    "Unify storage API for the same data.": "API ذخیره‌سازی را برای داده یکسان یکپارچه کنید.",
    "SOURCE: secret-like value → SINK: localStorage (readable by XSS).": "منبع: مقدار شبیه رمز → مقصد: localStorage (قابل خواندن توسط XSS).",
    "Prefer httpOnly cookies or secure storage.": "کوکی‌های httpOnly یا ذخیره‌سازی امن را ترجیح دهید.",
    "Do not store secrets client-side.": "اسرار را سمت کلاینت ذخیره نکنید.",
    "Unguarded deserialization from web storage": "deserialization بدون محافظ از web storage",
    "Inconsistent storage scope for related data": "scope ذخیره‌سازی ناسازگار برای داده مرتبط",
    "No storage read path in project": "مسیر خواندن storage در پروژه وجود ندارد",
    "Storage write key has no matching read in same module": "کلید نوشته‌شده در storage خواندن متناظر در همان ماژول ندارد",
    "Asymmetric storage key usage": "استفاده نامتقارن از کلید storage",
    "IndexedDB path lacks error handlers": "مسیر IndexedDB فاقد handler خطا است"
  };;

  function translatePhrase(en) {
    if (!en || !isFa()) return en;
    var s = clean(en);
    if (!s) return s;
    if (FA_MAP[s]) return FA_MAP[s];
    // longest-prefix match for dynamic titles (e.g. "Storage key written but not read in file: foo")
    var best = null, bestLen = 0;
    for (var k in FA_MAP) {
      if (s.indexOf(k) === 0 && k.length > bestLen) {
        best = k;
        bestLen = k.length;
      }
    }
    if (best) return FA_MAP[best] + s.slice(bestLen);
    // also try contains for short known phrases
    for (var k2 in FA_MAP) {
      if (k2.length > 12 && s.indexOf(k2) >= 0) {
        return s.split(k2).join(FA_MAP[k2]);
      }
    }
    return s; // keep original if no mapping (technical identifiers stay)
  }

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
        if (typeof e === "string") return translatePhrase(e);
        return clean(translatePhrase(e.explanation || e.snippet || e.type || ""));
      }).filter(Boolean).join("; ");
    }
    return clean(translatePhrase(evidence || finding.detected_behavior || ""));
  }

  /**
   * Normalize all user-facing strings of a finding to the current UI language.
   * Technical identifiers (paths, code, rule ids) stay untouched.
   */
  function normalizeFindingLanguage(finding) {
    if (!finding) return finding;
    finding.description = translatePhrase(finding.description || "");
    finding.simple_title = translatePhrase(finding.simple_title || finding.description || "");
    finding.why_problematic = translatePhrase(finding.why_problematic || finding.why_it_matters || "");
    finding.root_cause = translatePhrase(finding.root_cause || "");
    finding.symptom = translatePhrase(finding.symptom || "");
    finding.recommendation = translatePhrase(finding.recommendation || finding.recommended_correction_area || "");
    finding.expected_behavior = translatePhrase(finding.expected_behavior || "");
    finding.detected_behavior = translatePhrase(finding.detected_behavior || "");
    finding.impact = translatePhrase(finding.impact || "");
    if (finding.evidence && Array.isArray(finding.evidence)) {
      finding.evidence = finding.evidence.map(function (e) {
        if (!e || typeof e === "string") return translatePhrase(e);
        var copy = {};
        for (var k in e) copy[k] = e[k];
        if (copy.explanation) copy.explanation = translatePhrase(copy.explanation);
        return copy;
      });
    }
    return finding;
  }

  function buildConversational(finding) {
    finding = finding || {};
    normalizeFindingLanguage(finding);
    var ck = catKey(finding.category);
    var desc = clean(finding.description || finding.symptom || "");
    var root = clean(finding.root_cause || "");
    var why = clean(finding.why_it_matters || finding.why_problematic || finding.impact || "");
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
    normalizeFindingLanguage(finding);
    var exp = buildConversational(finding);
    finding.conversational = exp.conversational;
    finding.simple_title = finding.simple_title || exp.title;
    if (!finding.symptom && finding.description) finding.symptom = finding.description;
    finding._lang = lang();
    return finding;
  }

  /** Re-localize an existing finding when UI language changes */
  function reLocalizeFinding(finding) {
    return enrichFinding(finding);
  }

  global.ADExplain = {
    buildConversational: buildConversational,
    enrichFinding: enrichFinding,
    normalizeFindingLanguage: normalizeFindingLanguage,
    reLocalizeFinding: reLocalizeFinding,
    translatePhrase: translatePhrase
  };
})(typeof window !== "undefined" ? window : globalThis);
