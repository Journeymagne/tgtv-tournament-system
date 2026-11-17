const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
function functionSource(name) {
  return source.match(new RegExp(`function ${name}\\([^]*?\\r?\\n\\}`))[0];
}

test("Swiss preparation offers removal separately from clearing; active pairings and fixed brackets do not", () => {
  let html;
  const tournament = { format: "swiss", venueMode: "irl" };
  const render = new Function("state", "document", "closeRoundSetupModal", "wireRoundSetupModal", "t", "escapeHtml",
    "venueModeLabel", "roundMissionFields", "roundSetupPlayerSelect", "roundSetupTableSelect",
    functionSource("roundSetupMatchRow") + "\n" + functionSource("renderRoundSetupModal") + "; return renderRoundSetupModal;"
  )({ adminTournamentDetail: { tournament } }, { body: { insertAdjacentHTML: (_position, value) => { html = value; } } },
    () => {}, () => {}, key => key, String, String, () => "", () => "", () => "");
  const preview = { prepared: true, round: { matches: [{}] } };
  render(preview);
  assert.match(html, /data-round-setup-clear/);
  assert.match(html, /data-round-setup-remove/);
  render({ ...preview, activePairings: true, lockedMatches: [] });
  assert.doesNotMatch(html, /data-round-setup-remove/);
  tournament.format = "single_elimination";
  render(preview);
  assert.doesNotMatch(html, /data-round-setup-remove/);
});

test("removing a preparation row releases its selections and omits it from the saved payload", () => {
  const makeRow = (a, b, table) => ({ dataset: {}, querySelector: selector => ({
    '[name="participantAId"]': { value: a }, '[name="participantBId"]': { value: b },
    '[name="tableId"]': { value: table }
  })[selector] });
  const removedRow = makeRow("1", "2", "8"), keptRow = makeRow("3", "4", "9");
  const rows = [removedRow, keptRow];
  removedRow.remove = () => rows.splice(rows.indexOf(removedRow), 1);
  let onClick, refreshes = 0, warnings = 0;
  const list = { addEventListener: (type, handler) => { if (type === "click") onClick = handler; } };
  const form = { elements: {}, querySelector: () => null, addEventListener() {},
    querySelectorAll: selector => selector === ".round-setup-match-row" ? rows : [] };
  const document = { querySelector: selector => ({ "[data-round-setup-list]": list, "[data-round-setup-form]": form })[selector],
    querySelectorAll: () => [] };
  const wire = new Function("document", "wireTeamTableImages", "closeRoundSetupModal", "updateRoundSetupPlayerSelects",
    "updateRoundSetupWarnings", "updateRoundSetupTableDeployment", functionSource("wireRoundSetupModal") + "; return wireRoundSetupModal;"
  )(document, () => {}, () => {}, () => { refreshes++; }, () => { warnings++; }, () => {});
  wire({ format: "swiss", venueMode: "irl" }, [], { prepared: true });
  const previousRefreshes = refreshes, previousWarnings = warnings;
  const button = { closest: selector => selector === ".round-setup-match-row" ? removedRow : null };
  onClick({ target: { closest: selector => selector === "[data-round-setup-remove]" ? button : null } });
  assert.deepEqual(rows, [keptRow]);
  assert.equal(refreshes, previousRefreshes + 1);
  assert.equal(warnings, previousWarnings + 1);
  const payload = new Function(functionSource("roundSetupPayload") + "; return roundSetupPayload;")()(form, { venueMode: "irl" });
  assert.deepEqual(payload.matchups, [{ participantAId: "3", participantBId: "4", tableId: "9" }]);
});
