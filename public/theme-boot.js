// Parser-blocking on purpose, and deliberately tiny. Two jobs, both of which
// have to happen before the deferred bundle runs.
//
// 1. Stamp data-theme/lang before the first paint. The palette lives entirely
//    in styles.css, which defaults to dark and only goes light under
//    :root[data-theme="light"]. app.js is deferred, so without this a
//    light-theme visitor gets a full dark paint that flips once ~430 KB of
//    application code has parsed. An inline <script> cannot do it either: the
//    CSP in src/http/io.js is script-src 'self'.
//
// 2. Pull in the locale dictionary the visitor is actually in. index.html used
//    to load both en.js and ru.js (47 KB + 63 KB) on every visit and use one.
//    document.write is what keeps this correct: it puts the tag in the parser's
//    stream, so the dictionary joins the same defer queue as app.js and is in
//    place before the first render. A dynamically appended script would not be
//    ordered against the deferred scripts and could land after the first paint.
//
// app.js re-applies theme and locale later through applyTheme()/applyLocale();
// this only has to get the first paint right, so it stays free of any
// dependency on i18n.js or the rest of the bundle.
(function bootAppearance() {
  var root = document.documentElement;
  var self = document.currentScript;
  // Reuse this file's own cache-busting marker so index.html stays the single
  // place a release version is bumped.
  var query = self && self.src.indexOf("?") >= 0 ? self.src.slice(self.src.indexOf("?")) : "";

  var theme = null;
  try {
    var savedTheme = window.localStorage.getItem("tgtv-theme");
    if (savedTheme === "dark" || savedTheme === "light") theme = savedTheme;
  } catch (err) {
    // Storage can be blocked; fall through to the OS preference.
  }
  if (!theme) {
    theme =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
  }
  root.dataset.theme = theme;

  var locale = null;
  try {
    var savedLocale = window.localStorage.getItem("tgtv-locale");
    if (savedLocale === "en" || savedLocale === "ru") locale = savedLocale;
  } catch (err) {
    // Same as above.
  }
  if (!locale) {
    var preferred =
      (window.navigator && window.navigator.languages && window.navigator.languages[0]) ||
      (window.navigator && window.navigator.language) ||
      "";
    locale = String(preferred).toLowerCase().indexOf("ru") === 0 ? "ru" : "en";
  }
  root.lang = locale;

  document.write('<script src="/i18n/' + locale + '.js' + query + '" defer><\/script>');
  // The other dictionary is never fetched here. app.js loads it on demand the
  // first time somebody reaches for the language toggle.
})();
