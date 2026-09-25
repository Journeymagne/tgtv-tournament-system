const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { teamGamePermissions } = require("../../src/domain/team-game-permissions");

const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
function clientRules(me, locale = "en") {
  const dictionary = require(`../../public/i18n/${locale}.js`);
  const context = vm.createContext({ state: { me }, t: key => dictionary[key] || key });
  for (const name of ["teamGameResultPermissions", "teamGamePendingMessage", "gameResultFormHint", "gameResultSubmissionMessage"]) {
    const body = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
    assert.ok(body, name);
    vm.runInContext(body, context);
  }
  return context;
}

const rosterA = { id: 10, captainUserId: 11 };
const rosterB = { id: 20, captainUserId: 44 };
const ownGame = {
  sourceType: "team_match_game", venueMode: "tts", playerIds: [11, 22], status: "pending_confirmation",
  teamMatch: { rosterA, rosterB },
  pendingResult: { submittedBy: 11, submittedAs: "captain", submittedRosterId: 10 }
};

test("client and server agree for players, captains, admins and old pending results", () => {
  for (const me of [null, ...[11, 22, 33, 44, 55].map(id => ({ id })), { id: 55, isAdmin: true }]) {
    const client = clientRules(me);
    for (const playerIds of [[11, 22], [33, 22]]) {
      for (const submittedAs of [undefined, "player", "captain"]) {
        for (const status of ["open", "pending_confirmation", "completed", "cancelled"]) {
          const game = { ...ownGame, playerIds, status, pendingResult: { ...ownGame.pendingResult, submittedAs } };
          const server = teamGamePermissions(game, rosterA, rosterB, me);
          for (const serialized of [game, { ...game, playerIds: undefined,
            players: playerIds.map((userId, index) => ({ id: 1000 + index, userId })) }]) {
            const browser = client.teamGameResultPermissions(serialized);
            for (const field of ["canSubmit", "canReview", "captainRosterId", "submitsAsCaptain", "requiresCaptainReview"]) {
              assert.equal(browser[field], server[field], `${field}: ${JSON.stringify({ me, playerIds, status, submittedAs })}`);
            }
          }
        }
      }
    }
  }
});

for (const locale of ["en", "ru"]) test(`result hints and notices distinguish own games from captain reports (${locale})`, () => {
  const rules = clientRules({ id: 11 }, locale);
  const text = require(`../../public/i18n/${locale}.js`);
  const teammateGame = { ...ownGame, playerIds: [33, 22] };
  assert.equal(rules.gameResultFormHint(ownGame), text["teams.results.playerHint"]);
  assert.equal(rules.gameResultFormHint(teammateGame), text["teams.results.captainHint"]);
  assert.equal(rules.gameResultFormHint({ ...ownGame, venueMode: "irl" }), text["teams.results.playerIrlHint"]);
  assert.equal(rules.gameResultFormHint({ ...teammateGame, venueMode: "irl" }), text["teams.results.captainHint"]);
  assert.equal(rules.gameResultFormHint(ownGame, true), text["games.result.hint"]);
  for (const submittedAs of [undefined, "player", "captain"]) {
    const oldOrNew = { ...ownGame, pendingResult: { ...ownGame.pendingResult, submittedAs } };
    assert.equal(rules.teamGamePendingMessage(oldOrNew), text["teams.results.awaitingOpponentOrCaptain"]);
    assert.equal(rules.gameResultSubmissionMessage(oldOrNew), text["teams.results.awaitingOpponentOrCaptain"]);
  }
  assert.equal(rules.teamGamePendingMessage(teammateGame), text["teams.results.awaitingCaptain"]);
  assert.equal(rules.gameResultSubmissionMessage(teammateGame), text["teams.results.awaitingCaptain"]);
  assert.equal(rules.gameResultSubmissionMessage({ ...ownGame, venueMode: "irl", status: "completed" }), text["message.games.matchResultSaved"]);
  assert.equal(rules.gameResultSubmissionMessage({ sourceType: "challenge", status: "pending_confirmation" }), text["message.games.resultSubmittedPending"]);
});
