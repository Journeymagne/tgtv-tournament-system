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

test("team deletion is shown only to managers and explains blocked actions", () => {
  const render = (me, viewer) => new Function("state", "t", `${extract("teamDeletionPanel")}; return teamDeletionPanel;`)(
    { me }, (key) => key
  )({ id: 7, archivedAt: "2026-09-01", viewer });
  assert.equal(render(null, { canDelete: true }), "");
  assert.equal(render({}, { isMember: true }), "");
  for (const role of ["isLeader", "canAdmin"]) {
    const allowed = render({}, { [role]: true, canDelete: true });
    assert.match(allowed, /data-team-delete="7"/);
    assert.doesNotMatch(allowed, /disabled/);
    for (const reason of ["matches", "activeTournament"]) {
      const blocked = render({}, { [role]: true, canDelete: false, deleteBlockedReason: reason });
      assert.match(blocked, /disabled/);
      assert.ok(blocked.includes(`teams.delete.${reason}`));
    }
  }
});

function deletionHarness({ confirmed = true, error = null } = {}) {
  const team = { id: 7, name: "Amber Guard" };
  const state = { me: {}, view: "team", teamsTab: "admin", teamProfile: { team }, teamReturnHash: "#/teams/admin" };
  const calls = [];
  const factory = new Function("state", "t", "confirmDelete", "api", "clearPlayerTeamRoute", "loadTeamsDashboard", "loadNotifications", "syncAppHash", "renderShell", "setMessage", `
    ${extract("deletePlayerTeam")}; return deletePlayerTeam;
  `);
  const remove = factory(state, (key) => key, async () => { calls.push("confirm"); return confirmed; }, async (url, options) => {
    calls.push([url, options.method]);
    if (error) throw new Error(error);
  }, () => calls.push("clearRoute"), async () => calls.push("dashboard"), async () => calls.push("notifications"),
  () => calls.push("syncHash"), () => calls.push("render"), (...args) => calls.push(args));
  return { state, calls, remove, team, button: { disabled: false } };
}

test("cancelling deletion makes no request and preserves the current profile", async () => {
  const ui = deletionHarness({ confirmed: false });
  await ui.remove(ui.team, ui.button);
  assert.deepEqual(ui.calls, ["confirm"]);
  assert.ok(ui.state.teamProfile);
  assert.equal(ui.button.disabled, false);
});

test("successful deletion reloads teams and invitations and leaves the deleted profile", async () => {
  const ui = deletionHarness();
  await ui.remove(ui.team, ui.button);
  assert.deepEqual(ui.calls, ["confirm", ["/api/teams/7", "DELETE"], "clearRoute", "dashboard", "notifications", "syncHash", "render", ["teams.message.deleted"]]);
  assert.equal(ui.state.teamProfile, null);
  assert.equal(ui.state.teamReturnHash, "");
  assert.equal(ui.state.view, "teams");
  assert.equal(ui.state.teamsTab, "mine");
});

test("a server refusal keeps the team profile and allows retrying", async () => {
  const ui = deletionHarness({ error: "Team now has a match" });
  await ui.remove(ui.team, ui.button);
  assert.deepEqual(ui.calls, ["confirm", ["/api/teams/7", "DELETE"], ["Team now has a match", true]]);
  assert.ok(ui.state.teamProfile);
  assert.equal(ui.button.disabled, false);
});
