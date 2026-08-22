# Russian Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Russian locale and a language toggle to the client UI, with Kill Team rules terminology protected by automated checks.

**Architecture:** Identifier-keyed dictionaries (`public/i18n/en.js`, `public/i18n/ru.js`) consumed by a small runtime (`public/i18n.js`) that exposes `t()` and `plural()` with an `ru → en → key` fallback chain. Game reference tables move out of `public/app.js` into `public/game-data.js` so the glossary can read them instead of copying them. Every screen in `public/app.js` is migrated one render function at a time; a seven-check test suite guards the dictionaries.

**Tech Stack:** Vanilla JavaScript, classic (non-module) browser scripts, CommonJS on the Node side, `node:test` + `node:assert/strict`, `Intl.PluralRules`, `Intl.DateTimeFormat`. No bundler, no dependencies added.

**Spec:** `docs/superpowers/specs/2026-08-22-russian-localization-design.md`

## Global Constraints

- No new npm dependencies. `package.json` has exactly one runtime dependency (`pg`) and it stays that way.
- `public/app.js`, `public/game-data.js`, `public/i18n.js`, `public/i18n/*.js` are **classic scripts**, not ES modules. No `import`/`export` statements. Load order is guaranteed by `defer` in `public/index.html`.
- Every file that both the browser and Node must read ends with exactly:
  ```js
  if (typeof module !== "undefined") module.exports = <THE_CONST>;
  ```
- Dictionary values are HTML-safe: no raw `<`, and `&` only inside a valid HTML entity or as a standalone word (` & `). `t()` never escapes its result; interpolated values are escaped by the caller with the existing `escapeHtml`.
- Protected terms are listed in `public/i18n/glossary.js` and must appear verbatim in Russian strings: rules terms, proper names, Tac Ops, Crit Ops, Killzones, game systems, season names, and all 48 kill team names.
- `Faction` is translated as «Фракция» **only as a field label**. The field's value is a kill team name and stays English.
- `Classified`, `Non-Classified`, `Strength of Schedule`, `SoS` stay English.
- Storage keys: `tgtv-locale` for the language, mirroring the existing `tgtv-theme`. Every `localStorage` access is wrapped in `try/catch` — the existing code does this because privacy-restricted browsers throw.
- Tests must not need a database. Everything in this plan lands in `test/unit/` and runs under `npm run test:unit`.
- Commit after every task. Commit messages use the repository's existing `feat:` / `refactor:` / `test:` prefixes.

---

### Task 1: Extract game reference tables into `public/game-data.js`

Six top-level tables in `public/app.js` are game data, not UI text. They move to their own file so `public/i18n/glossary.js` can `require` them instead of keeping a hand-copied duplicate. `venueModeOptions` keeps its English `label` for now — Task 5 converts it to `labelKey`, once the i18n runtime exists.

`killzoneOptions` and `critOpOptions` are byte-identical to `KILLZONES` and `CRIT_OPS` already exported by `src/domain/kill-teams.js`. That duplication predates this work; this task adds a test that pins the copies together so they cannot drift silently.

**Files:**
- Create: `public/game-data.js`
- Modify: `public/app.js:83-84` (remove `gameSystemOptions`), `public/app.js:190-241` (remove `tacOpOptions`, `critOpOptions`, `killzoneOptions`, `seasons`, `venueModeOptions`)
- Modify: `public/index.html:29` (add the script tag before `app.js`)
- Test: `test/unit/game-data.test.js`

**Interfaces:**
- Consumes: `KILLZONES`, `CRIT_OPS` from `src/domain/kill-teams.js`
- Produces: `public/game-data.js` exporting `{ tacOpOptions, critOpOptions, killzoneOptions, gameSystemOptions, seasons, venueModeOptions }`. In the browser these are top-level `const`s named `tacOpOptions`, `critOpOptions`, `killzoneOptions`, `gameSystemOptions`, `seasons`, `venueModeOptions` — the same identifiers `app.js` already uses, so no call site changes.

- [ ] **Step 1: Write the failing test**

Create `test/unit/game-data.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const gameData = require("../../public/game-data.js");
const { KILLZONES, CRIT_OPS } = require("../../src/domain/kill-teams");

test("game-data exposes every reference table", () => {
  assert.deepEqual(Object.keys(gameData).sort(), [
    "critOpOptions",
    "gameSystemOptions",
    "killzoneOptions",
    "seasons",
    "tacOpOptions",
    "venueModeOptions"
  ]);
});

test("tac ops list is complete", () => {
  assert.deepEqual(gameData.tacOpOptions, [
    "Plant Devices",
    "Steal Intelligence",
    "Track Enemy",
    "Flank",
    "Retrieval",
    "Scout Enemy Movement",
    "Plant Banner",
    "Martyrs",
    "Envoy",
    "Rout",
    "Sweep & Clear",
    "Dominate"
  ]);
});

// The client and the domain module each carry their own copy of these two
// lists. Neither can require the other (one is a browser script, one is
// server-side), so this test is what keeps the copies honest.
test("killzones match the domain module", () => {
  assert.deepEqual(gameData.killzoneOptions, KILLZONES);
});

test("crit ops match the domain module", () => {
  assert.deepEqual(gameData.critOpOptions, CRIT_OPS);
});

test("game systems and seasons carry the protected product names", () => {
  assert.deepEqual(gameData.gameSystemOptions, ["Warhammer 40k Kill Team"]);
  assert.deepEqual(
    gameData.seasons.map((season) => season.name),
    ["2026 Q2 Dataslate"]
  );
});

test("venue modes cover both keys", () => {
  assert.deepEqual(gameData.venueModeOptions.map((item) => item.key), ["tts", "irl"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/unit/game-data.test.js`
Expected: FAIL — `Cannot find module '../../public/game-data.js'`

- [ ] **Step 3: Create `public/game-data.js`**

```js
// Game reference data shared by the browser app and the Node test suite.
// These are values, not interface copy: they are rendered as <option> text
// *and* stored in the database, so translating them would break already
// recorded games. `public/i18n/glossary.js` reads this file to build the
// protected-term list.

const tacOpOptions = [
  "Plant Devices",
  "Steal Intelligence",
  "Track Enemy",
  "Flank",
  "Retrieval",
  "Scout Enemy Movement",
  "Plant Banner",
  "Martyrs",
  "Envoy",
  "Rout",
  "Sweep & Clear",
  "Dominate"
];

const critOpOptions = [
  "Secure",
  "Loot",
  "Transmission",
  "Orb",
  "Stake Claim",
  "Energy Cells",
  "Download",
  "Data",
  "Reboot"
];

const killzoneOptions = [
  "Volkus",
  "Gallowdark",
  "Bheta-Decima",
  "Octarius",
  "Tomb World",
  "WTC ITD",
  "WTC Open",
  "Non-specific"
];

const gameSystemOptions = ["Warhammer 40k Kill Team"];

const seasons = [
  {
    id: "2026-q2-dataslate",
    name: "2026 Q2 Dataslate",
    startsAt: null,
    endsAt: null
  }
];

const venueModeOptions = [
  { key: "tts", label: "Tabletop Simulator" },
  { key: "irl", label: "In Real Life" }
];

if (typeof module !== "undefined") {
  module.exports = {
    tacOpOptions,
    critOpOptions,
    killzoneOptions,
    gameSystemOptions,
    seasons,
    venueModeOptions
  };
}
```

- [ ] **Step 4: Delete the moved tables from `public/app.js`**

Delete the line `const gameSystemOptions = ["Warhammer 40k Kill Team"];` (currently `app.js:84`). Delete the `tacOpOptions`, `critOpOptions`, `killzoneOptions`, `seasons` and `venueModeOptions` declarations (currently `app.js:190-241`). Leave `singleEliminationSizes`, `MAX_TOURNAMENT_RULES_PDF_SIZE`, `TOURNAMENT_AUTOSAVE_TEXT_DELAY_MS`, `TOURNAMENT_AUTOSAVE_CHANGE_DELAY_MS`, `opLabels`, `killTeamOptions` and `killTeamAliases` where they are.

Verify nothing else was removed:

Run: `grep -n "^const tacOpOptions\|^const critOpOptions\|^const killzoneOptions\|^const gameSystemOptions\|^const seasons\|^const venueModeOptions" public/app.js`
Expected: no output.

- [ ] **Step 5: Add the script tag to `public/index.html`**

Replace this line:

```html
    <script src="/app.js?v=20260820-feedback-pack" defer></script>
```

with:

```html
    <script src="/game-data.js?v=20260822-i18n" defer></script>
    <script src="/app.js?v=20260820-feedback-pack" defer></script>
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/unit/game-data.test.js`
Expected: PASS, 6 tests.

Run: `npm run test:unit`
Expected: PASS, no regressions.

- [ ] **Step 7: Verify the app still boots**

Run: `npm start`, open `http://127.0.0.1:3000`, sign in, open a game's result form, and confirm the `Killzone` and `Crit Op` dropdowns are populated. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add public/game-data.js public/app.js public/index.html test/unit/game-data.test.js
git commit -m "refactor: extract game reference tables into public/game-data.js"
```

---

### Task 2: i18n runtime

The runtime is a factory so Node tests can build an instance over fixture dictionaries, while the browser gets a singleton built from the global dictionaries. `t()` and `plural()` become top-level functions that `app.js` calls directly.

**Files:**
- Create: `public/i18n.js`, `public/i18n/en.js`, `public/i18n/ru.js`
- Modify: `public/index.html` (three more script tags)
- Test: `test/unit/i18n-runtime.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `createI18n(dictionaries, options)` → `{ t, plural, getLocale, setLocale, formatDate }`
  - `t(key, vars)` → `string`
  - `plural(key, count, vars)` → `string`; `count` is injected into the template as `{n}`
  - Constants `I18N_LOCALE_STORAGE_KEY = "tgtv-locale"`, `I18N_SUPPORTED_LOCALES = ["en", "ru"]`, `I18N_DEFAULT_LOCALE = "en"`
  - `i18n` — the browser singleton, used by `applyLocale()` in Task 4
  - Dictionaries `TGTV_I18N_EN` and `TGTV_I18N_RU`, exported for Node as the bare object

- [ ] **Step 1: Write the failing test**

Create `test/unit/i18n-runtime.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/unit/i18n-runtime.test.js`
Expected: FAIL — `Cannot find module '../../public/i18n.js'`

- [ ] **Step 3: Create `public/i18n.js`**

```js
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
```

- [ ] **Step 4: Create the two dictionaries**

`public/i18n/en.js`:

```js
// English is the reference dictionary: every key must exist here, and the
// glossary tests compare Russian values against these.
// Keys are flat and dotted, grouped by screen with comment separators.

const TGTV_I18N_EN = {
  // -- common ---------------------------------------------------------------
  "common.langToggle": "Switch to Russian"
};

if (typeof module !== "undefined") module.exports = TGTV_I18N_EN;
```

`public/i18n/ru.js`:

```js
// Russian dictionary. Keys mirror en.js exactly.
// Protected Kill Team terminology must appear verbatim -- see
// public/i18n/glossary.js and test/unit/i18n.test.js.

const TGTV_I18N_RU = {
  // -- common ---------------------------------------------------------------
  "common.langToggle": "Переключить на английский"
};

if (typeof module !== "undefined") module.exports = TGTV_I18N_RU;
```

`common.langToggle` reads correctly in both directions: the string is looked up in the *active* locale, and the toggle always targets the other one.

- [ ] **Step 5: Wire the scripts into `public/index.html`**

Replace:

```html
    <script src="/game-data.js?v=20260822-i18n" defer></script>
    <script src="/app.js?v=20260820-feedback-pack" defer></script>
```

with:

```html
    <script src="/game-data.js?v=20260822-i18n" defer></script>
    <script src="/i18n/en.js?v=20260822-i18n" defer></script>
    <script src="/i18n/ru.js?v=20260822-i18n" defer></script>
    <script src="/i18n.js?v=20260822-i18n" defer></script>
    <script src="/app.js?v=20260820-feedback-pack" defer></script>
```

`public/i18n/glossary.js` is deliberately **not** listed: it is a Node-only file for the tests.

- [ ] **Step 6: Run the tests**

Run: `node --test test/unit/i18n-runtime.test.js`
Expected: PASS, 10 tests.

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Verify the browser loads all four scripts**

Run `npm start`, open `http://127.0.0.1:3000`, and in the browser console evaluate `t("common.langToggle")`.
Expected: `"Switch to Russian"`. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add public/i18n.js public/i18n/en.js public/i18n/ru.js public/index.html test/unit/i18n-runtime.test.js
git commit -m "feat: add i18n runtime and empty en/ru dictionaries"
```

---

### Task 3: Glossary and the seven dictionary checks

This is the gate every later task runs against. With near-empty dictionaries all seven checks pass trivially — that is expected. Their value appears as strings arrive.

**Files:**
- Create: `public/i18n/glossary.js`, `test/unit/i18n.test.js`
- Modify: `docs/i18n-glossary.md` (create)

**Interfaces:**
- Consumes: `public/game-data.js` (Task 1), `public/i18n/en.js` and `public/i18n/ru.js` (Task 2), `src/domain/kill-teams.js`
- Produces: `public/i18n/glossary.js` exporting `{ PROTECTED, RULES_TERMS, PROPER_NAMES, FORBIDDEN, SAME_IN_BOTH }`. `PROTECTED` is a deduplicated `string[]`. `SAME_IN_BOTH` is an object mapping a dictionary key to a plain-language reason; later tasks add entries to it.

- [ ] **Step 1: Write the failing test**

Create `test/unit/i18n.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/unit/i18n.test.js`
Expected: FAIL — `Cannot find module '../../public/i18n/glossary.js'`

- [ ] **Step 3: Create `public/i18n/glossary.js`**

```js
// Single source of truth for translation policy. Node-only: this file is never
// listed in index.html, and it requires from src/ so the term lists are read
// from where they already live instead of being copied by hand.
//
// Policy and rationale: docs/i18n-glossary.md
// Enforcement: test/unit/i18n.test.js

const { KILL_TEAMS, KILLZONES, CRIT_OPS } = require("../../src/domain/kill-teams");
const { tacOpOptions, gameSystemOptions, seasons } = require("../game-data.js");

// Rules terminology a player checks against the rulebook. Plural forms are
// listed explicitly: the word-boundary check treats "Tac Ops" and "Tac Op" as
// different terms.
const RULES_TERMS = [
  "Kill Team",
  "Kill Teams",
  "Approved Ops",
  "Crit Op",
  "Crit Ops",
  "Kill Op",
  "Kill Ops",
  "Tac Op",
  "Tac Ops",
  "Primary Op",
  "Primary Ops",
  "VP",
  "Killzone",
  "Killzones",
  "Dataslate",
  "Elo",
  "Strength of Schedule",
  "SoS"
];

// Product and feature names.
const PROPER_NAMES = [
  "Warhammer 40k Kill Team",
  "Tabletop Simulator",
  "All Kill Team Challenge",
  "Classified",
  "Non-Classified"
];

const PROTECTED = [
  ...new Set([
    ...RULES_TERMS,
    ...PROPER_NAMES,
    ...tacOpOptions,
    ...CRIT_OPS,
    ...KILLZONES,
    ...gameSystemOptions,
    ...seasons.map((season) => season.name),
    ...KILL_TEAMS
  ])
];

// Russian renderings that must never appear: each one is a protected term that
// somebody translated anyway.
const FORBIDDEN = [
  "килл тим",
  "килл-тим",
  "убойная команда",
  "очки победы",
  "крит оп",
  "критическая операция",
  "зона убийства"
];

// Keys whose Russian value is intentionally identical to the English one, with
// the reason. Anything not listed here and not made purely of protected terms
// fails check 7.
const SAME_IN_BOTH = {};

module.exports = { PROTECTED, RULES_TERMS, PROPER_NAMES, FORBIDDEN, SAME_IN_BOTH };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/unit/i18n.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write `docs/i18n-glossary.md`**

```markdown
# Глоссарий локализации

Политика перевода интерфейса. Списки терминов не дублируются здесь — они лежат
в `public/i18n/glossary.js` и проверяются в `test/unit/i18n.test.js`.

## Что не переводится

**Термины правил Kill Team.** Игрок сверяет их с рулбуком; перевод разорвал бы
связь с источником. `RULES_TERMS` в `glossary.js`.

**Имена собственные.** Названия продуктов и фич: `Warhammer 40k Kill Team`,
`Tabletop Simulator`, `All Kill Team Challenge`, а также `Classified` и
`Non-Classified` — это классификация отрядов внутри All Kill Team Challenge,
имя собственное фичи проекта, а не термин правил.

**Strength of Schedule и SoS.** Остаются английскими по решению от 2026-08-22.

**Tac Ops, Crit Ops, Killzones, названия отрядов, названия сезонов.** Запрет не
только терминологический, но и технический: эти значения одновременно видны в
интерфейсе и сохраняются как данные. `killzone` лежит в БД колонкой `TEXT`,
названия Tac Op служат ключами агрегации в статистике, а имена отрядов
совпадают с именами файлов в `public/kill-team-logos/`. Перевод пункта списка
изменил бы сохраняемое значение и разошёлся бы с уже записанными играми.

## Что переводится

Турнирный слой: раунд, таблица, швейцарка, Бухгольц, личная встреча, бай,
посев, турнирные очки, винрейт, рейтинг, подбор соперника.

`Faction` переводится как «Фракция» — **только подпись поля**. Значение поля
это название отряда, оно защищено.

## Как это проверяется

Семь проверок в `test/unit/i18n.test.js`. Ключевые для терминологии:

- проверка 3 — защищённый термин обязан остаться в русской строке дословно и
  столько же раз;
- проверка 4 — блэклист `FORBIDDEN` ловит перевод в обход дословного
  совпадения, например «килл тим» в строке, где английский оригинал писал
  `kill team` в нижнем регистре;
- проверка 7 — строка, совпадающая в обеих локалях, обязана состоять только из
  защищённых терминов или быть внесена в `SAME_IN_BOTH` с обоснованием.

Пополняйте `FORBIDDEN` по мере находок при вычитке.
```

- [ ] **Step 6: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/i18n/glossary.js test/unit/i18n.test.js docs/i18n-glossary.md
git commit -m "test: add protected-term glossary and dictionary checks"
```

---

### Task 4: Language toggle

**Files:**
- Modify: `public/index.html:28` (wrap both floating buttons)
- Modify: `public/styles.css:913-936` (introduce `.floating-controls`), `public/styles.css:2973-2981` (mobile sizing)
- Modify: `public/app.js:7857-7892` (add locale functions next to the theme ones and extend the bootstrap)

**Interfaces:**
- Consumes: `i18n`, `t`, `I18N_LOCALE_STORAGE_KEY`, `I18N_SUPPORTED_LOCALES` from Task 2
- Produces: `savedLocalePreference()` → `"en" | "ru"`, `applyLocale(locale)`, `wireLocaleToggle()`. Later tasks rely on `render()` being called on every locale change, so no screen needs its own switch handling.

- [ ] **Step 1: Update the markup in `public/index.html`**

Replace:

```html
    <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch theme" title="Switch theme"></button>
```

with:

```html
    <div class="floating-controls">
      <button class="lang-toggle" type="button" data-lang-toggle></button>
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch theme" title="Switch theme"></button>
    </div>
```

- [ ] **Step 2: Update `public/styles.css`**

Replace the block at `styles.css:913-936`:

```css
.theme-toggle {
  position: fixed;
  top: 14px;
  right: 18px;
  z-index: 60;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  color: var(--ink);
  background: var(--panel-2);
  box-shadow: var(--shadow);
  font-size: 22px;
  line-height: 1;
}

.theme-toggle:hover,
.theme-toggle:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
}
```

with:

```css
.floating-controls {
  position: fixed;
  top: 14px;
  right: 18px;
  z-index: 60;
  display: flex;
  gap: 8px;
}

.theme-toggle,
.lang-toggle {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  color: var(--ink);
  background: var(--panel-2);
  box-shadow: var(--shadow);
  line-height: 1;
}

.theme-toggle {
  font-size: 22px;
}

.lang-toggle {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.theme-toggle:hover,
.theme-toggle:focus-visible,
.lang-toggle:hover,
.lang-toggle:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
}
```

Replace the mobile block at `styles.css:2973-2981`:

```css
@media (max-width: 560px) {
  .theme-toggle {
    top: 10px;
    right: 10px;
  }

  .topbar {
    padding-right: 64px;
  }
}
```

with:

```css
@media (max-width: 560px) {
  .floating-controls {
    top: 10px;
    right: 10px;
    gap: 6px;
  }

  .theme-toggle,
  .lang-toggle {
    width: 38px;
    height: 38px;
  }

  .theme-toggle {
    font-size: 19px;
  }

  .lang-toggle {
    font-size: 12px;
  }

  .topbar {
    padding-right: 92px;
  }
}
```

- [ ] **Step 3: Add the locale functions to `public/app.js`**

Insert immediately after `wireThemeToggle()` (currently ending at `app.js:7888`):

```js
function savedLocalePreference() {
  try {
    const saved = window.localStorage.getItem(I18N_LOCALE_STORAGE_KEY);
    if (I18N_SUPPORTED_LOCALES.includes(saved)) return saved;
  } catch {
    // Local storage can be unavailable in privacy-restricted browsers.
  }
  const preferred = window.navigator?.languages?.[0] || window.navigator?.language || "";
  return String(preferred).toLowerCase().startsWith("ru") ? "ru" : "en";
}

function applyLocale(locale) {
  const selected = i18n.setLocale(locale);
  document.documentElement.lang = selected;
  const button = document.querySelector("[data-lang-toggle]");
  if (!button) return;
  button.textContent = selected === "ru" ? "EN" : "RU";
  const label = t("common.langToggle");
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function wireLocaleToggle() {
  document.querySelector("[data-lang-toggle]")?.addEventListener("click", () => {
    const next = i18n.getLocale() === "ru" ? "en" : "ru";
    try {
      window.localStorage.setItem(I18N_LOCALE_STORAGE_KEY, next);
    } catch {
      // The language still applies to the current page when storage is blocked.
    }
    applyLocale(next);
    render();
  });
}
```

- [ ] **Step 4: Extend the bootstrap at the bottom of `public/app.js`**

Replace:

```js
applyTheme(savedThemePreference());
wireThemeToggle();
boot();
```

with:

```js
applyTheme(savedThemePreference());
wireThemeToggle();
applyLocale(savedLocalePreference());
wireLocaleToggle();
boot();
```

- [ ] **Step 5: Verify in the browser**

Run `npm start` and open `http://127.0.0.1:3000`.

- The button left of the theme toggle reads `RU` (assuming an English browser), with the tooltip "Switch to Russian".
- Click it: the label becomes `EN`, the tooltip becomes "Переключить на английский", `<html lang>` becomes `ru`.
- Reload: the choice persists.
- In devtools, run `localStorage.removeItem("tgtv-locale")` and reload with the browser language set to Russian: the button reads `EN`.
- Resize to 360px wide: both buttons shrink, and the topbar's brand text does not slide under them.

Stop the server.

- [ ] **Step 6: Run the unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "feat: add language toggle next to the theme toggle"
```

---

### Task 5: Convert the module-level label tables to keys

`standingsTiebreakerOptions`, `opLabels` and `venueModeOptions` are evaluated once when the file loads. Any English text baked into them would survive a language switch until a page reload. They must hold keys and resolve through `t()` at render time. This is done before any screen so the mistake cannot be copied around.

**Files:**
- Modify: `public/app.js:55-81` (`standingsTiebreakerOptions`), `public/app.js:89-93` (`opLabels`)
- Modify: `public/game-data.js` (`venueModeOptions`)
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`
- Modify: `test/unit/game-data.test.js`

**Interfaces:**
- Consumes: `t` (Task 2)
- Produces: `standingsTiebreakerOptions[].labelKey` and `.descriptionKey`; `opLabels` maps `crit`/`kill`/`tac` to dictionary keys; `venueModeOptions[].labelKey`. Every consumer wraps the value in `t()`.

- [ ] **Step 1: Add the keys to `public/i18n/en.js`**

```js
  // -- tiebreakers ----------------------------------------------------------
  "tiebreaker.strengthOfSchedule.label": "Strength of Schedule",
  "tiebreaker.strengthOfSchedule.description":
    "Sum of the Tournament Points earned by every opponent the player faced.",
  "tiebreaker.buchholz.label": "Buchholz",
  "tiebreaker.buchholz.description":
    "Sum of opponents' Tournament Points after excluding the highest and lowest opponent totals. It is 0 until the player has faced at least three opponents.",
  "tiebreaker.headToHead.label": "Head-to-head",
  "tiebreaker.headToHead.description":
    "If the tied players faced each other, the winner of their direct match ranks higher. A draw or no direct match does not break the tie.",
  "tiebreaker.totalVp.label": "Total VP",
  "tiebreaker.totalVp.description":
    "Total Victory Points scored by the player across all completed tournament matches.",
  "tiebreaker.vpDiff.label": "VP Diff",
  "tiebreaker.vpDiff.description":
    "The player's total VP minus their opponents' total VP across all completed tournament matches.",

  // -- ops ------------------------------------------------------------------
  "op.crit": "Crit Op",
  "op.kill": "Kill Op",
  "op.tac": "Tac Op",

  // -- venue ----------------------------------------------------------------
  "venue.tts": "Tabletop Simulator",
  "venue.irl": "In Real Life",
```

- [ ] **Step 2: Add the same keys to `public/i18n/ru.js`**

```js
  // -- tiebreakers ----------------------------------------------------------
  "tiebreaker.strengthOfSchedule.label": "Strength of Schedule",
  "tiebreaker.strengthOfSchedule.description":
    "Сумма турнирных очков всех соперников, с которыми играл игрок.",
  "tiebreaker.buchholz.label": "Бухгольц",
  "tiebreaker.buchholz.description":
    "Сумма турнирных очков соперников без учёта лучшего и худшего результата. Равен 0, пока игрок не сыграл минимум с тремя соперниками.",
  "tiebreaker.headToHead.label": "Личная встреча",
  "tiebreaker.headToHead.description":
    "Если игроки с равными очками играли друг с другом, выше становится победитель личной встречи. Ничья или отсутствие личной встречи тай-брейк не решает.",
  "tiebreaker.totalVp.label": "Всего VP",
  "tiebreaker.totalVp.description":
    "Сумма VP, набранных игроком во всех завершённых матчах турнира.",
  "tiebreaker.vpDiff.label": "Разница VP",
  "tiebreaker.vpDiff.description":
    "Разность между VP игрока и VP его соперников во всех завершённых матчах турнира.",

  // -- ops ------------------------------------------------------------------
  "op.crit": "Crit Op",
  "op.kill": "Kill Op",
  "op.tac": "Tac Op",

  // -- venue ----------------------------------------------------------------
  "venue.tts": "Tabletop Simulator",
  "venue.irl": "Вживую",
```

- [ ] **Step 3: Register the intentionally identical keys in `SAME_IN_BOTH`**

In `public/i18n/glossary.js`, replace `const SAME_IN_BOTH = {};` with:

```js
const SAME_IN_BOTH = {
  "tiebreaker.strengthOfSchedule.label": "Strength of Schedule stays English by decision.",
  "op.crit": "Rules term.",
  "op.kill": "Rules term.",
  "op.tac": "Rules term.",
  "venue.tts": "Product name."
};
```

Note: check 7 would already accept `op.crit`, `op.tac` and `venue.tts` because their values are nothing but protected terms. They are listed anyway so the intent is explicit rather than incidental.

- [ ] **Step 4: Run the dictionary checks**

Run: `node --test test/unit/i18n.test.js`
Expected: PASS. If check 3 fails on `tiebreaker.totalVp.label`, the Russian value is missing the literal `VP` — fix the dictionary, not the test.

- [ ] **Step 5: Convert the tables**

In `public/app.js`, replace `standingsTiebreakerOptions` (`app.js:55-81`) with:

```js
const standingsTiebreakerOptions = [
  {
    key: "strength_of_schedule",
    labelKey: "tiebreaker.strengthOfSchedule.label",
    descriptionKey: "tiebreaker.strengthOfSchedule.description"
  },
  {
    key: "buchholz",
    labelKey: "tiebreaker.buchholz.label",
    descriptionKey: "tiebreaker.buchholz.description"
  },
  {
    key: "head_to_head",
    labelKey: "tiebreaker.headToHead.label",
    descriptionKey: "tiebreaker.headToHead.description"
  },
  {
    key: "total_vp",
    labelKey: "tiebreaker.totalVp.label",
    descriptionKey: "tiebreaker.totalVp.description"
  },
  {
    key: "vp_diff",
    labelKey: "tiebreaker.vpDiff.label",
    descriptionKey: "tiebreaker.vpDiff.description"
  }
];
```

Replace `opLabels` (`app.js:89-93`) with:

```js
const opLabels = {
  crit: "op.crit",
  kill: "op.kill",
  tac: "op.tac"
};
```

In `public/game-data.js`, replace `venueModeOptions` with:

```js
const venueModeOptions = [
  { key: "tts", labelKey: "venue.tts" },
  { key: "irl", labelKey: "venue.irl" }
];
```

- [ ] **Step 6: Update every consumer**

Find them:

Run: `grep -n "standingsTiebreakerOptions\|opLabels\|venueModeOptions" public/app.js`

Wrap each label and description read in `t()`. The known sites and their replacements:

`app.js:1051` — venue mode label:

```js
  return t(venueModeOptions.find((item) => item.key === mode)?.labelKey || "venue.tts");
```

`app.js:5921` and `app.js:6122` — the venue `<option>` loops. Replace `escapeHtml(option.label)` with `escapeHtml(t(option.labelKey))`.

For `standingsTiebreakerOptions`, replace `option.label` with `t(option.labelKey)` and `option.description` with `t(option.descriptionKey)` at every site the grep reports.

For `opLabels`, every read such as `opLabels[key]` becomes `t(opLabels[key])`.

Also replace the two inline lookalike tables at `app.js:1092-1093` (`total_vp`/`vp_diff` labels) with `t("tiebreaker.totalVp.label")` and `t("tiebreaker.vpDiff.label")` so there is one source for those strings.

- [ ] **Step 7: Update `test/unit/game-data.test.js`**

Replace the venue-mode test with:

```js
test("venue modes cover both keys and reference dictionary labels", () => {
  assert.deepEqual(gameData.venueModeOptions, [
    { key: "tts", labelKey: "venue.tts" },
    { key: "irl", labelKey: "venue.irl" }
  ]);
});
```

- [ ] **Step 8: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 9: Verify the switch is live**

Run `npm start`, open a tournament's settings where the tiebreaker list is shown, and toggle the language **without reloading**. The tiebreaker labels and descriptions must change immediately. Confirm `Strength of Schedule`, `Crit Op`, `Kill Op`, `Tac Op` and `Tabletop Simulator` stay English, and that `Total VP` becomes «Всего VP». Stop the server.

- [ ] **Step 10: Commit**

```bash
git add public/app.js public/game-data.js public/i18n/en.js public/i18n/ru.js public/i18n/glossary.js test/unit/game-data.test.js
git commit -m "refactor: resolve label tables through t() at render time"
```

---

## Screen migration tasks (6-16)

Tasks 6 through 16 share one procedure. Read this before starting any of them; each task then names only its own files, ranges, namespace and specifics.

**The procedure for one screen:**

1. Read the render function's full range.
2. List every user-visible literal in it: text between `>` and `<` in the template, plus `placeholder=`, `title=`, `aria-label=`, `alt=` attribute values, plus any string in a ternary that produces displayed text.
3. Add a key per literal to `public/i18n/en.js` under the task's namespace, with the current English text as the value, verbatim.
4. Add the same keys to `public/i18n/ru.js` with the Russian translation. Protected terms stay English inside the Russian sentence.
5. Replace each literal in `public/app.js` with `t("<key>")`, or `plural("<key>", count)` for counted text.
6. Run `node --test test/unit/i18n.test.js` — this is the gate. Check 3 catches a translated protected term, check 5 catches a lost `{n}`, check 7 catches a forgotten translation.
7. Run `npm run test:unit`.
8. Open the screen in both languages and look at it. Russian runs ~10-15% longer than English; fix any overflow in `public/styles.css`, never by shortening a translation into something wrong.
9. Commit.

**Naming keys:** `<namespace>.<area>.<what>`, lowerCamelCase segments. A button is `.action`, a heading `.title`, explanatory copy `.hint`, an empty state `.empty`, a column header `.column`. Example: `games.result.critOp.label`.

**Interpolation:** never build a sentence by concatenating translated fragments — word order differs between the languages. `` `${count} games` `` becomes `plural("games.count", count)` with the dictionary holding `{n} games`, not `t("games.count") + count`.

**Do not touch:** values rendered from `game-data.js` or from API data, and anything already passing through `escapeHtml()` from a variable. Those are data.

---

### Task 6: Common vocabulary and navigation

**Files:**
- Modify: `public/app.js:1735-1745` (`renderShell` sidebar), and the shared helpers `navButton`, `setMessage`, `escapeHtml` call sites that carry literals
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t` (Task 2)
- Produces: the `common.*` and `nav.*` namespaces. Every later task reuses `common.save`, `common.cancel`, `common.delete`, `common.edit`, `common.close`, `common.confirm`, `common.loading`, `common.empty`, `common.yes`, `common.no` instead of redefining them.

- [ ] **Step 1: Add the shared vocabulary to both dictionaries**

`public/i18n/en.js`:

```js
  // -- common ---------------------------------------------------------------
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.loading": "Loading...",
  "common.empty": "Nothing here yet.",
  "common.yes": "Yes",
  "common.no": "No",

  // -- nav ------------------------------------------------------------------
  "nav.leaderboard": "Leaderboard",
  "nav.matchmaking": "Matchmaking",
  "nav.games": "Games",
  "nav.tournaments": "Tournaments",
  "nav.stats": "Stats",
  "nav.profile": "Profile",
  "nav.challenge": "All Kill Team Challenge",
  "nav.feedback": "Feedback",
  "nav.signOut": "Sign out",
  "nav.openNavigation": "Open navigation",
  "nav.closeNavigation": "Close navigation",
  "nav.openProfile": "Open profile",
```

`public/i18n/ru.js`:

```js
  // -- common ---------------------------------------------------------------
  "common.save": "Сохранить",
  "common.cancel": "Отмена",
  "common.delete": "Удалить",
  "common.edit": "Изменить",
  "common.close": "Закрыть",
  "common.confirm": "Подтвердить",
  "common.loading": "Загрузка...",
  "common.empty": "Пока пусто.",
  "common.yes": "Да",
  "common.no": "Нет",

  // -- nav ------------------------------------------------------------------
  "nav.leaderboard": "Таблица лидеров",
  "nav.matchmaking": "Подбор соперника",
  "nav.games": "Игры",
  "nav.tournaments": "Турниры",
  "nav.stats": "Статистика",
  "nav.profile": "Профиль",
  "nav.challenge": "All Kill Team Challenge",
  "nav.feedback": "Обратная связь",
  "nav.signOut": "Выйти",
  "nav.openNavigation": "Открыть меню",
  "nav.closeNavigation": "Закрыть меню",
  "nav.openProfile": "Открыть профиль",
```

Add to `SAME_IN_BOTH` in `public/i18n/glossary.js`:

```js
  "nav.challenge": "Feature name.",
```

- [ ] **Step 2: Run the dictionary checks**

Run: `node --test test/unit/i18n.test.js`
Expected: PASS.

- [ ] **Step 3: Replace the sidebar literals in `renderShell`**

At `app.js:1735-1745`, replace:

```js
        ${navButton("top", "Leaderboard")}
        ${navButton("play", "Matchmaking")}
        ${navButton("games", "Games")}
        ${navButton("tournaments", "Tournaments")}
        ${navButton("statistics", "Stats")}
        ${navButton("profile", "Profile")}
        ${navButton("challenge", "All Kill Team Challenge")}
        ${navButton("feedback", "Feedback")}
        <button class="nav-button sidebar-logout" data-logout>Sign out</button>
```

with:

```js
        ${navButton("top", t("nav.leaderboard"))}
        ${navButton("play", t("nav.matchmaking"))}
        ${navButton("games", t("nav.games"))}
        ${navButton("tournaments", t("nav.tournaments"))}
        ${navButton("statistics", t("nav.stats"))}
        ${navButton("profile", t("nav.profile"))}
        ${navButton("challenge", t("nav.challenge"))}
        ${navButton("feedback", t("nav.feedback"))}
        <button class="nav-button sidebar-logout" data-logout>${t("nav.signOut")}</button>
```

Replace the three `aria-label` literals in the same function: `"Open navigation"` → `${t("nav.openNavigation")}`, `"Close navigation"` → `${t("nav.closeNavigation")}`, `"Open profile"` → `${t("nav.openProfile")}`.

- [ ] **Step 4: Replace the shared loading strings**

`app.js:568` and `app.js:817` render `Loading...` / `Loading tournament...`. Replace `app.js:568`'s fallback markup with `${t("common.loading")}` and leave `Loading tournament...` for Task 10, which owns that screen.

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Verify in the browser**

Run `npm start`, sign in, toggle to Russian: the whole sidebar switches, `All Kill Team Challenge` stays English. Check the sidebar at 360px — «Подбор соперника» is the longest item and must not wrap into the content area. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js public/i18n/glossary.js
git commit -m "feat: localize navigation and shared vocabulary"
```

---

### Task 7: Auth screen

**Files:**
- Modify: `public/app.js:1570-1706` (`renderAuth`)
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t`, `common.*` (Task 6)
- Produces: the `auth.*` namespace.

- [ ] **Step 1: Enumerate the literals**

Run: `sed -n '1570,1706p' public/app.js`

Every literal in this range needs a key, including the ones built above the template: `passwordFieldMarkup("Confirm password", …)` at `app.js:1595`, the tab labels `Sign in` / `Register` / `Admin` at `app.js:1610-1612`, the brand copy at `app.js:1603-1604`, and the `title`/`subtitle` variables computed earlier in the function.

- [ ] **Step 2: Add the keys to both dictionaries**

Worked example for the brand copy — `public/i18n/en.js`:

```js
  // -- auth -----------------------------------------------------------------
  "auth.brand.title": "TGTV Ranking Tournament System",
  "auth.brand.tagline": "Kill Team challenges, Approved Ops results, and player ratings in one place.",
  "auth.tab.signIn": "Sign in",
  "auth.tab.register": "Register",
  "auth.tab.admin": "Admin",
  "auth.field.confirmPassword": "Confirm password",
```

`public/i18n/ru.js`:

```js
  // -- auth -----------------------------------------------------------------
  "auth.brand.title": "TGTV Ranking Tournament System",
  "auth.brand.tagline": "Kill Team челленджи, результаты Approved Ops и рейтинги игроков в одном месте.",
  "auth.tab.signIn": "Вход",
  "auth.tab.register": "Регистрация",
  "auth.tab.admin": "Админ",
  "auth.field.confirmPassword": "Подтвердите пароль",
```

`auth.brand.title` is the product name; add it to `SAME_IN_BOTH` with the reason `"Product name."`.

Continue for every remaining literal in the range.

- [ ] **Step 3: Replace the literals**

Worked example — replace `app.js:1603-1604`:

```js
          <h1>TGTV Ranking Tournament System</h1>
          <p>Kill Team challenges, Approved Ops results, and player ratings in one place.</p>
```

with:

```js
          <h1>${t("auth.brand.title")}</h1>
          <p>${t("auth.brand.tagline")}</p>
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Verify in the browser**

Run `npm start`, sign out, and toggle the language on the auth screen. The toggle must be visible and working while signed out. Confirm `Kill Team` and `Approved Ops` stay English in the Russian tagline. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js public/i18n/glossary.js
git commit -m "feat: localize the auth screen"
```

---

### Task 8: Matchmaking screen

**Files:**
- Modify: `public/app.js:1853-2140` (`renderPlay`), `public/app.js:4296-4462` (`renderSearchResults`)
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t`, `plural`, `common.*`
- Produces: the `play.*` namespace.

- [ ] **Step 1: Enumerate the literals**

Run: `sed -n '1853,2140p' public/app.js` and `sed -n '4296,4462p' public/app.js`

Known ones: `"Waiting for Approved Ops result"` (`app.js:1968` and `app.js:2072`), `Enter result` / `Edit result` / `Review result` (`app.js:1970-1974`), `"You"` (`app.js:1960`), and the search placeholder `"Start typing a player name or contact."` (`app.js:4265`).

- [ ] **Step 2: Add the keys**

Worked example — `public/i18n/en.js`:

```js
  // -- play -----------------------------------------------------------------
  "play.game.waitingForResult": "Waiting for Approved Ops result",
  "play.game.you": "You",
  "play.action.enterResult": "Enter result",
  "play.action.editResult": "Edit result",
  "play.action.reviewResult": "Review result",
  "play.search.hint": "Start typing a player name or contact.",
```

`public/i18n/ru.js`:

```js
  // -- play -----------------------------------------------------------------
  "play.game.waitingForResult": "Ожидание результата Approved Ops",
  "play.game.you": "Вы",
  "play.action.enterResult": "Ввести результат",
  "play.action.editResult": "Изменить результат",
  "play.action.reviewResult": "Проверить результат",
  "play.search.hint": "Начните вводить имя игрока или контакт.",
```

- [ ] **Step 3: Replace the literals**

Worked example — `app.js:1968`:

```js
      : "Waiting for Approved Ops result";
```

becomes:

```js
      : t("play.game.waitingForResult");
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS. Check 3 fails if `Approved Ops` was translated in the Russian value.

- [ ] **Step 5: Verify and commit**

Open the matchmaking screen in both languages, then:

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js
git commit -m "feat: localize the matchmaking screen"
```

---

### Task 9: Games, result forms and game detail

**Files:**
- Modify: `public/app.js:3004-3183` (`renderGames`, `renderGamePlayerSuggestions`), `public/app.js:4117-4295` (`renderGameDetail`), `public/app.js:4463-4711` (`renderResultForm`, `renderResultReview`)
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t`, `plural`, `op.*` (Task 5)
- Produces: the `games.*` namespace.

- [ ] **Step 1: Enumerate the literals**

Run: `sed -n '3004,3183p' public/app.js`, `sed -n '4117,4295p' public/app.js`, `sed -n '4463,4711p' public/app.js`

This range holds the densest Kill Team terminology in the app: the `Approved Ops result` heading (`app.js:4476`), the scoring hint `Each op scores 0-6 VP. Primary Op adds half of its VP, rounded up.` (`app.js:4477`), the `Crit Op` field labels (`app.js:4501`, `app.js:4744`), the combination list `Tac Op + Crit Op` (`app.js:4528`) and `Crit Op + Tac Op` (`app.js:2278`).

- [ ] **Step 2: Add the keys**

Worked example — `public/i18n/en.js`:

```js
  // -- games ----------------------------------------------------------------
  "games.result.title": "Approved Ops result",
  "games.result.editTitle": "Edit Approved Ops result",
  "games.result.hint": "Each op scores 0-6 VP. Primary Op adds half of its VP, rounded up.",
  "games.result.critOp": "Crit Op",
  "games.count": { one: "{n} game", other: "{n} games" },
```

`public/i18n/ru.js`:

```js
  // -- games ----------------------------------------------------------------
  "games.result.title": "Результат Approved Ops",
  "games.result.editTitle": "Изменить результат Approved Ops",
  "games.result.hint": "За каждый op даётся 0-6 VP. Primary Op добавляет половину своих VP с округлением вверх.",
  "games.result.critOp": "Crit Op",
  "games.count": { one: "{n} игра", few: "{n} игры", many: "{n} игр", other: "{n} игры" },
```

Add `"games.result.critOp": "Rules term."` to `SAME_IN_BOTH`.

- [ ] **Step 3: Replace the plural sites**

`app.js:3098`:

```js
  const gameLabel = total === 1 ? "game" : "games";
```

The whole construct goes away — the call site becomes `plural("games.count", total)`. Do the same at `app.js:3119`:

```js
        <small>${player.games} ${player.games === 1 ? "game" : "games"}</small>
```

becomes:

```js
        <small>${plural("games.count", player.games)}</small>
```

- [ ] **Step 4: Replace the remaining literals**

Worked example — `app.js:4476-4477`:

```js
          <h2>${adminEdit ? "Edit Approved Ops result" : "Approved Ops result"}</h2>
          <p class="muted">Each op scores 0-6 VP. Primary Op adds half of its VP, rounded up.</p>
```

becomes:

```js
          <h2>${adminEdit ? t("games.result.editTitle") : t("games.result.title")}</h2>
          <p class="muted">${t("games.result.hint")}</p>
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit`
Expected: PASS. Check 5 fails if a plural form lost its `{n}`.

- [ ] **Step 6: Verify and commit**

Open a game's result form in both languages. Confirm the `Killzone`, `Crit Op` and `Tac Op` dropdown **options** are still English in both — they come from `game-data.js` and must not have changed.

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js public/i18n/glossary.js
git commit -m "feat: localize games, result forms and game detail"
```

---

### Task 10: Tournaments

The largest screen group. It covers the public tournament route, which anonymous visitors see, so the language toggle must work before sign-in.

**Files:**
- Modify: `public/app.js:817-1419` (`renderPublicTournamentRoute`, `renderPublicTournament`, `renderTournamentJoinForm`, and the standings helpers at `app.js:1039-1355`), `public/app.js:1420-1569` (`renderTournaments`), `public/app.js:4711-5688` (`renderTournamentResultForm`, `renderTournamentResultReview`)
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t`, `plural`, `tiebreaker.*` (Task 5), `venue.*` (Task 5)
- Produces: the `tournaments.*` namespace.

- [ ] **Step 1: Enumerate the literals**

Run: `sed -n '817,1569p' public/app.js` and `sed -n '4711,5688p' public/app.js`

Known ones: `Loading tournament...` (`app.js:817`), the format label `Swiss` / `Single elimination` (`app.js:1039`), the standings column headers `Total VP` / `VP Diff` (`app.js:1237-1238`), `Bye` (`app.js:1335`), `BYE` (`app.js:1306`), `Faction TBD` (`app.js:1249`, `app.js:1272`), the `Faction` field label (`app.js:938`), and `Crit Op: ${mission.critOp}` (`app.js:1355`).

- [ ] **Step 2: Add the keys**

Worked example — `public/i18n/en.js`:

```js
  // -- tournaments ----------------------------------------------------------
  "tournaments.loading": "Loading tournament...",
  "tournaments.format.swiss": "Swiss",
  "tournaments.format.singleElimination": "Single elimination",
  "tournaments.standings.totalVp": "Total VP",
  "tournaments.standings.vpDiff": "VP Diff",
  "tournaments.match.bye": "Bye",
  "tournaments.match.byeUpper": "BYE",
  "tournaments.participant.factionMissing": "Faction TBD",
  "tournaments.field.faction": "Faction",
  "tournaments.mission.critOp": "Crit Op: {name}",
```

`public/i18n/ru.js`:

```js
  // -- tournaments ----------------------------------------------------------
  "tournaments.loading": "Загрузка турнира...",
  "tournaments.format.swiss": "Швейцарка",
  "tournaments.format.singleElimination": "На выбывание",
  "tournaments.standings.totalVp": "Всего VP",
  "tournaments.standings.vpDiff": "Разница VP",
  "tournaments.match.bye": "Бай",
  "tournaments.match.byeUpper": "БАЙ",
  "tournaments.participant.factionMissing": "Фракция не выбрана",
  "tournaments.field.faction": "Фракция",
  "tournaments.mission.critOp": "Crit Op: {name}",
```

- [ ] **Step 3: Replace the literals**

Worked example — `app.js:1355`:

```js
  if (mission.critOp) parts.push(`Crit Op: ${mission.critOp}`);
```

becomes:

```js
  if (mission.critOp) parts.push(t("tournaments.mission.critOp", { name: mission.critOp }));
```

The interpolated `mission.critOp` is a Crit Op name from `game-data.js` and stays English by construction.

Worked example — `app.js:1039`:

```js
  return format === "swiss" ? "Swiss" : "Single elimination";
```

becomes:

```js
  return t(format === "swiss" ? "tournaments.format.swiss" : "tournaments.format.singleElimination");
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS. Check 3 fails if `Total VP` lost its `VP`.

- [ ] **Step 5: Verify and commit**

Open a public tournament URL **signed out** and toggle the language. Then open the standings table and check that the column headers do not overflow in Russian at 360px.

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js
git commit -m "feat: localize tournament screens"
```

---

### Task 11: Statistics

**Files:**
- Modify: `public/app.js:3184-3866` (`renderStatistics`, `renderKillTeamWinrates`, `renderTacOpWinrates`, `renderTeamCards`, `renderTeamDetail`)
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t`, `plural`
- Produces: the `stats.*` namespace.

- [ ] **Step 1: Enumerate the literals**

Run: `sed -n '3184,3866p' public/app.js`

Known ones: the tab label `Tac Ops Winrates` (`app.js:3208`), the sortable headers `Tac Op` / `Avg VP` / `Avg VP as Primary` (`app.js:3357-3362`), the empty state `No completed games with Tac Op data yet.` (`app.js:3377`), the classification badge values `Classified` / `Non-Classified` (`app.js:3454`, `app.js:3522`) and the filter options (`app.js:3259-3260`).

- [ ] **Step 2: Add the keys**

`Classified` and `Non-Classified` are protected. They keep their English value in both dictionaries and go into `SAME_IN_BOTH`.

Worked example — `public/i18n/en.js`:

```js
  // -- stats ----------------------------------------------------------------
  "stats.tab.tacOpWinrates": "Tac Ops Winrates",
  "stats.column.tacOp": "Tac Op",
  "stats.column.avgVp": "Avg VP",
  "stats.column.avgVpAsPrimary": "Avg VP as Primary",
  "stats.empty.tacOp": "No completed games with Tac Op data yet.",
  "stats.classification.classified": "Classified",
  "stats.classification.nonClassified": "Non-Classified",
```

`public/i18n/ru.js`:

```js
  // -- stats ----------------------------------------------------------------
  "stats.tab.tacOpWinrates": "Винрейт Tac Ops",
  "stats.column.tacOp": "Tac Op",
  "stats.column.avgVp": "Средние VP",
  "stats.column.avgVpAsPrimary": "Средние VP как Primary Op",
  "stats.empty.tacOp": "Пока нет завершённых игр с данными по Tac Op.",
  "stats.classification.classified": "Classified",
  "stats.classification.nonClassified": "Non-Classified",
```

Add both classification keys to `SAME_IN_BOTH` with the reason `"Challenge classification, a feature name."`.

- [ ] **Step 3: Keep the classification comparison on the data, not the label**

`app.js:3522` returns the literal `"Non-Classified"` / `"Classified"` and `app.js:3454` compares against it. Only the **displayed** value goes through `t()`; the comparison keeps using the raw string so the filter logic at `app.js:3632-3633` still works. Replace only the rendering:

```js
          <span class="team-classification ${classification === "Non-Classified" ? "non-classified" : "classified"}">${classification}</span>
```

with:

```js
          <span class="team-classification ${classification === "Non-Classified" ? "non-classified" : "classified"}">${t(
            classification === "Non-Classified"
              ? "stats.classification.nonClassified"
              : "stats.classification.classified"
          )}</span>
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Open the statistics screen in both languages. Confirm the Tac Op names in the table body stay English and the winrate numbers are unchanged.

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js public/i18n/glossary.js
git commit -m "feat: localize the statistics screen"
```

---

### Task 12: All Kill Team Challenge

**Files:**
- Modify: `public/app.js:3867-4116` (`renderChallenge`)
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t`, `plural`, `stats.classification.*` (Task 11)
- Produces: the `challenge.*` namespace.

- [ ] **Step 1: Enumerate the literals**

Run: `sed -n '3867,4116p' public/app.js`

Known ones: the heading `All Kill Team Challenge` (`app.js:3878`), the tab labels `Classified` and `All Kill Team` (`app.js:3883-3884`), the error prefix `Could not load challenge progress:` (`app.js:3886`) and the loading state `Loading challenge progress...` (`app.js:3887`).

**Watch the subtitle at `app.js:3879`.** It concatenates a variable with a literal:

```js
          <p class="muted">${subtitle} Win with each Kill Team in order. Wildcards can be completed at any time.</p>
```

Do not translate the trailing fragment on its own — Russian word order will not follow the English sentence break. Make the whole line one key with the variable as a placeholder.

- [ ] **Step 2: Add the keys**

`public/i18n/en.js`:

```js
  // -- challenge ------------------------------------------------------------
  "challenge.title": "All Kill Team Challenge",
  "challenge.subtitle": "{progress} Win with each Kill Team in order. Wildcards can be completed at any time.",
  "challenge.tab.classified": "Classified",
  "challenge.tab.allKillTeam": "All Kill Team",
  "challenge.error.load": "Could not load challenge progress: {reason}",
  "challenge.loading": "Loading challenge progress...",
```

`public/i18n/ru.js`:

```js
  // -- challenge ------------------------------------------------------------
  "challenge.title": "All Kill Team Challenge",
  "challenge.subtitle": "{progress} Побеждайте каждым Kill Team по порядку. Wildcards можно закрыть в любой момент.",
  "challenge.tab.classified": "Classified",
  "challenge.tab.allKillTeam": "All Kill Team",
  "challenge.error.load": "Не удалось загрузить прогресс челленджа: {reason}",
  "challenge.loading": "Загрузка прогресса челленджа...",
```

Add `challenge.title`, `challenge.tab.classified` and `challenge.tab.allKillTeam` to `SAME_IN_BOTH` with the reason `"Feature and classification names."`.

- [ ] **Step 3: Replace the literals**

Worked example — `app.js:3886`:

```js
      ${state.challengeError ? `<div class="empty">Could not load challenge progress: ${escapeHtml(state.challengeError)}</div>` : ""}
```

becomes:

```js
      ${state.challengeError ? `<div class="empty">${t("challenge.error.load", { reason: escapeHtml(state.challengeError) })}</div>` : ""}
```

The value stays escaped by the caller — `t()` does not escape.

Kill team names rendered in the track lists come from `src/domain/kill-teams.js` through the API and must not be routed through `t()`.

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Open the challenge screen in both languages and confirm all 48 kill team names are still English.

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js
git commit -m "feat: localize the All Kill Team Challenge screen"
```

---

### Task 13: Profile and player profile

**Files:**
- Modify: `public/app.js:2297-3003` (`renderProfile`, `renderPlayerProfile`)
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t`, `plural`, `op.*` (Task 5)
- Produces: the `profile.*` namespace.

- [ ] **Step 1: Enumerate the literals**

Run: `sed -n '2297,3003p' public/app.js`

Known ones: `Player profile is loading.` (`app.js:2535`), the op combination labels at `app.js:2278` (`Crit Op + Tac Op`), and `Waiting for Approved Ops result` (`app.js:2072`, if Task 8 did not already cover that call site — check before adding a duplicate key).

- [ ] **Step 2: Add the keys, translate, replace**

Follow the shared procedure. Reuse `play.game.waitingForResult` rather than defining a second key for the same sentence.

- [ ] **Step 3: Localize the date format**

`fmtDate` at `app.js:447-451` hard-codes Russian formatting even though the interface is English. Replace:

```js
function fmtDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(value));
}
```

with:

```js
function fmtDate(value) {
  if (!value) return "";
  return i18n.formatDate(new Date(value), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
```

`fmtDate` is called from many screens, so this single change makes every date in the app follow the active locale.

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Open your own profile and another player's profile in both languages. Confirm dates render as `22.08, 14:11` in Russian and `08/22, 02:11 PM` in English.

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js
git commit -m "feat: localize profiles and locale-aware date formatting"
```

---

### Task 14: Feedback

**Files:**
- Modify: `public/app.js:2141-2296` (`renderFeedback`)
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t`, `common.*`
- Produces: the `feedback.*` namespace.

- [ ] **Step 1: Enumerate the literals**

Run: `sed -n '2141,2296p' public/app.js`

The range covers `renderFeedback` and the two markup helpers it calls, `feedbackFormMarkup` and `feedbackInboxMarkup`. Known literals: the heading `Feedback` (`app.js:2148`), the hint `Send a short note about a screen, bug, or improvement.` (`app.js:2149`) and the admin mode buttons `Form` / `Admin inbox` (`app.js:2152-2153`).

- [ ] **Step 2: Add the keys**

`public/i18n/en.js`:

```js
  // -- feedback -------------------------------------------------------------
  "feedback.title": "Feedback",
  "feedback.hint": "Send a short note about a screen, bug, or improvement.",
  "feedback.mode.form": "Form",
  "feedback.mode.inbox": "Admin inbox",
```

`public/i18n/ru.js`:

```js
  // -- feedback -------------------------------------------------------------
  "feedback.title": "Обратная связь",
  "feedback.hint": "Напишите коротко об экране, ошибке или улучшении.",
  "feedback.mode.form": "Форма",
  "feedback.mode.inbox": "Входящие админа",
```

- [ ] **Step 3: Replace the literals**

Worked example — `app.js:2148-2149`:

```js
          <h2>Feedback</h2>
          <p class="muted">Send a short note about a screen, bug, or improvement.</p>
```

becomes:

```js
          <h2>${t("feedback.title")}</h2>
          <p class="muted">${t("feedback.hint")}</p>
```

Continue through `feedbackFormMarkup` and `feedbackInboxMarkup` with the shared procedure.

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Open the feedback form and, as an admin, the inbox, in both languages.

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js
git commit -m "feat: localize the feedback screen"
```

---

### Task 15: Leaderboard and admin

**Files:**
- Modify: `public/app.js:5689-6771` (`renderTop`), `public/app.js:6772-7456` (`renderAdmin`), `public/app.js:7457-7560` (`renderRoundSetupModal`)
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t`, `plural`, `tiebreaker.*`, `venue.*`, `common.*`
- Produces: the `leaderboard.*` and `admin.*` namespaces.

- [ ] **Step 1: Enumerate the literals**

Run: `sed -n '5689,6771p' public/app.js`, `sed -n '6772,7456p' public/app.js`, `sed -n '7457,7560p' public/app.js`

Known ones: `${size} players` (`app.js:5881`, `app.js:6086`) — these become `plural("admin.tournament.playerCount", size)`; the `Seed ${participant.seed}` line (`app.js:6435`); and the killzone/crit op selects in the round setup modal (`app.js:7499`, `app.js:7511`), whose **options** stay English.

- [ ] **Step 2: Add the plural key**

`public/i18n/en.js`:

```js
  "admin.tournament.playerCount": { one: "{n} player", other: "{n} players" },
```

`public/i18n/ru.js`:

```js
  "admin.tournament.playerCount": { one: "{n} игрок", few: "{n} игрока", many: "{n} игроков", other: "{n} игрока" },
```

- [ ] **Step 3: Add the rest of the keys, translate, replace**

Follow the shared procedure for both ranges.

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

As an admin, open the leaderboard, the admin panel, the tournament creation form and the round setup modal in both languages. Confirm the bracket size selector reads `8 игроков` / `16 игроков` / `32 игрока` / `64 игрока`.

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js
git commit -m "feat: localize the leaderboard and admin screens"
```

---

### Task 16: Dialogs and client-side messages

**Files:**
- Modify: `public/app.js` — the 16 `confirm()` calls and the 10 `setMessage("…")` literals
- Modify: `public/i18n/en.js`, `public/i18n/ru.js`

**Interfaces:**
- Consumes: `t`, `common.*`
- Produces: the `dialog.*` and `message.*` namespaces.

- [ ] **Step 1: Enumerate them**

Run: `grep -n "confirm(" public/app.js`
Run: `grep -n 'setMessage("' public/app.js`

Only client-authored strings are in scope. `setMessage(err.message, true)` passes a server string through and is deliberately left alone — see the spec's Objem section.

- [ ] **Step 2: Add the keys, translate, replace**

Follow the shared procedure. Confirmation copy should name what is about to happen, e.g.:

`public/i18n/en.js`:

```js
  "dialog.deleteUser": "Delete this player? This cannot be undone.",
```

`public/i18n/ru.js`:

```js
  "dialog.deleteUser": "Удалить этого игрока? Действие необратимо.",
```

- [ ] **Step 3: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 4: Verify and commit**

Trigger at least three confirmation dialogs in Russian.

```bash
git add public/app.js public/i18n/en.js public/i18n/ru.js
git commit -m "feat: localize dialogs and client-side messages"
```

---

### Task 17: Coverage sweep

A heuristic scanner that finds displayed text in `public/app.js` which never made it into a dictionary. It will surface false positives; each one gets triaged into the allowlist with a reason, which is what makes the file a completion record rather than a rubber stamp.

**Files:**
- Create: `test/unit/i18n-coverage.test.js`
- Modify: `public/app.js` (whatever the scanner finds)
- Modify: `public/index.html` (bump the `?v=` suffixes)

**Interfaces:**
- Consumes: everything from Tasks 1-16.
- Produces: nothing further tasks depend on.

- [ ] **Step 1: Write the scanner test**

Create `test/unit/i18n-coverage.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const APP_PATH = path.join(__dirname, "../../public/app.js");
const source = fs.readFileSync(APP_PATH, "utf8");

// Text rendered between tags inside the template literals. Anything with an
// interpolation is skipped: it is either already a t() call or a data value.
const TEXT_NODE = />([^<>{}`$]{3,})</g;

// Text the scanner is allowed to see. Each entry needs a reason -- this list is
// the record of what was reviewed, not a way to silence the test.
const ALLOWED = new Set([
  // Non-breaking spaces and separators used as layout, not copy.
  " - ",
  " / ",
  " vs "
]);

function isEnglishProse(text) {
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  if (!/[a-z]/.test(trimmed)) return false;
  return /^[A-Za-z][A-Za-z0-9 '’,.!?:%()+-]*$/.test(trimmed);
}

test("no untranslated English prose is rendered from app.js", () => {
  const found = new Set();
  for (const match of source.matchAll(TEXT_NODE)) {
    const text = match[1].trim();
    if (ALLOWED.has(match[1])) continue;
    if (!isEnglishProse(text)) continue;
    found.add(text);
  }
  assert.deepEqual(
    [...found].sort(),
    [],
    `These strings are rendered directly instead of through t(): ${[...found].sort().join(" | ")}`
  );
});
```

- [ ] **Step 2: Run it and triage**

Run: `node --test test/unit/i18n-coverage.test.js`
Expected: FAIL, listing whatever slipped through.

For each reported string: if it is displayed copy, give it a key and route it through `t()`. If it is a protected term, a CSS artefact or a layout separator, add it to `ALLOWED` with a one-line comment saying why.

Repeat until the test passes.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS. This needs the test database — see the README's Tests section. If it is not set up, run `npm run test:unit` and say so in the commit message rather than claiming a full pass.

- [ ] **Step 4: Bump the asset versions in `public/index.html`**

Set every `?v=` query on `styles.css`, `app.js`, `game-data.js`, `i18n.js`, `i18n/en.js` and `i18n/ru.js` to `20260822-i18n-ru` so returning visitors do not get a half-cached mix of old and new files.

- [ ] **Step 5: Read both languages end to end**

Walk every screen in Russian, then in English. Look for: sentences assembled from fragments that read wrong in Russian, inconsistent formality (the app should address the user as «вы» throughout, lowercase), buttons whose Russian label overflows, and any protected term that reads as though it was translated.

Fix copy in the dictionaries; fix overflow in `public/styles.css`.

- [ ] **Step 6: Commit**

```bash
git add test/unit/i18n-coverage.test.js public/app.js public/i18n/en.js public/i18n/ru.js public/index.html public/styles.css
git commit -m "test: add i18n coverage sweep and finish the Russian pass"
```

---

## Verification checklist

Before calling this done, confirm each of these by running it — not by assuming:

- [ ] `npm run test:unit` passes.
- [ ] `node --test test/unit/i18n.test.js` passes all seven checks plus the glossary coverage test.
- [ ] `node --test test/unit/i18n-coverage.test.js` passes with a reviewed allowlist.
- [ ] Toggling the language re-renders every screen without a page reload, including the tiebreaker descriptions and the op labels.
- [ ] The toggle works signed out, on the auth screen and on a public tournament page.
- [ ] With `localStorage` cleared and a Russian browser, the app opens in Russian; with an English browser, in English.
- [ ] Killzone, Crit Op and Tac Op dropdown option values are byte-identical in both languages.
- [ ] A game recorded before this change still shows its killzone and ops correctly.
- [ ] At 360px width, both floating buttons fit and the topbar does not collide with them.
