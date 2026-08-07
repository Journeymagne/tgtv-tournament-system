const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChallengeEvents,
  buildTrackProgress,
  buildChallengeTracks
} = require("../../src/domain/challenge-progress");
const { CLASSIFIED_TRACK, WILDCARDS } = require("../../src/domain/kill-teams");

function completedGame(id, winnerId, faction, at) {
  return {
    id,
    status: "completed",
    playerIds: [winnerId, 999],
    submittedAt: at,
    createdAt: at,
    result: { winnerId, scores: { [winnerId]: { faction } } }
  };
}

test("победы дают события credit", () => {
  const user = { id: 1, challengeCredits: [] };
  const games = [completedGame(1, 1, "Kasrkin", "2026-01-01T00:00:00.000Z")];
  const events = buildChallengeEvents(games, user);

  assert.equal(events.length, 1);
  assert.equal(events[0].team, "Kasrkin");
  assert.equal(events[0].action, "credit");
  assert.equal(events[0].source, "game");
  assert.equal(events[0].gameId, 1);
});

test("поражения и незавершённые игры событий не дают", () => {
  const user = { id: 1, challengeCredits: [] };
  const games = [
    completedGame(1, 2, "Kasrkin", "2026-01-01T00:00:00.000Z"),
    { id: 2, status: "open", playerIds: [1, 2], result: null }
  ];
  assert.deepEqual(buildChallengeEvents(games, user), []);
});

test("исторические названия в сохранённых данных приводятся к канону", () => {
  const user = { id: 1, challengeCredits: [] };
  const games = [completedGame(1, 1, "Tempestus Aquillons", "2026-01-01T00:00:00.000Z")];
  assert.equal(buildChallengeEvents(games, user)[0].team, "Tempestus Aquilons");
});

test("ручные начисления и списания попадают в события", () => {
  const user = {
    id: 1,
    challengeCredits: [
      { team: "Kasrkin", action: "credit", creditedBy: 5, creditedAt: "2026-01-02T00:00:00.000Z" },
      { team: "Kasrkin", action: "deduct", deductedBy: 5, deductedAt: "2026-01-03T00:00:00.000Z" }
    ]
  };
  const events = buildChallengeEvents([], user);
  assert.equal(events.length, 2);
  assert.equal(events[0].action, "credit");
  assert.equal(events[1].action, "deduct");
});

test("события сортируются по времени", () => {
  const user = {
    id: 1,
    challengeCredits: [
      { team: "Ratlings", action: "credit", creditedAt: "2026-01-01T00:00:00.000Z" }
    ]
  };
  const games = [completedGame(1, 1, "Kasrkin", "2026-01-05T00:00:00.000Z")];
  const events = buildChallengeEvents(games, user);
  assert.deepEqual(events.map((event) => event.team), ["Ratlings", "Kasrkin"]);
});

test("прогресс отмечает выполненные и следующую команду", () => {
  const events = [{ team: "Kasrkin", action: "credit", at: "2026-01-01T00:00:00.000Z" }];
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);

  assert.equal(progress.total, CLASSIFIED_TRACK.length);
  assert.equal(progress.completedCount, 1);
  assert.equal(progress.teams[0].status, "completed");
  assert.equal(progress.teams[0].order, 1);
  assert.equal(progress.teams[1].status, "current");
  assert.equal(progress.teams[2].status, "locked");
  assert.equal(progress.nextTeam, CLASSIFIED_TRACK[1]);
});

test("повторная победа той же командой не считается дважды", () => {
  const events = [
    { team: "Kasrkin", action: "credit", at: "2026-01-01T00:00:00.000Z" },
    { team: "Kasrkin", action: "credit", at: "2026-01-02T00:00:00.000Z" }
  ];
  assert.equal(buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS).completedCount, 1);
});

test("списание снимает отметку", () => {
  const events = [
    { team: "Kasrkin", action: "credit", at: "2026-01-01T00:00:00.000Z" },
    { team: "Kasrkin", action: "deduct", at: "2026-01-02T00:00:00.000Z" }
  ];
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);
  assert.equal(progress.completedCount, 0);
  assert.equal(progress.teams[0].status, "current");
});

test("wildcards учитываются отдельно от трека", () => {
  const events = [{ team: WILDCARDS[0], action: "credit", at: "2026-01-01T00:00:00.000Z" }];
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);

  assert.equal(progress.completedCount, 0);
  assert.equal(progress.wildcardCompleted.length, 1);
  assert.equal(progress.wildcards[0].status, "completed");
  assert.equal(progress.wildcards[1].status, "available");
});

test("списание wildcard снимает отметку", () => {
  const events = [
    { team: WILDCARDS[0], action: "credit", at: "2026-01-01T00:00:00.000Z" },
    { team: WILDCARDS[0], action: "deduct", at: "2026-01-02T00:00:00.000Z" }
  ];
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);
  assert.equal(progress.wildcards[0].status, "available");
});

test("команда не из трека игнорируется", () => {
  const events = [{ team: "Novitiates", action: "credit", at: "2026-01-01T00:00:00.000Z" }];
  assert.equal(buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS).completedCount, 0);
});

test("полностью пройденный трек не имеет следующей команды", () => {
  const events = CLASSIFIED_TRACK.map((team, index) => ({
    team,
    action: "credit",
    at: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`
  }));
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);
  assert.equal(progress.completedCount, CLASSIFIED_TRACK.length);
  assert.equal(progress.nextTeam, null);
});

test("buildChallengeTracks отдаёт оба трека", () => {
  const user = { id: 1, challengeCredits: [] };
  const games = [completedGame(1, 1, "Novitiates", "2026-01-01T00:00:00.000Z")];
  const tracks = buildChallengeTracks(games, user);

  assert.equal(tracks.classified.completedCount, 0);
  assert.equal(tracks.allKillTeam.completedCount, 1);
});

test("прогресс не содержит поле user — его добавляет слой представлений", () => {
  const progress = buildTrackProgress([], CLASSIFIED_TRACK, WILDCARDS);
  assert.equal("user" in progress, false);
});

test("событие без временной метки получает at: null", () => {
  const user = { id: 1, challengeCredits: [] };
  const games = [completedGame(1, 1, "Kasrkin", null)];
  const events = buildChallengeEvents(games, user);

  assert.equal(events[0].at, null);
});

test("недатированное событие сортируется перед датированными, а не после", () => {
  const user = {
    id: 1,
    challengeCredits: [
      { team: "Ratlings", action: "credit", creditedAt: "2026-01-01T00:00:00.000Z" }
    ]
  };
  const games = [completedGame(2, 1, "Kasrkin", null)];
  const events = buildChallengeEvents(games, user);

  assert.deepEqual(events.map((event) => event.team), ["Kasrkin", "Ratlings"]);
  assert.equal(events[0].at, null);
});

test("события с одинаковым at сохраняют порядок ввода", () => {
  const sameInstant = "2026-01-01T00:00:00.000Z";
  const events = [
    { team: "Kasrkin", action: "credit", at: sameInstant },
    { team: "Kasrkin", action: "deduct", at: sameInstant }
  ];
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);

  assert.equal(progress.completedCount, 0);
  assert.equal(progress.teams[0].status, "current");
});

test("списание команды, которую никогда не начисляли, не ломает прогресс", () => {
  const events = [{ team: "Kasrkin", action: "deduct", at: "2026-01-01T00:00:00.000Z" }];

  assert.doesNotThrow(() => {
    const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);
    assert.equal(progress.completedCount, 0);
    assert.equal(progress.teams[0].status, "current");
  });
});
