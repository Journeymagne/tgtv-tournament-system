const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createI18n,
  I18N_LOCALE_STORAGE_KEY,
  I18N_SUPPORTED_LOCALES,
  I18N_DEFAULT_LOCALE
} = require("../../public/i18n.js");

const DICTIONARIES = {
  en: {
    "common.save": "Save",
    "common.greeting": "Hello, {name}",
    "games.count": { one: "{n} game", other: "{n} games" }
  },
  ru: {
    "common.save": "Сохранить",
    "common.greeting": "Привет, {name}",
    "games.count": { one: "{n} игра", few: "{n} игры", many: "{n} игр", other: "{n} игры" }
  }
};

function build(locale, warn) {
  const i18n = createI18n(DICTIONARIES, { warn });
  i18n.setLocale(locale);
  return i18n;
}

test("constants match the spec", () => {
  assert.equal(I18N_LOCALE_STORAGE_KEY, "tgtv-locale");
  assert.deepEqual(I18N_SUPPORTED_LOCALES, ["en", "ru"]);
  assert.equal(I18N_DEFAULT_LOCALE, "en");
});

test("returns the value for the active locale", () => {
  assert.equal(build("ru").t("common.save"), "Сохранить");
  assert.equal(build("en").t("common.save"), "Save");
});

test("interpolates named placeholders", () => {
  assert.equal(build("ru").t("common.greeting", { name: "Юрий" }), "Привет, Юрий");
});

test("leaves an unknown placeholder untouched", () => {
  assert.equal(build("en").t("common.greeting"), "Hello, {name}");
});

test("falls back to English when the Russian key is missing", () => {
  const i18n = createI18n({ en: { "a.b": "English" }, ru: {} });
  i18n.setLocale("ru");
  assert.equal(i18n.t("a.b"), "English");
});

test("falls back to the key itself and warns when no locale has it", () => {
  const seen = [];
  const i18n = createI18n({ en: {}, ru: {} }, { warn: (key) => seen.push(key) });
  i18n.setLocale("ru");
  assert.equal(i18n.t("missing.key"), "missing.key");
  assert.deepEqual(seen, ["missing.key"]);
});

test("selects the Russian plural form by count", () => {
  const i18n = build("ru");
  assert.equal(i18n.plural("games.count", 1), "1 игра");
  assert.equal(i18n.plural("games.count", 3), "3 игры");
  assert.equal(i18n.plural("games.count", 7), "7 игр");
});

test("selects the English plural form by count", () => {
  const i18n = build("en");
  assert.equal(i18n.plural("games.count", 1), "1 game");
  assert.equal(i18n.plural("games.count", 7), "7 games");
});

test("rejects an unsupported locale and falls back to the default", () => {
  const i18n = createI18n(DICTIONARIES);
  assert.equal(i18n.setLocale("de"), "en");
  assert.equal(i18n.getLocale(), "en");
});

test("formats dates in the active locale", () => {
  const date = new Date(Date.UTC(2026, 7, 22, 12, 0, 0));
  const options = { day: "2-digit", month: "long", timeZone: "UTC" };
  assert.match(build("ru").formatDate(date, options), /августа/);
  assert.match(build("en").formatDate(date, options), /August/);
});
