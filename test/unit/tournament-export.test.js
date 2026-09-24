const test = require("node:test");
const assert = require("node:assert/strict");
const { unzipSync, strFromU8 } = require("../../public/studio/vendor/fflate");
const { tournamentExportTable, tournamentExportXlsx } = require("../../src/domain/tournaments/export");

function fixture() {
  const participants = [
    { id: 11, userId: 2, displayName: "=1+2", faction: "Kasrkin", status: "active" },
    { id: 2, userId: 99, displayName: "Bravo", faction: "Legionaries", status: "active" },
    { id: 20, userId: null, displayName: "Гость", faction: "Kommandos", status: "active" }
  ];
  const low = { crit: 1, tac: 2, kill: 2, primaryBonus: 1, total: 6 };
  const high = { crit: 4, tac: 4, kill: 4, primaryBonus: 2, total: 14 };
  const draw = { crit: 4, tac: 2, kill: 2, primaryBonus: 2, total: 10 };
  return {
    tournament: { name: 'Кубок <осени> & "друзей"', tiebreakerOrder: ["vp_diff", "total_vp", "strength_of_schedule"] },
    participants,
    people: [{ id: 2, name: "Profile name" }],
    tables: [{ id: 31, tableNumber: 7 }],
    rounds: [1, 2, 3].map(n => ({ id: n * 10, roundNumber: n, metadata: { mission: { critOp: "Loot" } } })),
    matches: [
      { roundId: 10, participantAId: 11, participantBId: 2, status: "completed", winnerParticipantId: 2,
        tableId: 31, result: { winnerId: 99, scores: { 2: low, 99: high } } },
      { roundId: 10, participantAId: 20, isBye: true, status: "completed", winnerParticipantId: 20 },
      { roundId: 20, participantAId: 11, participantBId: 20, status: "completed", winnerParticipantId: null,
        result: { winnerId: null, scores: { 2: draw, "-20": draw } } },
      { roundId: 20, participantAId: 2, isBye: true, status: "completed", winnerParticipantId: 2 },
      { roundId: 30, participantAId: 11, participantBId: 2, status: "pending_confirmation", tableId: 31,
        pendingResult: { result: { scores: { 2: high, 99: low } } } }
    ]
  };
}

test("export matches standings and the example's per-round columns, using participant identities", () => {
  const table = tournamentExportTable(fixture());
  assert.equal(table.headers.length, 32);
  assert.deepEqual(table.headers.slice(8, 16), ["номер стола", "Crit Op", "Tac Op", "Kill Op", "Prim", "Vp", "Diff", "TP"]);
  assert.equal(table.headers[5], "Итоговый тайбрейкер 1\nРазница VP");
  assert.deepEqual(table.groups, ["Тур 1 — Loot", "Тур 2 — Loot", "Тур 3 — Loot"]);
  const alpha = table.rows.find(row => row[2] === "=1+2");
  assert.deepEqual(alpha.slice(0, 8), [3, false, "=1+2", "Kasrkin", 1, -8, 16, 10]);
  assert.deepEqual(alpha.slice(8, 16), [7, 1, 2, 2, 1, 6, -8, 0]);
  assert.deepEqual(alpha.slice(16, 24), [null, 4, 2, 2, 2, 10, 0, 1]);
  assert.deepEqual(alpha.slice(24), [7, null, null, null, null, null, null, null]);
  const guest = table.rows.find(row => row[2] === "Гость");
  assert.deepEqual(guest.slice(8, 16), ["BYE", null, null, null, null, 0, 0, 3]);
  assert.deepEqual(guest.slice(24), Array(8).fill(null));
});

test("published places and metrics are retained, including manually ordered places", () => {
  const data = fixture();
  data.tournament.finalResults = [
    { participantId: 11, rank: 1, matchPoints: 1, vpDiff: -8, totalVp: 16, strengthOfSchedule: 10 },
    { participantId: 2, rank: 2, matchPoints: 6, vpDiff: 8, totalVp: 14, strengthOfSchedule: 1 }
  ];
  const rows = tournamentExportTable(data).rows;
  assert.deepEqual(rows.map(row => row.slice(0, 3)), [[1, false, "=1+2"], [2, false, "Bravo"]]);
});

test("withdrawn opponents still contribute their scores and strength of schedule", () => {
  const data = fixture();
  data.participants[1].status = "withdrawn";
  const rows = tournamentExportTable(data).rows;
  assert.equal(rows.length, 2);
  const alpha = rows.find(row => row[2] === "=1+2");
  assert.equal(alpha[7], 10);
  assert.equal(alpha[14], -8);
});

test("explicit score snapshots take priority over overlapping game/user keys", () => {
  const data = fixture();
  const result = data.matches[0].result;
  result.scoresByParticipantId = { 11: result.scores[2], 2: result.scores[99] };
  result.scores = { 2: { total: 99 } };
  const alpha = tournamentExportTable(data).rows.find(row => row[2] === "=1+2");
  assert.deepEqual(alpha.slice(9, 15), [1, 2, 2, 1, 6, -8]);
});

test("unused tiebreakers stay blank, a fourth configured tiebreaker is not lost, empty events export", () => {
  const data = fixture();
  data.tournament.tiebreakerOrder = [];
  assert.deepEqual(tournamentExportTable(data).rows[0].slice(5, 8), [null, null, null]);
  data.tournament.tiebreakerOrder = ["strength_of_schedule", "buchholz", "head_to_head", "total_vp"];
  const table = tournamentExportTable(data);
  assert.equal(table.summaryColumns, 9);
  assert.equal(table.headers[8], "Итоговый тайбрейкер 4\nВсего VP");
  assert.equal(table.headers[9], "номер стола");
  assert.equal(tournamentExportTable({ tournament: {} }).rows.length, 0);
  assert.ok(tournamentExportXlsx({ tournament: {} }).length > 0);
});

test("XLSX contains numeric scores, literal safe text, frozen headers and native unchecked checkboxes", () => {
  const data = fixture();
  const files = unzipSync(tournamentExportXlsx(data));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /Кубок &lt;осени&gt; &amp; &quot;друзей&quot;/);
  assert.match(sheet, /<c r="C5" s="0" t="inlineStr"><is><t xml:space="preserve">=1\+2<\/t>/);
  assert.doesNotMatch(sheet, /<f[ >]/);
  assert.match(sheet, /<c r="E5" s="3"><v>1<\/v><\/c>/);
  assert.match(sheet, /<c r="B3" s="4" t="b"><v>0<\/v><\/c>/);
  assert.equal((sheet.match(/t="b"/g) || []).length, data.participants.length);
  assert.match(sheet, /xSplit="4" ySplit="2"/);
  assert.match(sheet, /mergeCell ref="I1:P1"/);
  assert.match(sheet, /mergeCell ref="Y1:AF1"/);
  assert.match(sheet, /autoFilter ref="A2:AF5"/);
  assert.match(strFromU8(files["xl/styles.xml"]), /xfpb:xfComplement i="0"/);
  assert.match(strFromU8(files["xl/featurePropertyBag/featurePropertyBag.xml"]), /<bag type="Checkbox"\/>/);
  assert.match(strFromU8(files["xl/_rels/workbook.xml.rels"]), /FeaturePropertyBag/);
});
