const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { seasons } = require("../../public/game-data.js");
const appSource = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const filterSource = appSource.match(
  /function filterGamesBySeason\(games, season\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction renderKillTeamWinrates)/
)?.[0];

test("Q2 and Q3 statistics split at the start of 26 September 2026 in Yerevan", () => {
  assert.ok(filterSource, "could not find filterGamesBySeason in public/app.js");
  const factory = new Function(`${filterSource}; return filterGamesBySeason;`);
  const filterGamesBySeason = factory();
  const q2 = seasons.find((season) => season.id === "2026-q2-dataslate");
  const q3 = seasons.find((season) => season.id === "2026-q3-dataslate");
  const games = [
    { id: 1, submittedAt: "2026-09-25T19:59:59Z" },
    { id: 2, submittedAt: "2026-09-25T20:00:00Z" },
    { id: 3, submittedAt: "2026-09-26T08:00:00Z" }
  ];

  assert.deepEqual(filterGamesBySeason(games, q2).map((game) => game.id), [1]);
  assert.deepEqual(filterGamesBySeason(games, q3).map((game) => game.id), [2, 3]);
});

test("tournament games use the tournament season instead of their timestamp", () => {
  assert.ok(filterSource, "could not find filterGamesBySeason in public/app.js");
  const factory = new Function(`${filterSource}; return filterGamesBySeason;`);
  const filterGamesBySeason = factory();
  const q3 = seasons.find((season) => season.id === "2026-q3-dataslate");
  const games = [
    {
      id: 4,
      sourceType: "tournament_match",
      tournament: { seasonId: "2026-q3-dataslate" },
      submittedAt: "2026-09-01T08:00:00Z"
    },
    {
      id: 5,
      sourceType: "tournament_match",
      tournament: { seasonId: "2026-q2-dataslate" },
      submittedAt: "2026-10-01T08:00:00Z"
    }
  ];

  assert.deepEqual(filterGamesBySeason(games, q3).map((game) => game.id), [4]);
});
