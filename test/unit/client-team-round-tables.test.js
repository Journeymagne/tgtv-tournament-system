const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mapGameLink } = require("../../src/db/repositories/team-matches");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const sourceOf = (name) => {
  const result = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(result, name);
  return result;
};

test("team round setup always renders three editable terrain/deployment pairs with preview defaults", () => {
  const tables = [{ killzone: "Volkus", deployment: 6 }, { killzone: "Gallowdark", deployment: 5 }, { killzone: "Tomb World", deployment: 4 }];
  const render = new Function("t", "optionsHtml", "killzoneOptions", "state",
    `${sourceOf("teamTableImageField")}; ${sourceOf("teamTableSetupFields")}; ${sourceOf("teamRoundMissionFields")}; return teamRoundMissionFields;`
  )((key) => key, (_options, value) => `<option selected>${value}</option>`, [], { adminTournamentDetail: { tournament: { teamTablesLocked: true } } });
  const html = render(tables);
  assert.equal((html.match(/<select /g) || []).length, 6);
  assert.doesNotMatch(html, /disabled|roundCritOp/);
  for (let index = 0; index < 3; index += 1) {
    assert.match(html, new RegExp(`name="teamKillzone-${index}" required`));
    assert.match(html, new RegExp(`value="${6 - index}" selected`));
  }
});

test("round generation submits all three new table selections alongside team pairings", () => {
  const elements = {};
  const expected = ["Volkus", "Tomb World", "WTC ITD"].map((killzone, index) => {
    elements[`teamKillzone-${index}`] = { value: killzone };
    elements[`teamLayout-${index}`] = { value: String(index + 4) };
    return { killzone, deployment: index + 4 };
  });
  const payload = new Function(`${sourceOf("teamTableSetupPayload")}; ${sourceOf("roundSetupPayload")}; return roundSetupPayload;`)();
  assert.deepEqual(payload({ elements, querySelectorAll: () => [] }, { participantMode: "team" }), { tables: expected, matchups: [] });
});

test("TTS WTC has three shared tables and no matchup line selector; Classic and IRL keep lines", () => {
  const tables = Array.from({ length: 6 }, (_, index) => ({ tableNumber: index + 1, killzone: ["Volkus", "Gallowdark", "Tomb World"][index % 3], deployment: 1 }));
  for (const [venueMode, pairingType, expectedCount] of [["tts", "shield_sword", 3], ["tts", "sword_shield_classic", 6], ["irl", "shield_sword", 6]]) {
    const state = { adminTournamentDetail: { tournament: { venueMode, pairingType } } };
    const render = new Function("state", "t", "optionsHtml", "killzoneOptions", "escapeHtml", "teamRoundSetupRosterSelect",
      `${sourceOf("teamTableImageField")}; ${sourceOf("teamTableSetupFields")}; ${sourceOf("savedTeamLinesMarkup")}; ${sourceOf("teamRoundMissionFields")}; ${sourceOf("teamRoundSetupMatchRow")}; return { fields: teamRoundMissionFields, row: teamRoundSetupMatchRow };`
    )(state, key => key, () => "", [], String, name => `<select name="${name}"></select>`);
    const html = render.fields(tables);
    assert.equal((html.match(/data-team-table-setup=/g) || []).length, expectedCount);
    assert.equal(html.includes("classic.linesHint"), expectedCount === 6);
    assert.equal(html.includes("team-line-heading"), expectedCount === 6);
    assert.equal(render.row({ rosterAId: 1, rosterBId: 2 }, tables).includes('name="lineNumber"'), expectedCount === 6);
    if (expectedCount === 3) assert.doesNotMatch(render.fields(tables, {}, true), /data-saved-team-lines|team-line-heading/);
  }
});

test("captain table choices use the match's round snapshot, not a cached tournament's latest tables", () => {
  const form = new Function("state", "t", "escapeHtml", "tableLabel", "teamTournamentTables", "teamEnvironmentStep",
    `${sourceOf("teamPairingMemberLabel")}; ${sourceOf("teamRosterMemberLabel")}; ${sourceOf("teamPairingMatchupLabel")}; ${sourceOf("teamEnvironmentChoiceForm")}; ${sourceOf("teamPairingControlForSide")}; return teamPairingControlForSide;`
  )({ administrationContext: false, me: { id: 101 } }, (key) => key, String, (table) => `${table.killzone}/${table.deployment}`, () => [{ id: 1, killzone: "Wrong round", deployment: 1 }],
    () => ({ kind: "table", side: "a", slot: 1 }));
  const html = form({ id: 7, tournamentId: 4, phase: "environment_selection", tableIds: [1], tables: [{ id: 1, killzone: "Volkus", deployment: 6 }], environment: { step: 0, assignments: [] } }, {}, "a");
  assert.match(html, /Volkus\/6/);
  assert.doesNotMatch(html, /Wrong round/);
});

test("personal game table details prefer stored mission terrain over the base table", () => {
  const row = { table_id: 5, table_number: 2, killzone: "Gallowdark", deployment: 1, mission: { killzone: "Volkus", layout: 6 } };
  assert.deepEqual(mapGameLink(row).table, { id: 5, tableNumber: 2, killzone: "Volkus", deployment: 6 });
  assert.equal(mapGameLink({ ...row, mission: { critOp: "Orb" } }).table.killzone, "Gallowdark");
});
