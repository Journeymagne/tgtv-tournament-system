const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createI18n } = require("../../public/i18n.js");

const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const i18n = createI18n({ en: require("../../public/i18n/en.js"), ru: require("../../public/i18n/ru.js") });
const names = ["tournamentRoundMatchCounts", "tournamentRoundProgressMarkup", "defaultTournamentRoundNumber", "tournamentRoundsTabbedMarkup"];
const functions = names.map((name) => {
  const body = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(body, name);
  return body;
}).join("\n");
const { tournamentRoundMatchCounts: count, tournamentRoundsTabbedMarkup: render } = new Function(
  "t", "plural", "escapeHtml", "tournamentMatchStatusLabel", "tournamentRoundSelections",
  `${functions}; return { ${names.join(", ")} };`
)(i18n.t, i18n.plural, String, String, new Map());
const teamTournament = { participantMode: "team", teamSize: 3 };
const game = (slot, status) => ({ slot, game: { status, result: status === "completed" ? {} : null } });

test("round counts include planned personal games and update after confirmation", () => {
  const round = { matches: Array.from({ length: 12 }, (_, index) => ({
    games: index >= 10 ? [] : [1, 2, 3].map((slot) => {
      const position = index * 3 + slot;
      return game(slot, position <= 25 ? "completed" : position <= 28 ? "pending_confirmation" : "open");
    })
  })) };
  assert.deepEqual(count(round, teamTournament), { total: 36, completed: 25, pending: 3, unplayed: 8 });
  round.matches[8].games[1] = game(2, "completed");
  assert.deepEqual(count(round, teamTournament), { total: 36, completed: 26, pending: 2, unplayed: 8 });
  round.matches[8].games[1] = game(2, "open");
  assert.deepEqual(count(round, teamTournament), { total: 36, completed: 25, pending: 2, unplayed: 9 });
});

test("byes and forfeits do not create unplayed games; played forfeit results remain counted", () => {
  const round = { matches: [
    { resolution: "bye", games: [] },
    { resolution: "forfeit", games: [game(1, "completed")] },
    { games: [] }
  ] };
  assert.deepEqual(count(round, teamTournament), { total: 4, completed: 1, pending: 0, unplayed: 3 });
  assert.deepEqual(count({ matches: [{ games: [game(1, "open"), game(2, "pending_confirmation")] }] }, teamTournament),
    { total: 3, completed: 0, pending: 1, unplayed: 2 });
});

test("individual rounds count matches without byes or cancellations", () => {
  const round = { matches: [
    { status: "completed" }, { status: "pending_confirmation" }, { status: "active" },
    { status: "completed", isBye: true }, { status: "cancelled" }
  ] };
  assert.deepEqual(count(round), { total: 3, completed: 1, pending: 1, unplayed: 1 });
  assert.deepEqual(count({}), { total: 0, completed: 0, pending: 0, unplayed: 0 });
});

test("each round renders its own localized totals and three readable status labels", () => {
  i18n.setLocale("ru");
  const rounds = [
    { roundNumber: 1, status: "completed", matches: [{ games: [game(1, "completed"), game(2, "completed"), game(3, "completed")] }] },
    { roundNumber: 2, status: "active", matches: [{ games: [game(1, "pending_confirmation")] }, { games: [] }] }
  ];
  const html = render(rounds, () => "MATCH", "test", teamTournament);
  assert.match(html, /3 матча/);
  assert.match(html, /6 матчей/);
  assert.match(html, /3 сыграно/);
  assert.match(html, /1 на подтверждении/);
  assert.match(html, /5 не сыграно/);
  for (const status of ["completed", "pending", "unplayed"]) {
    assert.equal((html.match(new RegExp(`data-result-state="${status}"`, "g")) || []).length, 2);
  }
  i18n.setLocale("en");
  assert.match(render(rounds, () => "MATCH", "test", teamTournament), /6 matches/);
});
