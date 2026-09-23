// Shared, parser-blocking appearance bootstrap: resolve the palette before paint.
// Keep existing preference keys so upgrading retains each visitor's choice.
(function bootAppearance() {
  "use strict";
  var root = document.documentElement;
  var self = document.currentScript;
  function read(key, fallback, allowed) {
    try { var value = window.localStorage.getItem(key); if (allowed.includes(value)) return value; } catch {}
    return fallback;
  }
  var preference = read("tgtv-theme", "dark", ["system", "dark", "light"]);
  // Retire the old automatic setting while keeping its current appearance.
  if (preference === "system") {
    preference = window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
    save("tgtv-theme", preference);
  }
  var locale = read("tgtv-locale", "ru", ["ru", "en"]);
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
  function save(key, value) { try { window.localStorage.setItem(key, value); } catch {} }
  window.KTAppearance = {
    get theme() { return preference; },
    get locale() { return locale; },
    setTheme(value) {
      if (!["dark", "light"].includes(value)) return;
      preference = value; save("tgtv-theme", value); changed(locale);
    },
    setLocale(value) {
      if (!["ru", "en"].includes(value)) return;
      var previous = locale; locale = value; save("tgtv-locale", value); changed(previous);
    },
    refresh: apply
  };
  window.addEventListener("storage", function (event) {
    if (event.key !== null && !["tgtv-theme", "tgtv-locale"].includes(event.key)) return;
    var previous = locale;
    preference = read("tgtv-theme", "dark", ["dark", "light"]);
    locale = read("tgtv-locale", "ru", ["ru", "en"]);
    changed(previous);
  });
  apply();
  // Only the tournament app needs its large dictionary; the other tools use KTUI.
  if (!self?.hasAttribute("data-companion-only")) {
    var query = self && self.src.includes("?") ? self.src.slice(self.src.indexOf("?")) : "";
    document.write('<script src="/i18n/' + locale + '.js' + query + '" defer><\/script>');
  }
})();
