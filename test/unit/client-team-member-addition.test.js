const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");

function extract(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\r?\\n\\}`));
  assert.ok(match, `Missing function ${name}`);
  return match[0];
}

function panel({ admin = true, administrationContext = true, archivedAt = null } = {}) {
  const state = { me: { isAdmin: admin }, administrationContext,
    users: [{ id: 1, name: "Leader" }, { id: 2, name: '<Player "Two">' }] };
  return new Function("state", "t", "markdownEditorField", "teamLogoField", `
    ${extract("escapeHtml")}
    ${extract("teamManagementPanel")}
    return teamManagementPanel;
  `)(state, key => key, () => "", () => "")({
    team: { id: 7, name: "Team", viewer: { canAdmin: admin }, archivedAt },
    currentMembers: [{ userId: 1, role: "leader" }]
  });
}

test("direct addition form is available only in active team administrator management", () => {
  assert.match(panel(), /data-team-add-member/);
  assert.match(panel(), /teams.members.addHint/);
  for (const options of [{ admin: false }, { administrationContext: false }, { archivedAt: "2026-11-17" }]) {
    assert.doesNotMatch(panel(options), /data-team-add-member/);
  }
  assert.match(panel({ admin: false }), /data-team-invite/);
});

test("direct addition uses searchable candidates, excludes current members and escapes player names", () => {
  const form = panel().match(/<form data-team-add-member>[\s\S]*?<\/form>/)[0];
  assert.match(form, /data-user-search data-user-search-remote/);
  assert.match(form, /data-user-search-exclude="1"/);
  assert.doesNotMatch(form, /value="1"/);
  assert.match(form, /value="2"/);
  assert.match(form, /&lt;Player &quot;Two&quot;&gt;/);
});

test("remote player search keeps existing members out of selectable results", async () => {
  const inputHandlers = {};
  let scheduled;
  const input = { value: "Player", isConnected: true, setAttribute() {}, dispatchEvent() {},
    addEventListener: (event, handler) => { inputHandlers[event] = handler; } };
  const valueInput = { removeAttribute() {}, addEventListener() {} };
  const combo = { classList: { add() {} }, append() {},
    querySelector: selector => selector === "[data-combo-input]" ? input
      : selector === "[data-combo-value-input]" ? valueInput : { remove() {} } };
  const select = { dataset: { userSearchRemote: "", userSearchExclude: "1,3" },
    required: true, value: "", options: [], before() {}, addEventListener() {},
    closest: selector => selector === ".field" ? { querySelector: () => ({ textContent: "Add player" }) } : null,
    replaceChildren(...options) { this.options = options; } };
  const root = { querySelectorAll: () => [select] };
  const document = { createElement: () => ({ firstElementChild: combo }) };
  const searches = [];
  const enhance = new Function("document", "comboField", "t", "api", "Option", "syncUserSelect", "setTimeout", "clearTimeout", "setMessage", `
    ${extract("enhanceUserSelects")}; return enhanceUserSelects;
  `)(document, () => "", key => key, async url => {
    searches.push(url);
    return { users: [{ id: 1, name: "Leader" }, { id: 2, name: "Player" }, { id: 3, name: "Member" }] };
  }, function Option(label, value) { this.textContent = label; this.value = String(value); },
  () => {}, callback => { scheduled = callback; }, () => {}, message => assert.fail(message));
  enhance(root);
  inputHandlers.input();
  await scheduled();
  assert.deepEqual(searches, ["/api/users/search?q=Player"]);
  assert.deepEqual(select.options.map(option => option.value), ["", "2"]);
});

function additionHarness({ error, pending = false } = {}) {
  const calls = [];
  const button = { disabled: false };
  const message = { hidden: true, textContent: "" };
  const form = {
    elements: { userId: { value: "23", selectedOptions: [{ textContent: " Player " }] } },
    querySelector: selector => selector === '[type="submit"]' ? button : message
  };
  let resolve;
  const request = pending ? new Promise(done => { resolve = done; }) : Promise.resolve();
  const add = new Function("api", "renderPlayerTeamRoute", "loadNotifications", "setMessage", "t", `
    ${extract("addPlayerTeamMember")}; return addPlayerTeamMember;
  `)(async (url, options) => {
    calls.push([url, options]);
    if (error) throw Error(error);
    await request;
  }, async (...args) => calls.push(["refresh", ...args]), async () => calls.push("notifications"),
  (...args) => calls.push(["message", ...args]), (key, args) => `${key}:${args.name}`);
  return { calls, form, button, message, resolve, add: () => add({ id: 7, slug: "team" }, form) };
}

test("direct addition sends the player id, reloads composition and confirms success", async () => {
  const ui = additionHarness();
  await ui.add();
  assert.deepEqual(ui.calls, [
    ["/api/admin/teams/7/members", { method: "POST", body: { userId: 23 } }],
    ["refresh", "team", { force: true }], "notifications",
    ["message", "teams.message.memberAdded:Player"]
  ]);
  assert.equal(ui.button.disabled, false);
});

test("direct addition prevents duplicate submissions while a request is pending", async () => {
  const ui = additionHarness({ pending: true });
  const first = ui.add();
  assert.equal(ui.button.disabled, true);
  await ui.add();
  assert.equal(ui.calls.length, 1);
  ui.resolve();
  await first;
  assert.equal(ui.button.disabled, false);
});

test("a refused addition displays the error and allows retrying the same player", async () => {
  const ui = additionHarness({ error: "Player is already a member" });
  await ui.add();
  assert.equal(ui.message.hidden, false);
  assert.equal(ui.message.textContent, "Player is already a member");
  assert.equal(ui.button.disabled, false);
  assert.equal(ui.form.elements.userId.value, "23");
  assert.equal(ui.calls.length, 1);
});
