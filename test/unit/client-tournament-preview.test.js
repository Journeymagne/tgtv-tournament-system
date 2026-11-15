const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const names = ["normalizeTournamentMatchSearch", "tournamentMatchSearchText", "tournamentPreviewRound",
  "roundSetupPayload", "teamTableSetupPayload", "datetimeLocalToIso", "datetimeLocalValue"];
const functions = names.map(name => {
  const body = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(body, name);
  return body;
}).join("\n");
const ui = new Function(`${functions}; return { ${names.join(", ")} };`)();

test("round search finds nicknames, roster/club names, visible factions and public Telegram contacts", () => {
  const text = ui.tournamentMatchSearchText({ rosterA: {
    name: "МОНКЕ ПАНК СКВАД", team: { name: "Organization" },
    members: [{ displayNameSnapshot: "Player One", user: { name: "NewNickname", telegramContact: "https://t.me/My_User" }, factionSnapshot: "Novitiates" }]
  }, rosterB: { name: "Opponent", members: [{ displayNameSnapshot: "Hidden Faction", factionHidden: true, factionSnapshot: "Kommandos", factions: ["Kommandos"] }] } });
  for (const query of ["монке", "Organization", "Player One", "newnickname", "@MY_USER", "https://t.me/My_User", "Novitiates"]) {
    assert.ok(text.includes(ui.normalizeTournamentMatchSearch(query)), query);
  }
  assert.ok(!text.includes("kommandos"), "search must not reveal hidden factions");
  assert.equal(ui.tournamentMatchSearchText({}), "");
  assert.match(ui.tournamentMatchSearchText({ participantA: { displayName: "Guest", isProxy: true },
    participantB: { user: { registerNickname: "OldNick", telegramContact: "@Solo" }, faction: "Kasrkin" } }), /guest oldnick solo kasrkin/);
});

test("preview shows the active round before future bracket rounds, then the latest completed round", () => {
  const rounds = [{ roundNumber: 3, status: "not_ready" }, { roundNumber: 2, status: "active" }, { roundNumber: 1, status: "completed" }];
  assert.equal(ui.tournamentPreviewRound(rounds).roundNumber, 2);
  rounds[1].status = "completed";
  assert.equal(ui.tournamentPreviewRound(rounds).roundNumber, 2);
  assert.equal(ui.tournamentPreviewRound([{ roundNumber: 2, status: "not_ready" }, { roundNumber: 1, status: "not_ready" }]).roundNumber, 1);
  assert.equal(ui.tournamentPreviewRound([]), null);
});

test("solo and team setup send an absolute optional deadline and restore it in the local input", () => {
  const value = "2026-10-30T23:30";
  const form = { elements: { roundEndsAt: { value }, roundKillzone: { value: "Volkus" }, roundLayout: { value: "3" }, roundCritOp: { value: "Loot" } }, querySelectorAll: () => [] };
  for (const participantMode of ["individual", "team"]) {
    const tournament = { participantMode, venueMode: "tts" };
    const payload = ui.roundSetupPayload(form, tournament);
    assert.equal(payload.endsAt, new Date(value).toISOString());
    assert.equal(ui.datetimeLocalValue(payload.endsAt), value);
    if (participantMode === "individual") assert.deepEqual(payload.mission, { killzone: "Volkus", layout: "3", critOp: "Loot" });
  }
  form.elements.roundEndsAt.value = "";
  assert.equal(ui.roundSetupPayload(form, { participantMode: "team" }).endsAt, null);
  delete form.elements.roundEndsAt;
  assert.equal(Object.hasOwn(ui.roundSetupPayload(form, { participantMode: "team" }), "endsAt"), false);
});
