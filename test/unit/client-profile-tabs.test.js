const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const messages = require("../../public/i18n/en.js");
const extract = (name) => {
  const code = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(code, name);
  return code;
};
function renderer(state) {
  return new Function("state", "t", `${extract("profileSectionsMarkup")}; return profileSectionsMarkup;`)(state, key => messages[key] || key);
}

test("only the profile owner and administrators can see the settings tab and its contents", () => {
  for (const [me, allowed] of [[null, false], [{ id: 2 }, false], [{ id: 1 }, true], [{ id: 2, isAdmin: true }, true]]) {
    const state = { me, profileTab: "settings", profileTabUserId: 1 };
    const html = renderer(state)({ id: 1 }, { activity: "PUBLIC_ACTIVITY", settings: "PRIVATE_SETTINGS" });
    assert.ok(html.includes("PUBLIC_ACTIVITY"));
    assert.equal(html.includes('data-profile-tab="settings"'), allowed);
    assert.equal(html.includes("PRIVATE_SETTINGS"), allowed);
    if (!allowed) assert.equal(state.profileTab, "activity");
  }
});

test("settings start closed for a new profile and stay selected when that profile rerenders", () => {
  const state = { me: { id: 2, isAdmin: true }, profileTab: "settings", profileTabUserId: 3 };
  const render = renderer(state);
  const sections = { activity: "PUBLIC_ACTIVITY", settings: "PRIVATE_SETTINGS" };
  let html = render({ id: 1 }, sections);
  assert.match(html, /data-profile-panel="settings" hidden/);
  assert.equal(state.profileTab, "activity");
  state.profileTab = "settings";
  html = render({ id: 1 }, sections);
  assert.match(html, /data-profile-panel="activity" hidden/);
  assert.match(html, /data-profile-panel="settings" >/);
});

test("all account forms are grouped together in the owner's settings", () => {
  const state = { me: { id: 1, name: "Player" } };
  const render = new Function("state", "t", "escapeHtml", "avatarMarkup", "emailProfileMarkup", "window",
    `${extract("profileSettingsMarkup")}; return profileSettingsMarkup;`)(state, key => messages[key] || key, String,
    () => "AVATAR", () => "EMAIL_ACCESS", { KTTelegram: { markup: () => "TELEGRAM_SETTINGS" } });
  const html = render();
  for (const form of ["name", "contact", "bcp", "password"]) assert.ok(html.includes(`data-profile-${form}-form`));
  for (const content of ["data-avatar-input", "EMAIL_ACCESS", "TELEGRAM_SETTINGS"]) assert.ok(html.includes(content));
  assert.ok(!html.includes("profile.matchmaking"));
});
