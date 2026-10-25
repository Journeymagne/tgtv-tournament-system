const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRoundDeadline } = require("../../src/domain/tournaments/round-deadline");

test("round deadlines are optional and preserve the instant across timezones", () => {
  for (const value of [undefined, null, ""]) assert.equal(normalizeRoundDeadline(value), null);
  assert.equal(normalizeRoundDeadline("2026-10-30T23:30:00+04:00"), "2026-10-30T19:30:00.000Z");
  assert.equal(normalizeRoundDeadline("2026-10-30T19:30Z"), "2026-10-30T19:30:00.000Z");
  assert.equal(normalizeRoundDeadline("2028-02-29T12:00Z"), "2028-02-29T12:00:00.000Z");
});

test("ambiguous local dates, invalid calendar dates and non-string deadlines are rejected", () => {
  for (const value of [0, true, {}, [], "tomorrow", "2026-10-30", "2026-10-30T23:30", "2026-02-30T12:00Z", "2026-13-01T00:00Z"]) {
    assert.throws(() => normalizeRoundDeadline(value), error => error.status === 400);
  }
});
