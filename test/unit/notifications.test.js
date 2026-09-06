const test = require("node:test");
const assert = require("node:assert/strict");

const notificationsApi = require("../../src/api/notifications");

function fakeClient(options = {}) {
  const now = new Date("2026-09-04T12:00:00.000Z");
  const createdAt = new Date("2026-09-04T11:00:00.000Z");
  return {
    async query(sql) {
      if (sql === "SELECT NOW() AS generated_at") return { rows: [{ generated_at: now }] };
      if (sql.includes("SELECT last_seen_at FROM notification_inbox_state")) {
        return { rows: options.lastSeenAt ? [{ last_seen_at: new Date(options.lastSeenAt) }] : [] };
      }
      if (sql.includes("FROM challenges c")) {
        return { rows: [{ id: 7, created_at: createdAt, actor_id: 2, actor_name: "Bravo", actor_avatar: null }] };
      }
      if (sql.includes("FROM player_team_invitations invitation")) {
        return { rows: [{
          id: 8,
          created_at: createdAt,
          team_id: 3,
          team_slug: "bravo-team",
          team_name: "Bravo Team",
          actor_id: 2,
          actor_name: "Bravo",
          actor_avatar: null
        }] };
      }
      if (sql.includes("JOIN tournament_matches tournament_match")) {
        return { rows: [{
          game_id: 9,
          created_at: createdAt,
          match_id: 11,
          round_number: 2,
          mission: { critOp: "Loot" },
          tournament_id: 4,
          tournament_slug: "cup",
          tournament_name: "Cup",
          opponent_id: 2,
          opponent_name: "Bravo",
          opponent_faction: "Kasrkin",
          opponent_avatar: null,
          table_id: 5,
          table_number: 1,
          killzone: "Volkus",
          deployment: 2
        }] };
      }
      if (sql.includes("JOIN tournament_team_match_games link")) {
        return { rows: [{
          game_id: 10,
          created_at: createdAt,
          team_match_id: 12,
          round_number: 3,
          slot: 1,
          mission: { critOp: "Secure" },
          tournament_id: 6,
          tournament_slug: "team-cup",
          tournament_name: "Team Cup",
          opponent_id: 2,
          opponent_name: "Bravo",
          opponent_faction: "Legionaries",
          opponent_avatar: null,
          roster_a_id: 20,
          roster_a_name: "Alpha Roster",
          roster_b_id: 21,
          roster_b_name: "Bravo Roster",
          roster_a_user_id: 1,
          table_id: null
        }] };
      }
      if (sql.includes("INSERT INTO notification_inbox_state")) {
        return { rows: [{ last_seen_at: now }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

test("notification inbox maps every supported source and deep link", async () => {
  const inbox = await notificationsApi.list({ client: fakeClient(), user: { id: 1 } });

  assert.equal(inbox.generatedAt, "2026-09-04T12:00:00.000Z");
  assert.equal(inbox.unreadCount, 4);
  assert.deepEqual(
    inbox.items.map((item) => item.type).sort(),
    ["game_challenge", "team_invitation", "team_tournament_pairing", "tournament_pairing"]
  );
  assert.equal(inbox.items.find((item) => item.type === "game_challenge").href, "#/matchmaking/challenge/7");
  assert.equal(inbox.items.find((item) => item.type === "team_invitation").href, "#/teams/invitation/8");
  assert.equal(inbox.items.find((item) => item.type === "tournament_pairing").href, "#/games/tournament-match/11");
  assert.equal(inbox.items.find((item) => item.type === "team_tournament_pairing").href, "#/games/game/10");
});

test("read notifications stay active but are no longer counted as new", async () => {
  const inbox = await notificationsApi.list({
    client: fakeClient({ lastSeenAt: "2026-09-04T11:30:00.000Z" }),
    user: { id: 1 }
  });

  assert.equal(inbox.items.length, 4);
  assert.equal(inbox.unreadCount, 0);
  assert.ok(inbox.items.every((item) => item.unread === false));
});

test("markRead validates the read-through timestamp", async () => {
  await assert.rejects(
    () => notificationsApi.markRead({ client: fakeClient(), user: { id: 1 }, body: { through: "bad-date" } }),
    (error) => error.status === 400
  );
  const result = await notificationsApi.markRead({
    client: fakeClient(),
    user: { id: 1 },
    body: { through: "2026-09-04T12:00:00.000Z" }
  });
  assert.equal(result.lastSeenAt, "2026-09-04T12:00:00.000Z");
});
