const test = require("node:test");
const assert = require("node:assert/strict");
const { gameFixture, renderDetail } = require("../helpers/game-detail-harness");

for (const sourceType of ["tournament_match", "team_match_game", "challenge"]) {
  for (const status of ["open", "pending_confirmation", "completed"]) {
    test(`admin participant has one result editor: ${sourceType}, ${status}`, () => {
      const result = { scores: {} };
      const view = renderDetail({ game: gameFixture({ sourceType, status,
        result: status === "completed" ? result : null,
        pendingResult: status === "pending_confirmation" ? { submittedBy: 11, result } : null
      }) });
      assert.equal((view.html.match(/data-admin-edit-game=|data-game-result=/g) || []).length, 1);
      const completed = status === "completed";
      assert.doesNotMatch(view.html, completed ? /data-game-result=/ : /data-admin-edit-game=/);
      view.click(completed ? "[data-admin-edit-game]" : "[data-game-result]", { gameResult: "310" });
      assert.equal(view.calls.length, 1);
      assert.equal(view.calls[0][0], "form");
      assert.equal(view.calls[0][1], 310);
      assert.equal(view.calls[0][2]?.adminEdit, completed ? true : undefined,
        "an admin participant must not accidentally bypass the normal confirmation workflow");
      if (status === "completed") assert.match(view.html, /data-admin-recalculate-rating=/);
    });
  }
}

test("admin outside the match retains the administrative editor", () => {
  for (const sourceType of ["tournament_match", "team_match_game", "challenge"]) {
    const view = renderDetail({ me: { id: 33, isAdmin: true }, game: gameFixture({ sourceType }) });
    assert.equal((view.html.match(/data-admin-edit-game=/g) || []).length, 1);
    assert.doesNotMatch(view.html, /data-game-result=|data-game-review=/);
    view.click("[data-admin-edit-game]");
    assert.equal(view.calls[0][2].adminEdit, true);
  }
});

test("ordinary tournament participant retains result entry without admin controls", () => {
  const view = renderDetail({ me: { id: 11, isAdmin: false } });
  assert.equal((view.html.match(/data-game-result=/g) || []).length, 1);
  assert.doesNotMatch(view.html, /data-admin-edit-game=/);
  view.click("[data-game-result]", { gameResult: "310" });
  assert.deepEqual(view.calls, [["form", 310]]);
});

test("spectators do not receive result controls", () => {
  const view = renderDetail({ me: { id: 33, isAdmin: false } });
  assert.doesNotMatch(view.html, /data-admin-edit-game=|data-game-result=|data-game-review=/);
});

test("pending challenge keeps author editing and opponent review", () => {
  const game = gameFixture({ sourceType: "challenge", status: "pending_confirmation",
    pendingResult: { submittedBy: 11, result: { scores: {} } } });
  const author = renderDetail({ game, me: { id: 11, isAdmin: false } });
  assert.match(author.html, /data-game-result=/);
  assert.match(author.html, /data-exit-game=/);
  const opponent = renderDetail({ game, me: { id: 22, isAdmin: false } });
  assert.match(opponent.html, /data-game-review=/);
  assert.doesNotMatch(opponent.html, /data-game-result=/);
  opponent.click("[data-game-review]", { gameReview: "310" });
  assert.deepEqual(opponent.calls, [["review", 310]]);
});

test("team captain can submit and review even when not playing this game", () => {
  for (const review of [false, true]) {
    const view = renderDetail({ me: { id: 33, isAdmin: false }, game: gameFixture({
      sourceType: "team_match_game", status: review ? "pending_confirmation" : "open",
      resultPermissions: { canSubmit: !review, canReview: review }
    }) });
    assert.match(view.html, new RegExp(review ? "data-game-review=" : "data-game-result="));
    assert.doesNotMatch(view.html, /data-admin-edit-game=/);
  }
});

test("player-reported team games offer review to the opponent or opposing captain", () => {
  for (const metadata of [{}, { submittedAs: "player", submittedRosterId: 10 }]) {
    const game = gameFixture({ sourceType: "team_match_game", status: "pending_confirmation",
      teamMatch: { rosterA: { id: 10, captainUserId: 33 }, rosterB: { id: 20, captainUserId: 44 } },
      pendingResult: { submittedBy: 11, result: { scores: {} }, ...metadata }
    });
    for (const id of [11, 22, 33, 44, 55]) {
      const view = renderDetail({ game, me: { id, isAdmin: false } });
      assert.equal(view.html.includes("data-game-review="), [22, 44].includes(id));
      assert.match(view.html, /Awaiting confirmation from the opponent or their roster captain/);
    }
    game.teamMatch.rosterB.captainUserId = 22;
    const opponentCaptain = renderDetail({ game, me: { id: 22, isAdmin: false } });
    assert.match(opponentCaptain.html, /data-game-review=/);
  }
});

test("a captain's own pending game offers review to the opponent or opposing captain", () => {
  for (const submittedAs of [undefined, "player", "captain"]) {
    const game = gameFixture({ sourceType: "team_match_game", status: "pending_confirmation",
      teamMatch: { rosterA: { id: 10, captainUserId: 11 }, rosterB: { id: 20, captainUserId: 44 } },
      pendingResult: { submittedBy: 11, submittedAs, submittedRosterId: 10, result: { scores: {} } }
    });
    for (const id of [11, 22, 33, 44, 55]) {
      const view = renderDetail({ game, me: { id, isAdmin: false } });
      assert.equal(view.html.includes("data-game-review="), [22, 44].includes(id));
    }
  }
});

test("captain-reported team games still offer review only to the opposing captain", () => {
  const game = gameFixture({ sourceType: "team_match_game", status: "pending_confirmation",
    teamMatch: { rosterA: { id: 10, captainUserId: 33 }, rosterB: { id: 20, captainUserId: 44 } },
    pendingResult: { submittedBy: 33, submittedAs: "captain", submittedRosterId: 10, result: { scores: {} } }
  });
  for (const id of [11, 22, 33, 44, 55]) {
    const view = renderDetail({ game, me: { id, isAdmin: false } });
    assert.equal(view.html.includes("data-game-review="), id === 44);
    assert.match(view.html, /Awaiting confirmation from the opposing captain/);
  }
});

test("long tournament name appears once as text and navigation still works", () => {
  const game = gameFixture();
  const view = renderDetail({ game });
  assert.equal(view.html.split(game.tournament.name).length - 1, 1);
  assert.doesNotMatch(view.html, /class="profile-grid"|class="card metric-card"/);
  assert.match(view.html, /href="\/tournaments\/autumn2026"/);
  view.click("[data-detail-tournament-open]", { detailTournamentOpen: "autumn2026" });
  assert.equal(view.calls[0][0], "tournament");
  assert.equal(view.calls[0][1], "autumn2026");
  assert.equal(view.calls[0][2].tab, "matches");
  view.click("[data-back-games]");
  assert.equal(view.calls[1][0], "back");
});
