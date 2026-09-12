(function(global){
/**
 * Simple i18n — Auto Debugger V1.02
 * FA / EN, no hard-coded UI strings elsewhere.
 */

const STRINGS = {
  en: {
    appTitle: "Auto Debugger",
    version: "V1.02 · Browser-Only",
    localBadge: "Local · Offline",
    statusReady: "Ready",
    statusReading: "Reading files…",
    statusAnalyzing: "Analyzing…",
    statusDone: "Done",
    statusError: "Error",
    uploadTitle: "1. Project",
    dropTitle: "Drop files or ZIP",
    dropHint: "HTML · CSS · JS · TS · Python · Java · C/C++ · PHP · JSON · ZIP",
    browse: "Browse",
    noFiles: "No files yet",
    configTitle: "2. Configuration",
    langLabel: "Language",
    categoryLabel: "Category",
    levelLabel: "Test level",
    startBtn: "Start analysis",
    analyzing: "Analyzing…",
    resultsTitle: "3. Results",
    noAnalysis: "No analysis yet",
    noAnalysisHint: "Load files, set options, then run analysis. Everything stays in your browser.",
    testExec: "Tests",
    problems: "Problems",
    allSeverities: "All severities",
    allFiles: "All files",
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
    total: "Total",
    rootCause: "Root cause",
    symptom: "Symptom",
    why: "Why",
    expected: "Expected",
    evidence: "Evidence",
    impact: "Impact",
    recommendation: "Fix area",
    detectedBy: "Detected by",
    section: "Section",
    noMatch: "No problems match filters.",
    settings: "Settings",
    settingsLang: "UI language",
    settingsTheme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    langEn: "English",
    langFa: "فارسی",
    deleteFile: "Remove",
    footerLeft: "V1.02 · Static analysis · No auto-fix",
    footerRight: "Offline · IndexedDB · Safe",
    level1Desc: "Quick syntax & structure checks. Fully local.",
    level2Desc: "Relations, dependencies, UI/UX & category depth. Fully local.",
    level3Desc: "Architecture, edge cases, responsive & deep consistency. Fully local.",
    autoDetect: "Auto-detect",
    catCode: "Code / Logic",
    catUI: "UI",
    catUX: "UX",
    catPerf: "Performance",
    catSyntax: "Syntax",
    catSec: "Security",
    catResp: "Responsive",
    catStruct: "Structure / Architecture",
    lvl1: "Level 1 — Quick",
    lvl2: "Level 2 — Full",
    lvl3: "Level 3 — Deep",
    analysisFailed: "Analysis failed",
    fileTooLarge: "File too large",
    noReadable: "No readable text files",
    zipTooLarge: "ZIP too large",
    localReady: "Local · {n} file(s)",
    conf: "conf"
  },
  fa: {
    appTitle: "دیباگر خودکار",
    version: "V1.02 · فقط مرورگر",
    localBadge: "محلی · آفلاین",
    statusReady: "آماده",
    statusReading: "در حال خواندن…",
    statusAnalyzing: "در حال تحلیل…",
    statusDone: "انجام شد",
    statusError: "خطا",
    uploadTitle: "۱. پروژه",
    dropTitle: "فایل یا ZIP را رها کنید",
    dropHint: "HTML · CSS · JS · TS · Python · Java · C/C++ · PHP · JSON · ZIP",
    browse: "انتخاب فایل",
    noFiles: "هنوز فایلی نیست",
    configTitle: "۲. تنظیمات تحلیل",
    langLabel: "زبان برنامه",
    categoryLabel: "دسته دیباگ",
    levelLabel: "سطح تست",
    startBtn: "شروع تحلیل",
    analyzing: "در حال تحلیل…",
    resultsTitle: "۳. نتایج",
    noAnalysis: "هنوز تحلیلی انجام نشده",
    noAnalysisHint: "فایل‌ها را بارگذاری کنید، گزینه‌ها را تنظیم و تحلیل را اجرا کنید. همه چیز در مرورگر می‌ماند.",
    testExec: "تست‌ها",
    problems: "مشکلات",
    allSeverities: "همه شدت‌ها",
    allFiles: "همه فایل‌ها",
    critical: "بحرانی",
    high: "بالا",
    medium: "متوسط",
    low: "کم",
    info: "اطلاعات",
    total: "جمع",
    rootCause: "علت ریشه‌ای",
    symptom: "نشانه",
    why: "چرا مشکل‌ساز است",
    expected: "رفتار مورد انتظار",
    evidence: "شواهد",
    impact: "تأثیر",
    recommendation: "محل اصلاح پیشنهادی",
    detectedBy: "تشخیص توسط",
    section: "بخش",
    noMatch: "مشکلی با فیلتر فعلی نیست.",
    settings: "تنظیمات",
    settingsLang: "زبان رابط",
    settingsTheme: "پوسته",
    themeDark: "تیره",
    themeLight: "روشن",
    langEn: "English",
    langFa: "فارسی",
    deleteFile: "حذف",
    footerLeft: "V1.02 · تحلیل ایستا · بدون اصلاح خودکار",
    footerRight: "آفلاین · IndexedDB · امن",
    level1Desc: "بررسی سریع نحو و ساختار. کاملاً محلی.",
    level2Desc: "روابط، وابستگی‌ها، UI/UX و عمق دسته. کاملاً محلی.",
    level3Desc: "معماری، موارد مرزی، ریسپانسیو و سازگاری عمیق. کاملاً محلی.",
    autoDetect: "تشخیص خودکار",
    catCode: "کد / منطق",
    catUI: "رابط کاربری",
    catUX: "تجربه کاربری",
    catPerf: "عملکرد",
    catSyntax: "نحو",
    catSec: "امنیت",
    catResp: "ریسپانسیو",
    catStruct: "ساختار / معماری",
    lvl1: "سطح ۱ — سریع",
    lvl2: "سطح ۲ — کامل",
    lvl3: "سطح ۳ — عمیق",
    analysisFailed: "تحلیل ناموفق",
    fileTooLarge: "فایل خیلی بزرگ است",
    noReadable: "فایل متنی خوانایی یافت نشد",
    zipTooLarge: "ZIP خیلی بزرگ است",
    localReady: "محلی · {n} فایل",
    conf: "اطمینان"
  }
};

let currentLang = "en";

function t(key, vars = {}) {
  const dict = STRINGS[currentLang] || STRINGS.en;
  let s = dict[key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(`{${k}}`, v);
  }
  return s;
}

function getLang() {
  return currentLang;
}

function setLang(lang) {
  currentLang = lang === "fa" ? "fa" : "en";
  try { localStorage.setItem("ad_lang", currentLang); } catch {}
  return currentLang;
}

function loadLang() {
  try {
    const saved = localStorage.getItem("ad_lang");
    if (saved === "fa" || saved === "en") currentLang = saved;
  } catch {}
  return currentLang;
}

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const val = t(key);
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = val;
    } else if (el.tagName === "OPTION") {
      el.textContent = val;
    } else {
      el.textContent = val;
    }
  });
  root.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.title = t(el.getAttribute("data-i18n-title"));
  });
}

global.ADi18n = { t: t, getLang: getLang, setLang: setLang, loadLang: loadLang, applyI18n: applyI18n };
})(typeof window !== 'undefined' ? window : globalThis);
