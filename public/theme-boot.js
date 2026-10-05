// Shared, parser-blocking appearance bootstrap: resolve the palette before paint.
// Keep existing preference keys so upgrading retains each visitor's choice.
// A site-wide preference cookie also carries choices between service addresses;
// localStorage keeps same-origin tabs synchronized immediately.
(function bootAppearance() {
  "use strict";
  var root = document.documentElement;
  var self = document.currentScript;
  var themes = ["dark", "light"], locales = ["ru", "en"];
  function stored(key, allowed) {
    try { var value = window.localStorage.getItem(key); if (allowed.includes(value)) return value; } catch {}
    return null;
  }
  function cookie(key, allowed) {
    try {
      for (var part of document.cookie.split(";")) {
        var pair = part.trim().split("=");
        if (pair[0] === key) {
          var value = decodeURIComponent(pair.slice(1).join("="));
          if (allowed.includes(value)) return value;
        }
      }
    } catch {}
    return null;
  }
  function read(key, fallback, allowed) {
    var value = cookie(key, allowed) ?? stored(key, allowed);
    if (value !== null) return value;
    return fallback;
  }
  function saveCookie(key, value) {
    try {
      var hostname = window.location?.hostname || "";
      var domain = /^(?:(?:rating|initiative|tracker|studio|dice|faq)\.)?ktcompanion\.ru$/.test(hostname) ? "; Domain=ktcompanion.ru" : "";
      var secure = window.location?.protocol === "https:" ? "; Secure" : "";
      document.cookie = key + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=31536000; SameSite=Lax" + domain + secure;
    } catch {}
  }
  function save(key, value) {
    try { window.localStorage.setItem(key, value); } catch {}
    saveCookie(key, value);
  }
  var preference = read("tgtv-theme", "dark", ["system", ...themes]);
  // Retire the old automatic setting while keeping its current appearance.
  if (preference === "system") {
    preference = window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
  }
  var locale = read("tgtv-locale", "ru", locales);
  // Migrate an existing explicit choice; a first visit must not overwrite a
  // preference from another service with a newly generated default.
  if (cookie("tgtv-theme", themes) !== null || stored("tgtv-theme", ["system", ...themes]) !== null) save("tgtv-theme", preference);
  if (cookie("tgtv-locale", locales) !== null || stored("tgtv-locale", locales) !== null) save("tgtv-locale", locale);
  function apply() {
    root.dataset.themePreference = preference;
    root.dataset.theme = preference;
    root.lang = locale;
  }
  function changed(previousLocale) {
    apply();
    window.dispatchEvent(new CustomEvent("kt:appearance", { detail: { theme: preference, locale } }));
    if (previousLocale !== locale) window.dispatchEvent(new CustomEvent("kt:locale", { detail: { locale } }));
  }
  function refresh() {
    var previousTheme = preference, previousLocale = locale;
    preference = read("tgtv-theme", preference, themes);
    locale = read("tgtv-locale", locale, locales);
    if (previousTheme !== preference || previousLocale !== locale) changed(previousLocale);
    else apply();
  }
  window.KTAppearance = {
    get theme() { return preference; },
    get locale() { return locale; },
    setTheme(value) {
      if (!themes.includes(value)) return;
      preference = value; save("tgtv-theme", value); changed(locale);
    },
    setLocale(value) {
      if (!locales.includes(value)) return;
      var previous = locale; locale = value; save("tgtv-locale", value); changed(previous);
    },
    refresh
  };
  window.addEventListener("storage", function (event) {
    if (event.key !== null && !["tgtv-theme", "tgtv-locale"].includes(event.key)) return;
    if (event.key !== null) {
      var allowed = event.key === "tgtv-theme" ? themes : locales;
      var value = event.newValue === undefined ? stored(event.key, allowed) : event.newValue;
      if (allowed.includes(value)) saveCookie(event.key, value);
    }
    var previous = locale;
    preference = read("tgtv-theme", "dark", themes);
    locale = read("tgtv-locale", "ru", locales);
    changed(previous);
  });
  window.addEventListener("pageshow", refresh);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") refresh(); });
  apply();
  // Only the tournament app needs its large dictionary; the other tools use KTUI.
  if (!self?.hasAttribute("data-companion-only")) {
    var query = self && self.src.includes("?") ? self.src.slice(self.src.indexOf("?")) : "";
    document.write('<script src="/i18n/' + locale + '.js' + query + '" defer><\/script>');
  }
})();
