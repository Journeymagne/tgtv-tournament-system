const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createI18n } = require("../../public/i18n.js");

const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const i18n = createI18n({ en: require("../../public/i18n/en.js"), ru: require("../../public/i18n/ru.js") });
const names = ["tournamentStatsContent", "tournamentFactionPicks", "tournamentFactionPicksTable",
  "tournamentKillTeamStats", "addTournamentStatLine", "tournamentTacOpStats", "tournamentTacOpStatsTable",
  "tournamentStatsTable", "tacOpWinrateSummary", "gameScoreEntries", "statsTeamFilterMatchesWithFilters", "statNumber", "formatAverage"];
const functions = names.map(name => {
  const body = source.match(new RegExp(`function ${name}\\([^]*?\\r?\\n\\}`))?.[0];
  assert.ok(body, name);
  return body;
}).join("\n");
const escapeHtml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const { tournamentStatsContent: render, tournamentFactionPicks: picks, tournamentKillTeamStats: results,
  tournamentTacOpStats: tacOps } = new Function("t", "escapeHtml", "metricCard", "seasonLabel", "signed",
  "canonicalKillTeamName", "canonicalTacOpName", `${functions}; return { ${names.join(", ")} };`)(
  i18n.t, escapeHtml, (label, value) => `<div>${label}: ${value}</div>`, String, String, String, String);

const result = { winnerId: 1, scores: {
  1: { total: 16, faction: "Kommandos", tacOp: "Plant Banner", tac: 4, primary: "tac" },
  2: { total: 12, faction: "Death Korps", tacOp: "Retrieval", tac: 2, primary: "kill" }
} };
const game = (id, status) => ({ id, status,
  players: [{ id: 1, faction: "Kommandos" }, { id: 2, faction: "Death Korps" }],
  result: status === "completed" ? result : null,
  pendingResult: status === "pending_confirmation" ? { result } : null,
  teamMatch: { phase: "in_progress" }
});

test("individual completed results count while the team match continues; pending and reopened games do not", () => {
  i18n.setLocale("en");
  const data = { tournament: { participantMode: "team" },
    teamMatches: [{ phase: "in_progress" }],
    tournamentGames: [game(1, "completed"), game(2, "pending_confirmation"), game(3, "open")] };
  assert.match(render(data), /Completed games: 1/);
  assert.match(render(data), /Plant Banner/);
  assert.match(render(data), /1-0-0/);
  assert.equal(results([data.tournamentGames[0]]).find(row => row.name === "Kommandos").wins, 1);
  assert.equal(tacOps(data.tournamentGames).find(row => row.tacOp === "Plant Banner").games, 1);
  data.tournamentGames[1] = game(2, "completed");
  assert.match(render(data), /Completed games: 2/);
  assert.match(render(data), /2-0-0/);
  data.tournamentGames[0] = game(1, "open");
  assert.match(render(data), /Completed games: 1/);
});

test("team picks count current roster members once, including players with no completed games", () => {
  const data = { tournament: { participantMode: "team" }, rosters: [
    { status: "active", members: [{ factionSnapshot: "Kommandos" }, { factionSnapshot: "Death Korps" },
      { factionSnapshot: "Mandrakes", endedAt: "2026-09-01" }] },
    { status: "finished", members: [{ factionSnapshot: "Kommandos" }, { factionSnapshot: " " }] },
    { status: "withdrawn", members: [{ factionSnapshot: "Mandrakes" }] },
    { status: "registered", isReserve: true, members: [] }
  ], tournamentGames: [game(1, "completed"), game(2, "completed"), game(3, "completed")] };
  assert.deepEqual(picks(data), { hidden: false, rows: [
    { name: "Kommandos", picks: 2 }, { name: "Death Korps", picks: 1 }
  ] });
  data.tournamentGames = [];
  assert.equal(picks(data).rows[0].picks, 2);
  for (const [locale, title, empty] of [["en", "Faction picks", "No completed tournament games yet"],
    ["ru", "Пики фракций", "Пока нет завершённых турнирных игр"]]) {
    i18n.setLocale(locale);
    const html = render(data);
    assert.ok(html.includes(title));
    assert.ok(html.includes(empty));
    assert.match(html, /Kommandos<\/td><td>2/);
  }
});

test("solo picks exclude withdrawn and removed participants; tied counts sort by faction", () => {
  assert.deepEqual(picks({ tournament: { participantMode: "individual" }, participants: [
    { faction: "Kommandos", status: "active" }, { faction: "Death Korps", status: "finished" },
    { faction: "Mandrakes", status: "withdrawn" }, { faction: "Mandrakes", status: "removed" }
  ] }), { hidden: false, rows: [{ name: "Death Korps", picks: 1 }, { name: "Kommandos", picks: 1 }] });
});

test("hidden factions never produce a misleading partial pick table", () => {
  const member = { faction: "Kommandos" };
  const hidden = { faction: "Secret faction", factionHidden: true };
  for (const data of [
    { participants: [member, hidden] },
    { tournament: { participantMode: "team" }, rosters: [{ members: [member, hidden]
      .map(p => ({ factionSnapshot: p.faction, factionHidden: p.factionHidden })) }] }
  ]) {
    assert.deepEqual(picks(data), { hidden: true, rows: [] });
    assert.doesNotMatch(render(data), /Secret faction|Kommandos/);
  }
});

test("empty tournaments still render a pick block and faction labels are escaped", () => {
  i18n.setLocale("en");
  assert.match(render({}), /Participants have not picked any factions yet/);
  const html = render({ participants: [{ faction: "<img src=x>" }] });
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<img src=x>/);
});
