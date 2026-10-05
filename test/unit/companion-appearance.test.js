const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../../public/theme-boot.js"), "utf8");

function boot({ stored = {}, cookieJar = new Map(), light = false, blocked = false, cookiesBlocked = false, companion = false, origin = "https://ktcompanion.ru" } = {}) {
  const values = new Map(Object.entries(stored)), listeners = {}, events = [], writes = [], cookieWrites = [];
  const media = { matches: light, addEventListener(name, fn) { this[name] = fn; } };
  const element = { dataset: {}, lang: "" };
  const document = { documentElement: element, currentScript: { src: origin + "/theme-boot.js?v=test", hasAttribute: () => companion }, write: value => writes.push(value), visibilityState: "visible", addEventListener(name, fn) { listeners[name] = fn; } };
  Object.defineProperty(document, "cookie", {
    get() { if (cookiesBlocked) throw Error("blocked"); return [...cookieJar].map(([key, value]) => key + "=" + value).join("; "); },
    set(value) {
      if (cookiesBlocked) throw Error("blocked"); cookieWrites.push(value);
      const [pair] = value.split(";"), index = pair.indexOf("=");
      cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
    }
  });
  const root = {
    document, location: new URL(origin),
    navigator: { language: "en-US" },
    localStorage: { getItem(key) { if (blocked) throw Error("blocked"); return values.get(key); }, setItem(key, value) { if (blocked) throw Error("blocked"); values.set(key, value); } },
    matchMedia: () => media,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    dispatchEvent: event => events.push(event),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  };
  root.window = root;
  vm.runInNewContext(source, root);
  return { api: root.KTAppearance, element, values, events, writes, media, listeners, cookieJar, cookieWrites };
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
  app.values.clear(); app.cookieJar.clear(); app.listeners.storage({ key: null });
  assert.equal(app.api.theme, "dark"); assert.equal(app.api.locale, "ru");
});

test("blocked storage still allows changes within the current page", () => {
  const app = boot({ blocked: true, cookiesBlocked: true });
  app.api.setTheme("light"); app.api.setLocale("en");
  assert.equal(app.element.dataset.theme, "light"); assert.equal(app.element.lang, "en");
  app.api.setTheme("invalid"); app.api.setLocale("invalid");
  assert.equal(app.api.theme, "light"); assert.equal(app.api.locale, "en");
});

test("public tools share preferences without downloading the tournament dictionary", () => {
  const app = boot({ companion: true });
  assert.equal(app.element.lang, "ru"); assert.equal(app.writes.length, 0);
});

test("a shared preference overrides an older service choice and survives unavailable localStorage", () => {
  const cookieJar = new Map();
  const tournament = boot({ cookieJar });
  tournament.api.setTheme("light"); tournament.api.setLocale("en");
  const faq = boot({ cookieJar, stored: { "tgtv-theme": "dark", "tgtv-locale": "ru" }, companion: true });
  assert.equal(faq.element.dataset.theme, "light"); assert.equal(faq.element.lang, "en");
  assert.equal(faq.values.get("tgtv-locale"), "en");
  const studio = boot({ cookieJar, blocked: true, companion: true });
  assert.equal(studio.element.dataset.theme, "light"); assert.equal(studio.element.lang, "en");
});

test("returning to an open service applies the latest choice from another service address", () => {
  const cookieJar = new Map(), tournament = boot({ cookieJar });
  const faq = boot({ cookieJar, companion: true });
  faq.api.setTheme("light"); faq.api.setLocale("en");
  tournament.listeners.pageshow();
  assert.equal(tournament.element.dataset.theme, "light"); assert.equal(tournament.element.lang, "en");
  assert.equal(tournament.events.at(-1).type, "kt:locale");
  faq.api.setTheme("dark"); tournament.listeners.focus();
  assert.equal(tournament.element.dataset.theme, "dark");
});

test("preference cookies are scoped to service paths and never to unrelated parent domains", () => {
  const production = boot(); production.api.setLocale("en");
  assert.match(production.cookieWrites.at(-1), /Path=\/; Max-Age=31536000; SameSite=Lax; Domain=ktcompanion\.ru; Secure$/);
  const local = boot({ origin: "http://127.0.0.1:3004" }); local.api.setTheme("light");
  assert.match(local.cookieWrites.at(-1), /Path=\//); assert.doesNotMatch(local.cookieWrites.at(-1), /Domain=|Secure/);
  const other = boot({ origin: "https://studio.example.test" }); other.api.setTheme("light");
  assert.doesNotMatch(other.cookieWrites.at(-1), /Domain=/);
});

test("defaults do not create cookies and invalid cookies do not replace a saved choice", () => {
  const firstVisit = boot(); assert.equal(firstVisit.cookieWrites.length, 0);
  const app = boot({ stored: { "tgtv-theme": "light", "tgtv-locale": "en" }, cookieJar: new Map([["tgtv-theme", "%ZZ"], ["tgtv-locale", "xx"]]) });
  assert.equal(app.api.theme, "light"); assert.equal(app.api.locale, "en");
});
