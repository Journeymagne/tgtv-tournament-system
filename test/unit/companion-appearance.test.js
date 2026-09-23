const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../../public/theme-boot.js"), "utf8");

function boot({ stored = {}, light = false, blocked = false, companion = false } = {}) {
  const values = new Map(Object.entries(stored)), listeners = {}, events = [], writes = [];
  const media = { matches: light, addEventListener(name, fn) { this[name] = fn; } };
  const element = { dataset: {}, lang: "" };
  const root = {
    document: { documentElement: element, currentScript: { src: "https://example.test/theme-boot.js?v=test", hasAttribute: () => companion }, write: value => writes.push(value) },
    navigator: { language: "en-US" },
    localStorage: { getItem(key) { if (blocked) throw Error("blocked"); return values.get(key); }, setItem(key, value) { if (blocked) throw Error("blocked"); values.set(key, value); } },
    matchMedia: () => media,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    dispatchEvent: event => events.push(event),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  };
  root.window = root;
  vm.runInNewContext(source, root);
  return { api: root.KTAppearance, element, values, events, writes, media, listeners };
}

test("first visit defaults to dark theme and Russian independently of the device settings", () => {
  for (const light of [false, true]) {
    const app = boot({ light });
    assert.equal(app.api.theme, "dark");
    assert.equal(app.element.dataset.theme, "dark");
    assert.equal(app.element.lang, "ru");
    assert.match(app.writes[0], /\/i18n\/ru\.js\?v=test/);
  }
});

test("manual choices survive navigation and override later system changes", () => {
  const app = boot({ light: false, stored: { "tgtv-theme": "light", "tgtv-locale": "en" } });
  assert.equal(app.media.change, undefined);
  assert.equal(app.element.dataset.theme, "light");
  assert.equal(app.element.lang, "en");
  app.api.setTheme("dark");
  assert.equal(app.values.get("tgtv-theme"), "dark");
  assert.equal(boot({ stored: Object.fromEntries(app.values), light: true }).element.dataset.theme, "dark");
});

test("legacy system preference becomes a fixed theme without changing its current appearance", () => {
  for (const light of [false, true]) {
    const app = boot({ stored: { "tgtv-theme": "system" }, light });
    const expected = light ? "light" : "dark";
    assert.equal(app.api.theme, expected);
    assert.equal(app.element.dataset.theme, expected);
    assert.equal(app.values.get("tgtv-theme"), expected);
    app.media.matches = !light;
    app.api.refresh();
    assert.equal(app.element.dataset.theme, expected);
    app.api.setTheme("system");
    assert.equal(app.api.theme, expected);
  }
});

test("theme and language synchronize between tabs without a page reload", () => {
  const app = boot();
  app.values.set("tgtv-theme", "light"); app.values.set("tgtv-locale", "en");
  app.listeners.storage({ key: "tgtv-locale" });
  assert.equal(app.element.dataset.theme, "light");
  assert.equal(app.element.lang, "en");
  assert.equal(app.events.at(-1).type, "kt:locale");
  app.values.clear(); app.listeners.storage({ key: null });
  assert.equal(app.api.theme, "dark"); assert.equal(app.api.locale, "ru");
});

test("blocked storage still allows changes within the current page", () => {
  const app = boot({ blocked: true });
  app.api.setTheme("light"); app.api.setLocale("en");
  assert.equal(app.element.dataset.theme, "light"); assert.equal(app.element.lang, "en");
  app.api.setTheme("invalid"); app.api.setLocale("invalid");
  assert.equal(app.api.theme, "light"); assert.equal(app.api.locale, "en");
});

test("public tools share preferences without downloading the tournament dictionary", () => {
  const app = boot({ companion: true });
  assert.equal(app.element.lang, "ru"); assert.equal(app.writes.length, 0);
});
