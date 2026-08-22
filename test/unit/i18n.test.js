const test = require("node:test");
const assert = require("node:assert/strict");

const en = require("../../public/i18n/en.js");
const ru = require("../../public/i18n/ru.js");
const { PROTECTED, FORBIDDEN, SAME_IN_BOTH } = require("../../public/i18n/glossary.js");

const LOCALES = { en, ru };

// Derived rather than hard-coded: Intl is the authority on which plural
// categories a locale actually uses (en -> one/other, ru -> one/few/many/other).
const PLURAL_FORMS = Object.fromEntries(
  Object.keys(LOCALES).map((locale) => [
    locale,
    new Intl.PluralRules(locale).resolvedOptions().pluralCategories
  ])
);

// Longest first, so stripping "Kill Team" never chews a hole in
// "All Kill Team Challenge".
const PROTECTED_BY_LENGTH = [...PROTECTED].sort((a, b) => b.length - a.length);

const HTML_ENTITY = /&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});/g;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Hyphen counts as a word character here so that "Classified" does not match
// inside "Non-Classified" -- they are separate protected terms.
function termRegExp(term) {
  return new RegExp(`(?<![\\w-])${escapeRegExp(term)}(?![\\w-])`, "g");
}

function countTerm(text, term) {
  return (text.match(termRegExp(term)) || []).length;
}

// Normalizes a dictionary value to a { form: text } map so plain strings and
// plural objects can be compared with the same code.
function formsOf(value) {
  return typeof value === "string" ? { other: value } : value;
}

function leafValues(value) {
  return typeof value === "string"
    ? [value]
    : Object.values(value).filter((item) => typeof item === "string");
}

function placeholders(text) {
  return (text.match(/\{\w+\}/g) || []).sort();
}

function residue(text) {
  let rest = text;
  for (const term of PROTECTED_BY_LENGTH) rest = rest.replace(termRegExp(term), " ");
  return rest
    .replace(/\{\w+\}/g, " ")
    .replace(/[\d\s\p{P}\p{S}]/gu, "")
    .trim();
}

test("1. dictionaries define the same keys and the same shapes", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort());
  for (const key of Object.keys(en)) {
    assert.equal(
      typeof en[key],
      typeof ru[key],
      `en.${key} and ru.${key} must both be strings or both be plural objects`
    );
  }
});

test("2. every value is non-empty and plural objects carry all required forms", () => {
  for (const [locale, dict] of Object.entries(LOCALES)) {
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value === "string") {
        assert.notEqual(value.trim(), "", `${locale}.${key} is empty`);
        continue;
      }
      assert.equal(typeof value, "object", `${locale}.${key} must be a string or a plural object`);
      for (const form of PLURAL_FORMS[locale]) {
        assert.equal(
          typeof value[form],
          "string",
          `${locale}.${key} is missing the "${form}" plural form`
        );
        assert.notEqual(value[form].trim(), "", `${locale}.${key}.${form} is empty`);
      }
    }
  }
});

test("3. protected terms survive translation verbatim", () => {
  for (const key of Object.keys(en)) {
    const sourceForms = formsOf(en[key]);
    const targetForms = formsOf(ru[key]);
    for (const [form, target] of Object.entries(targetForms)) {
      const source = sourceForms[form] ?? sourceForms.other;
      for (const term of PROTECTED) {
        const expected = countTerm(source, term);
        if (!expected) continue;
        assert.equal(
          countTerm(target, term),
          expected,
          `ru.${key} (${form}) must contain "${term}" ${expected} time(s)`
        );
      }
    }
  }
});

test("4. no forbidden translation of a protected term", () => {
  for (const [key, value] of Object.entries(ru)) {
    const text = leafValues(value).join(" ").toLowerCase();
    for (const phrase of FORBIDDEN) {
      assert.ok(!text.includes(phrase), `ru.${key} contains the forbidden phrase "${phrase}"`);
    }
  }
});

test("5. placeholders match between locales", () => {
  for (const key of Object.keys(en)) {
    const sourceForms = formsOf(en[key]);
    const targetForms = formsOf(ru[key]);
    for (const [form, target] of Object.entries(targetForms)) {
      const source = sourceForms[form] ?? sourceForms.other;
      assert.deepEqual(
        placeholders(target),
        placeholders(source),
        `ru.${key} (${form}) does not use the same placeholders as en`
      );
    }
  }
});

test("6. dictionary values are HTML-safe", () => {
  for (const [locale, dict] of Object.entries(LOCALES)) {
    for (const [key, value] of Object.entries(dict)) {
      for (const text of leafValues(value)) {
        assert.ok(!text.includes("<"), `${locale}.${key} contains a raw "<"`);
        const stripped = text.replace(HTML_ENTITY, "").replace(/&(?=\s|$)/g, "");
        assert.ok(
          !stripped.includes("&"),
          `${locale}.${key} contains a bare "&" that is not an HTML entity`
        );
      }
    }
  }
});

test("7. identical values are justified", () => {
  for (const key of Object.keys(en)) {
    const sourceForms = formsOf(en[key]);
    const targetForms = formsOf(ru[key]);
    const identical = Object.entries(targetForms).every(
      ([form, text]) => text === (sourceForms[form] ?? sourceForms.other)
    );
    if (!identical) continue;
    if (Object.prototype.hasOwnProperty.call(SAME_IN_BOTH, key)) continue;
    const leftover = leafValues(en[key]).map(residue).join("");
    assert.equal(
      leftover,
      "",
      `en.${key} looks untranslated in ru -- translate it, or add it to SAME_IN_BOTH with a reason`
    );
  }
});

test("glossary covers every protected category", () => {
  for (const term of [
    "Kill Team",
    "Approved Ops",
    "Crit Op",
    "Primary Op",
    "VP",
    "Killzone",
    "Strength of Schedule",
    "SoS",
    "Classified",
    "Non-Classified",
    "Tabletop Simulator",
    "All Kill Team Challenge",
    "Plant Devices",
    "Stake Claim",
    "Bheta-Decima",
    "2026 Q2 Dataslate",
    "Angels of Death",
    "XV26 Stealth Battlesuits"
  ]) {
    assert.ok(PROTECTED.includes(term), `"${term}" is missing from PROTECTED`);
  }
  assert.equal(PROTECTED.length, new Set(PROTECTED).size, "PROTECTED contains duplicates");
});
