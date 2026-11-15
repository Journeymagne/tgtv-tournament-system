const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFactions, validateResultFactions } = require("../../src/domain/tournaments/factions");
const { normalizeNewTournament, normalizeTournamentPatch } = require("../../src/domain/tournaments/input");
const { rosterForViewer } = require("../../src/domain/tournaments/privacy");
const { matchParticipant, participantIdentity } = require("../../src/domain/tournaments/results");

test("faction limit defaults to one and applies to every tournament format", () => {
  assert.equal(normalizeNewTournament({}, 1, "default").factionCount, 1);
  for (const body of [{ format: "swiss", swissRoundCount: 3 }, { format: "single_elimination" },
    ...["shield_sword", "sword_shield_classic", "doubles"].map(pairingType => ({ participantMode: "team", format: "swiss", swissRoundCount: 3, venueMode: pairingType === "doubles" ? "irl" : "tts", pairingType }))]) {
    for (const factionCount of [1, 2, 3]) {
      assert.equal(normalizeNewTournament({ ...body, factionCount }, 1, "cup").factionCount, factionCount);
    }
  }
  for (const factionCount of [0, 4, 1.5, true, null, "invalid"]) {
    assert.throws(() => normalizeTournamentPatch({ factionCount }), /Faction count/);
  }
});

test("extra registration slots are optional while limits and unique canonical factions are enforced", () => {
  assert.deepEqual(normalizeFactions({ faction: "Kommandos" }, { factionCount: 3 }), ["Kommandos"]);
  assert.deepEqual(normalizeFactions({ factions: ["Kommandos", "", " "] }, { factionCount: 3 }), ["Kommandos"]);
  assert.deepEqual(normalizeFactions({ factions: ["Kommandos", "Kasrkin"] }, { factionCount: 3 }), ["Kommandos", "Kasrkin"]);
  assert.deepEqual(normalizeFactions({ factions: [] }, { factionCount: 3 }, { allowEmpty: true }), []);
  assert.throws(() => normalizeFactions({ factions: [] }, { factionCount: 3 }), /at least one/);
  assert.throws(() => normalizeFactions({ factions: ["Kommandos", "kommandos"] }, { factionCount: 3 }), /unique/);
  assert.throws(() => normalizeFactions({ factions: ["Kommandos", "Kasrkin"] }, { factionCount: 1 }), /Too many/);
  assert.throws(() => normalizeFactions({ factions: ["Unknown"] }, { factionCount: 3 }), /valid Kill Team/);
  assert.throws(() => normalizeFactions({ factions: "Kommandos" }, { factionCount: 3 }), /valid factions/);
});

test("multi-faction reports use each player's own registration including proxy result keys", () => {
  const players = [{ id: 8, userId: 10, factions: ["Kommandos", "Kasrkin"] },
    { id: 12, userId: null, factionSnapshot: "Legionaries" }];
  const result = { scores: { 10: { faction: "Kasrkin" }, [-12]: { faction: "Legionaries" } } };
  assert.doesNotThrow(() => validateResultFactions({ factionCount: 3 }, result, players));
  assert.throws(() => validateResultFactions({ factionCount: 3 }, { scores: {
    10: { faction: "Legionaries" }, [-12]: { faction: "Legionaries" }
  } }, players), /registered faction/);
  assert.throws(() => validateResultFactions({ factionCount: 3 }, { scores: {} }, players), /registered faction/);
  assert.doesNotThrow(() => validateResultFactions({ factionCount: 3 }, { scores: {} }, [{ id: 1, isProxy: true }]));
  assert.doesNotThrow(() => validateResultFactions({ factionCount: 1 }, { scores: {} }, players));
});

test("hidden and historical participants do not leak additional factions", () => {
  const member = { id: 8, userId: 10, factionSnapshot: "Kommandos", factions: ["Kommandos", "Kasrkin"] };
  const roster = { id: 1, tournamentId: 2, members: [member] };
  const hidden = rosterForViewer(roster, { id: 99 });
  assert.deepEqual(hidden.members[0].factions, []);
  assert.deepEqual(member.factions, ["Kommandos", "Kasrkin"]);
  assert.equal(rosterForViewer(roster, { id: 10 }), roster);
  const participant = { ...member, faction: "Kommandos", factionHidden: true };
  const snapshots = { [member.id]: participantIdentity(participant) };
  assert.deepEqual(matchParticipant({ participantSnapshots: snapshots }, participant).factions, []);
  const replacement = { ...member, faction: "Legionaries", factions: ["Legionaries", "Blooded"] };
  assert.deepEqual(matchParticipant({ participantSnapshots: { [member.id]: { faction: "Kommandos" } } }, replacement).factions, ["Kommandos"]);
});
