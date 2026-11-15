const test = require("node:test");
const assert = require("node:assert/strict");
const { tournamentFactionsHidden, rosterForViewer } = require("../../src/domain/tournaments/privacy");

test("factions are revealed only for an active or completed first round", () => {
  for (const rounds of [[], [{ roundNumber: 1, status: "not_ready" }], [{ roundNumber: 2, status: "active" }]]) {
    assert.equal(tournamentFactionsHidden(rounds), true);
  }
  for (const status of ["active", "completed"]) {
    assert.equal(tournamentFactionsHidden([{ roundNumber: 1, status }, { roundNumber: 2, status: "not_ready" }]), false);
  }
});

test("roster privacy preserves names and privileged access without mutating stored factions", () => {
  const roster = {
    id: 1, name: "Squad", captainUserId: 1,
    members: [{ userId: 1, displayNameSnapshot: "Captain", factionSnapshot: "Kommandos" },
      { userId: 2, displayNameSnapshot: "Member", factionSnapshot: "Angels of Death" }]
  };
  for (const user of [null, { id: 99 }]) {
    const shown = rosterForViewer(roster, user);
    assert.equal(shown.name, "Squad");
    assert.deepEqual(shown.members.map((m) => m.displayNameSnapshot), ["Captain", "Member"]);
    assert.ok(shown.members.every((m) => m.factionHidden && !m.factionSnapshot));
  }
  assert.equal(rosterForViewer(roster, { id: 1 }), roster);
  assert.equal(rosterForViewer(roster, { id: 99, isAdmin: true }), roster);
  assert.equal(rosterForViewer(roster, { id: 99 }, { teamLeader: true }), roster);
  assert.equal(rosterForViewer(roster, { id: 2 }), roster);
  const formerMemberRoster = { ...roster, members: roster.members.map((member) => member.userId === 2
    ? { ...member, endedAt: "2026-09-17T10:00:00.000Z" } : member) };
  const formerView = rosterForViewer(formerMemberRoster, { id: 2 });
  assert.equal(formerView.members[0].factionHidden, true);
  assert.equal(formerView.members[0].factionSnapshot, "");
  assert.equal(rosterForViewer(roster, null, { rounds: [{ roundNumber: 1, status: "active" }] }), roster);
  assert.ok(roster.members.every((m) => m.factionSnapshot && !m.factionHidden));
});
