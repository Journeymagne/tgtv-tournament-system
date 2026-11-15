const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeTeamName,
  teamNameKey,
  normalizeTeamDescription,
  normalizeTeamLogo,
  normalizeRosterName
} = require("../../src/domain/player-teams");
const { ValidationError } = require("../../src/http/io");

test("team and roster names are normalized and bounded", () => {
  assert.equal(normalizeTeamName("  Orange   Guard "), "Orange Guard");
  assert.equal(teamNameKey(" Orange Guard "), "orange guard");
  assert.equal(normalizeRosterName("  First   Line "), "First Line");
  assert.throws(() => normalizeTeamName("x"), ValidationError);
  assert.throws(() => normalizeRosterName("x".repeat(81)), ValidationError);
});

test("team descriptions use the public profile text rules", () => {
  assert.equal(normalizeTeamDescription("  line one  "), "line one");
  assert.throws(() => normalizeTeamDescription("x".repeat(6001)), ValidationError);
});

test("team logos accept supported image data URLs up to one megabyte", () => {
  assert.equal(normalizeTeamLogo(undefined), undefined);
  assert.equal(normalizeTeamLogo(""), null);
  assert.equal(normalizeTeamLogo("data:image/png;base64,YQ=="), "data:image/png;base64,YQ==");
  assert.throws(() => normalizeTeamLogo("data:text/plain;base64,YQ=="), ValidationError);
  assert.throws(() => normalizeTeamLogo(`data:image/png;base64,${"A".repeat(1400004)}`), ValidationError);
});
