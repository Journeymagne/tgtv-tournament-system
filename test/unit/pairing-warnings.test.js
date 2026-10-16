const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const warnings = require("../../public/pairing-warnings");
const { reviewPairingWarnings } = require("../../src/api/pairing-warnings");
const { buildSwissNextRound } = require("../../src/domain/tournaments/swiss");

const players = [1, 2, 3, 4].map(id => ({ id, userId: id + 100, displayName: `Player ${id}` }));
const tables = [{ id: 10, tableNumber: 1 }, { id: 20, tableNumber: 2 }];
const match = (overrides = {}) => ({ roundNumber: 2, status: "completed", participantAId: 1,
  participantBId: 2, tableId: 10, winnerParticipantId: null, ...overrides });
const normalized = value => warnings.individual(value, players, tables);
const previous = [normalized(match())];
const next = normalized(match({ roundNumber: 3, status: "active", participantAId: 2, participantBId: 1 }));

test("drawn opponents warn in either order, with a separate IRL table warning for each player", () => {
  const result = warnings.warnings(next, previous, "irl");
  assert.deepEqual(result.map(item => item.kind), ["rematch", "table_repeat", "table_repeat"]);
  assert.deepEqual(result[0].rounds, [2]);
  assert.deepEqual(result.slice(1).map(item => item.names), [["Player 2"], ["Player 1"]]);
  assert.ok(result.slice(1).every(item => item.tableNumber === 1));
  assert.deepEqual(warnings.warnings(next, previous, "tts").map(item => item.kind), ["rematch"]);
});

test("switching opponents or tables recalculates the affected warning only", () => {
  assert.deepEqual(warnings.warnings(normalized(match({ roundNumber: 3, participantBId: 3 })), previous, "irl")
    .map(item => [item.kind, item.names]), [["table_repeat", ["Player 1"]]]);
  assert.deepEqual(warnings.warnings({ ...next, tableId: 20, tableNumber: 2 }, previous, "irl")
    .map(item => item.kind), ["rematch"]);
});

test("byes, unfinished matches and the current or later round do not count as played", () => {
  const ignored = [match({ isBye: true }), match({ status: "active" }), match({ status: "pending_confirmation" }),
    match({ roundNumber: 3 }), match({ roundNumber: 4 })].map(normalized);
  assert.deepEqual(warnings.warnings(next, ignored, "irl"), []);
  assert.deepEqual(warnings.warnings({ ...next, b: null }, previous, "irl"), []);
});

test("historical player identity comes from the match snapshot after a seat replacement", () => {
  const history = [normalized(match({ participantSnapshots: { 1: { userId: 999, displayName: "Previous occupant" } } }))];
  const result = warnings.warnings(next, history, "irl");
  assert.deepEqual(result.map(item => [item.kind, item.names]), [["table_repeat", ["Player 2"]]]);
});

test("team and captain pairings compare roster identity and actual game players", () => {
  const rosters = [{ id: 1, name: "Alpha", members: [{ id: 11, userId: 101, playerName: "A" }] },
    { id: 2, name: "Beta", members: [{ id: 21, userId: 102, playerName: "B" }] }];
  const prior = { roundNumber: 1, phase: "completed", rosterAId: 1, rosterBId: 2,
    games: [{ slot: 1, rosterAMemberId: 11, rosterBMemberId: 21, tableId: 10,
      game: { status: "completed", players: [{ userId: 101, name: "A" }, { userId: 102, name: "B" }] } }] };
  const proposed = { roundNumber: 2, phase: "environment_selection", rosterAId: 1, rosterBId: 2,
    pairings: [{ slot: 1, rosterAMemberId: 11, rosterBMemberId: 21 }], environment: { assignments: [{ slot: 1, tableId: 10 }] } };
  assert.equal(warnings.warnings(warnings.team(proposed, rosters), [warnings.team(prior, rosters)])[0].kind, "team_rematch");
  const oldGames = warnings.teamGames(prior, rosters, tables);
  const games = warnings.teamGames(proposed, rosters, tables);
  assert.deepEqual(warnings.warnings(games[0], oldGames, "irl").map(item => item.kind), ["rematch", "table_repeat", "table_repeat"]);
});

test("automatic tables prefer fresh tables and preserve an explicit choice", () => {
  const automatic = warnings.assignTables([{ ...next, tableId: null }], tables, previous)[0];
  assert.equal(automatic.tableId, 20);
  assert.equal(warnings.assignTables([next], tables, previous)[0].tableId, 10);
});

test("a reviewed warning is advisory and its acknowledgement applies only to the reviewed pairings", () => {
  let review;
  assert.throws(() => reviewPairingWarnings({ reviewPairingWarnings: true }, [next], previous, "irl"), error => {
    review = error.pairingWarningReview;
    return error.status === 409 && review.warnings.length === 3;
  });
  assert.doesNotThrow(() => reviewPairingWarnings({ reviewPairingWarnings: true,
    pairingWarningAcknowledgement: review.warningKey }, [next], previous, "irl"));
  assert.throws(() => reviewPairingWarnings({ reviewPairingWarnings: true,
    pairingWarningAcknowledgement: review.warningKey }, [{ ...next, tableId: 20 }], previous, "irl"));
  assert.doesNotThrow(() => reviewPairingWarnings({}, [next], previous, "irl"));
});

test("the preview bye remains fixed while warning acknowledgement is retried", () => {
  const participants = [...players, { id: 5, userId: 105 }].map(player => ({ ...player, status: "active" }));
  for (const random of [() => 0, () => 0.99]) {
    const round = buildSwissNextRound({ swissRoundCount: 3 }, participants, [], 2, random, 3);
    assert.equal(round.matches.find(match => match.isBye).participantAId, 3);
  }
});

const appSource = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const clientReviewSource = appSource.match(/async function apiWithPairingWarnings\([^\n]*\) \{[\s\S]*?\r?\n\}/)[0];

test("starting with warnings requires both confirmations; cancelling either does not retry the write", async () => {
  for (const decisions of [[false], [true, false], [true, true]]) {
    let requests = 0;
    let confirmations = 0;
    const request = new Function("api", "confirmAction", "t", "pairingWarningText",
      `${clientReviewSource}; return apiWithPairingWarnings;`)(async (_path, { body }) => {
      requests += 1;
      if (body.pairingWarningAcknowledgement === "reviewed") return { started: true };
      const error = new Error("review");
      error.pairingWarningReview = { warningKey: "reviewed", warnings: [{ kind: "rematch" }] };
      throw error;
    }, async () => decisions[confirmations++], key => key, () => "Repeated opponents");
    const result = await request("/round", { method: "POST" });
    assert.equal(confirmations, decisions.length);
    assert.equal(requests, decisions.every(Boolean) ? 2 : 1);
    assert.deepEqual(result, decisions.every(Boolean) ? { started: true } : null);
  }
});
