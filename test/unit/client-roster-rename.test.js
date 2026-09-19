const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const code = source.match(/function openRosterNameEditor\([^\n]*\) \{[\s\S]*?\r?\n\}/)[0];

function harness({ canRename = true, error = null, request = null } = {}) {
  const calls = [];
  const events = {};
  const message = { hidden: true, textContent: "" };
  const button = { disabled: false };
  const input = { value: "  New roster  ", focus() {}, select() {} };
  const form = {
    elements: { name: input },
    querySelector: selector => selector === '[type="submit"]' ? button : message,
    addEventListener: (name, fn) => { events[name] = fn; }
  };
  const dialog = {
    innerHTML: "", setAttribute() {},
    querySelector: selector => selector === "[data-roster-rename-form]" ? form : { addEventListener: (_name, fn) => { events[selector] = fn; } },
    addEventListener: (name, fn) => { events[name] = fn; },
    showModal: () => calls.push("show"), close: () => calls.push("close"), remove: () => calls.push("remove")
  };
  const state = { view: "roster", selectedRosterId: 9, publicTournamentDetail: { tournament: { id: 5 } }, teamProfile: { team: { id: 7 } } };
  const open = new Function("document", "t", "escapeHtml", "api", "state", "openRosterProfile", `${code}; return openRosterNameEditor;`)(
    { createElement: () => dialog, body: { appendChild: () => calls.push("append") } }, key => key,
    value => String(value).replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
    async (url, options) => { calls.push({ url, ...options }); if (request) await request(); if (error) throw new Error(error); },
    state, async (...args) => calls.push({ refresh: args })
  );
  open({ roster: { id: 9, teamId: 7, name: 'Roster "one" <test>' }, tournament: { id: 5 }, viewer: { canRename } });
  return { calls, dialog, state, message, button, input, events, submit: () => events.submit({ preventDefault() {} }) };
}

test("rename dialog is limited to authorized viewers and escapes the existing name", () => {
  assert.deepEqual(harness({ canRename: false }).calls, []);
  const ui = harness();
  assert.match(ui.dialog.innerHTML, /Roster &quot;one&quot; &lt;test>/);
  assert.match(ui.dialog.innerHTML, /minlength="2" maxlength="80"/);
});

test("saving sends only the trimmed name, then refreshes the same roster without navigating", async () => {
  const ui = harness();
  await ui.submit();
  assert.deepEqual(ui.calls, ["append", "show", { url: "/api/tournaments/5/rosters/9", method: "PATCH", body: { name: "New roster" } }, "close", "remove", { refresh: [9, { navigate: false }] }]);
  assert.equal(ui.state.publicTournamentDetail, null);
  assert.equal(ui.state.teamProfile, null);
});

test("failed rename keeps the entered name and shows an inline error so the user can retry", async () => {
  const ui = harness({ error: "Roster name already used" });
  await ui.submit();
  assert.equal(ui.message.textContent, "Roster name already used");
  assert.equal(ui.message.hidden, false);
  assert.equal(ui.button.disabled, false);
  assert.equal(ui.input.value, "  New roster  ");
  assert.ok(!ui.calls.includes("close"));
  assert.ok(ui.state.publicTournamentDetail);
  assert.ok(ui.state.teamProfile);
});

test("cancel makes no request; a pending save cannot duplicate or return to an abandoned page", async () => {
  const cancelled = harness();
  cancelled.events["[data-roster-rename-cancel]"]();
  assert.deepEqual(cancelled.calls, ["append", "show", "close", "remove"]);
  let finish;
  const ui = harness({ request: () => new Promise(resolve => { finish = resolve; }) });
  const pending = ui.submit();
  await ui.submit();
  ui.state.view = "teams";
  finish();
  await pending;
  assert.equal(ui.calls.filter(call => call.method === "PATCH").length, 1);
  assert.ok(!ui.calls.some(call => call.refresh));
});
