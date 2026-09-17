const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { defaultRosterName } = require("../../src/domain/player-teams");
// The client is two files now: admin.js is fetched on demand and shares app.js
// global scope, so anything extracted by name may live in either.
const source = ["app.js", "admin.js"]
  .map((file) => fs.readFileSync(path.join(__dirname, "../../public", file), "utf8"))
  .join("\n");
function sourceOf(name) {
  const result = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(result, name);
  return result;
}

function publicRosterUi(me = null) {
  const functions = ["canManageTournamentParticipants", "tournamentInfoTabDefinitions", "tournamentInfoTabContent",
    "publicTeamRostersList", "teamRosterLabel", "teamRosterStatusLabel", "tournamentParticipantProfileLink", "activeRosterMembersForUi"];
  const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return new Function("state", "t", "escapeHtml", "playerProfileLink", "adminUi",
    `${functions.map(sourceOf).join("\n")}; return { tournamentInfoTabDefinitions, tournamentInfoTabContent };`)(
    { me }, (key) => key, escape, (player) => `<a data-player="${player.id}">${escape(player.name)}</a>`,
    () => ({ adminTournamentParticipantsContent: () => "ADMIN EDITOR" })
  );
}

test("team roster tab is available to guests and players, and retains the admin editor", () => {
  const data = { tournament: { id: 1, participantMode: "team" }, rosters: [] };
  for (const me of [null, { id: 2 }, { id: 1, isAdmin: true }]) {
    const ui = publicRosterUi(me);
    assert.deepEqual(ui.tournamentInfoTabDefinitions(data).map((tab) => tab.id), ["standings", "matches", "stats", "participants"]);
    assert.match(ui.tournamentInfoTabContent("participants", data), /teams.tournament.rostersEmpty/);
    assert.doesNotMatch(ui.tournamentInfoTabContent("participants", data, { admin: true }), me?.isAdmin ? /rostersEmpty/ : /ADMIN EDITOR/);
  }
  const ui = publicRosterUi({ id: 1, isAdmin: true });
  assert.equal(ui.tournamentInfoTabDefinitions(data, { admin: true }).filter((tab) => tab.id === "participants").length, 1);
  assert.equal(ui.tournamentInfoTabContent("participants", data, { admin: true }), "ADMIN EDITOR");
});

test("public roster preview shows names, captain and status while respecting faction privacy", () => {
  const data = { tournament: { id: 1, participantMode: "team" }, rosters: [{
    id: 1, name: "Squad <one>", team: { name: "Amber", slug: "amber" }, status: "registered", captainUserId: 1,
    members: [
      { userId: 2, slot: 2, displayNameSnapshot: "Player B", factionSnapshot: "Kommandos", factionHidden: true },
      { userId: 1, slot: 1, displayNameSnapshot: "Captain <A>", factionSnapshot: "Angels of Death", factionHidden: true },
      { userId: 3, slot: 3, displayNameSnapshot: "Former player", endedAt: "2026-09-01", factionSnapshot: "Kommandos" }
    ]
  }] };
  for (const me of [null, { id: 99 }]) {
    const ui = publicRosterUi(me);
    const hidden = ui.tournamentInfoTabContent("participants", data);
    assert.match(hidden, /Squad &lt;one&gt;/);
    assert.match(hidden, /Captain &lt;A&gt;/);
    assert.match(hidden, /data-roster-profile-link="1"/);
    assert.doesNotMatch(hidden, /data-team-profile-link/);
    assert.match(hidden, /teams.role.captain/);
    assert.match(hidden, /teams.roster.status.registered/);
    assert.match(hidden, /tournaments.participant.factionHidden/);
    assert.doesNotMatch(hidden, /Kommandos|Angels of Death|Former player|ADMIN EDITOR/);
    assert.ok(hidden.indexOf("Captain &lt;A&gt;") < hidden.indexOf("Player B"));
  }
  data.rosters[0].members.forEach((member) => { member.factionHidden = false; });
  const revealed = publicRosterUi().tournamentInfoTabContent("participants", data);
  assert.match(revealed, /Kommandos/);
  assert.match(revealed, /Angels of Death/);
  assert.doesNotMatch(revealed, /tournaments.participant.factionHidden/);
});

const rosterHelpers = new Function(`${["suggestedRosterName", "updateRosterNameDefault", "rosterNameFromForm"].map(sourceOf).join("\n")}; return { suggestedRosterName, updateRosterNameDefault, rosterNameFromForm };`)();

test("roster defaults count only this team's entries and avoid collisions, including withdrawn entries", () => {
  const team = { id: 1, name: "Amber Guard" };
  const rosters = [{ teamId: 1, name: "Custom", status: "withdrawn" }, { teamId: 2, name: "Amber Guard 2" }];
  assert.equal(defaultRosterName(team, rosters), "Amber Guard 3");
  assert.equal(rosterHelpers.suggestedRosterName(team, rosters), "Amber Guard 3");
  for (const name of ["Amber Guard", "x".repeat(80)]) {
    const expected = defaultRosterName({ ...team, name }, rosters);
    assert.equal(rosterHelpers.suggestedRosterName({ ...team, name }, rosters), expected);
    assert.ok(expected.length <= 80);
  }
  assert.equal(defaultRosterName(team, []), "Amber Guard 1");
});

test("team changes refresh generated names but preserve custom names; defaults are allocated by the server", () => {
  const input = { value: "Amber Guard 1", dataset: { defaultName: "Amber Guard 1" } };
  const form = { elements: { name: input } };
  rosterHelpers.updateRosterNameDefault(form, { id: 2, name: "Blue Guard" }, []);
  assert.equal(input.value, "Blue Guard 1");
  assert.equal(rosterHelpers.rosterNameFromForm(form), undefined);
  assert.equal(rosterHelpers.rosterNameFromForm(form, true), "Blue Guard 1");
  input.value = "Custom Squad";
  rosterHelpers.updateRosterNameDefault(form, { id: 1, name: "Amber Guard" }, []);
  assert.equal(input.value, "Custom Squad");
  assert.equal(rosterHelpers.rosterNameFromForm(form), "Custom Squad");
});

test("tournament form preserves an existing logo unless replaced or removed and permits logo changes after start", () => {
  const bodyFromForm = new Function("t", `${sourceOf("setFormValue")}; ${sourceOf("adminTournamentBodyFromForm")}; return adminTournamentBodyFromForm;`)((key) => key);
  const form = { dataset: {}, elements: { participantMode: { value: "team", disabled: true }, logoData: { value: "", dataset: {} } }, querySelectorAll: () => [] };
  assert.deepEqual(bodyFromForm(form), {});
  form.elements.logoData.dataset.changed = "1";
  form.elements.logoData.value = "data:image/png;base64,YQ==";
  assert.deepEqual(bodyFromForm(form), { logoData: "data:image/png;base64,YQ==" });
  form.elements.logoData.value = "";
  assert.deepEqual(bodyFromForm(form), { logoData: null });
  form.dataset.logoLoading = "1";
  assert.throws(() => bodyFromForm(form), { message: "tournaments.logo.loading" });
});

function logoHarness(confirmDelete = async () => true) {
  const listeners = {};
  const input = { value: "", files: [], addEventListener: (_event, fn) => { listeners.upload = fn; } };
  const remove = { hidden: true, addEventListener: (_event, fn) => { listeners.remove = fn; } };
  const preview = { hidden: true, removeAttribute: () => { delete preview.src; } };
  const status = {};
  const controls = { "[data-tournament-logo-file]": input, "[data-tournament-logo-remove]": remove, "[data-tournament-logo-preview]": preview, "[data-tournament-logo-status]": status };
  const requests = [];
  const form = { dataset: {}, elements: { logoData: { value: "", dataset: {} } }, querySelector: (key) => controls[key], dispatchEvent: (event) => requests.push(event.type) };
  const loads = new Map();
  const wire = new Function("t", "loadImage", "blobToDataUrl", "CustomEvent", "setMessage", "confirmDelete", `${sourceOf("wireTournamentLogo")}; return wireTournamentLogo;`)(
    (key) => key, (file) => new Promise((resolve) => loads.set(file.name, resolve)), async (file) => `data:image/png;base64,${file.name}`,
    class { constructor(type) { this.type = type; } }, () => {}, confirmDelete
  );
  wire(form);
  return { form, input, preview, remove, status, loads, requests, listeners };
}

test("logo selection previews the newest file and ignores a slower previous read", async () => {
  const h = logoHarness();
  h.input.files = [{ name: "first", size: 100, type: "image/png" }];
  const first = h.listeners.upload();
  h.input.files = [{ name: "second", size: 100, type: "image/png" }];
  const second = h.listeners.upload();
  h.loads.get("second")();
  await second;
  h.loads.get("first")();
  await first;
  assert.equal(h.form.elements.logoData.value, "data:image/png;base64,second");
  assert.equal(h.preview.src, h.form.elements.logoData.value);
  assert.equal(h.preview.hidden, false);
  assert.equal(h.remove.hidden, false);
  assert.deepEqual(h.requests, ["tournament-autosave-request"]);
  await h.listeners.remove();
  assert.equal(h.form.elements.logoData.value, "");
  assert.equal(h.form.elements.logoData.dataset.changed, "1");
  assert.equal(h.preview.hidden, true);
});

test("cancelling logo removal preserves the image and does not request autosave", async () => {
  let answer;
  const h = logoHarness(() => new Promise((resolve) => { answer = resolve; }));
  h.form.elements.logoData.value = "existing";
  h.preview.src = "existing";
  h.preview.hidden = false;
  const removing = h.listeners.remove();
  assert.equal(h.form.elements.logoData.value, "existing");
  assert.deepEqual(h.requests, []);
  answer(false);
  await removing;
  assert.equal(h.form.elements.logoData.value, "existing");
  assert.equal(h.preview.src, "existing");
  assert.equal(h.preview.hidden, false);
  assert.deepEqual(h.requests, []);
});

test("oversized or unsupported logos never replace the current image", async () => {
  for (const file of [{ name: "big", size: 1024 * 1024 + 1, type: "image/png" }, { name: "svg", size: 10, type: "image/svg+xml" }]) {
    const h = logoHarness();
    h.form.elements.logoData.value = "existing";
    h.input.files = [file];
    await h.listeners.upload();
    assert.equal(h.form.elements.logoData.value, "existing");
    assert.equal(h.form.dataset.logoLoading, "");
    assert.equal(h.requests.length, 0);
  }
});
