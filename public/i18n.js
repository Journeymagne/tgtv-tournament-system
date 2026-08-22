// Localization runtime. Loaded as a classic script in the browser (after the
// dictionaries, which it reads from the global scope) and required directly by
// the Node test suite, which builds its own instances via createI18n.

const I18N_LOCALE_STORAGE_KEY = "tgtv-locale";
const I18N_SUPPORTED_LOCALES = ["en", "ru"];
const I18N_DEFAULT_LOCALE = "en";

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

function createI18n(dictionaries, options = {}) {
  const warn = typeof options.warn === "function" ? options.warn : () => {};
  let locale = I18N_DEFAULT_LOCALE;

  function lookup(key) {
    const active = dictionaries[locale] || {};
    if (active[key] !== undefined) return active[key];
    const fallback = dictionaries[I18N_DEFAULT_LOCALE] || {};
    return fallback[key];
  }

  function t(key, vars) {
    const value = lookup(key);
    if (typeof value !== "string") {
      warn(key);
      return key;
    }
    return interpolate(value, vars);
  }

  function plural(key, count, vars) {
    const value = lookup(key);
    if (!value || typeof value !== "object") {
      warn(key);
      return key;
    }
    const form = new Intl.PluralRules(locale).select(count);
    const template = typeof value[form] === "string" ? value[form] : value.other;
    if (typeof template !== "string") {
      warn(key);
      return key;
    }
    return interpolate(template, Object.assign({ n: count }, vars));
  }

  return {
    t,
    plural,
    getLocale: () => locale,
    setLocale(next) {
      locale = I18N_SUPPORTED_LOCALES.includes(next) ? next : I18N_DEFAULT_LOCALE;
      return locale;
    },
    formatDate(value, formatOptions) {
      return new Intl.DateTimeFormat(locale, formatOptions).format(value);
    }
  };
}

// Warn only on a developer machine: there is no build step that could strip
// this, and a production console full of i18n noise helps nobody.
function warnMissingKey(key) {
  if (typeof console === "undefined" || typeof location === "undefined") return;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  console.warn(`[i18n] missing key: ${key}`);
}

const i18n = createI18n(
  {
    en: typeof TGTV_I18N_EN !== "undefined" ? TGTV_I18N_EN : {},
    ru: typeof TGTV_I18N_RU !== "undefined" ? TGTV_I18N_RU : {}
  },
  { warn: warnMissingKey }
);

function t(key, vars) {
  return i18n.t(key, vars);
}

function plural(key, count, vars) {
  return i18n.plural(key, count, vars);
}

if (typeof module !== "undefined") {
  module.exports = {
    createI18n,
    interpolate,
    I18N_LOCALE_STORAGE_KEY,
    I18N_SUPPORTED_LOCALES,
    I18N_DEFAULT_LOCALE
  };
}
