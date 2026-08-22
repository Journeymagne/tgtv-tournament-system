const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const authApi = require("../../src/api/auth");
const tournamentsApi = require("../../src/api/tournaments");
const gamesApi = require("../../src/api/games");
const usersApi = require("../../src/api/users");
const usersRepo = require("../../src/db/repositories/users");
const gamesRepo = require("../../src/db/repositories/games");

let pool;
let client;
let root;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query(`
    TRUNCATE tournament_audit_events, tournament_matches, tournament_rounds,
      tournament_participants, tournaments, sessions, feedback, games, challenges, users
    RESTART IDENTITY CASCADE
  `);
  client = await pool.connect();
  root = await createUser("Root", { isAdmin: true });
});

test.afterEach(() => {
  client.release();
});

async function createUser(name, overrides = {}) {
  return usersRepo.insert(client, {
    name,
    passwordHash: "s:h",
    registerNickname: "",
    telegramContact: `@${name.toLowerCase()}`,
    rating: 1000,
    isAdmin: false,
    ...overrides
  });
}

function tournamentBody(overrides = {}) {
  return {
    name: "August Cup",
    description: "A test tournament with enough public data to publish.",
    gameSystem: "Warhammer 40k Kill Team",
    startsAt: "2026-08-10T10:00:00.000Z",
    rulesSummary: "Approved Ops result payload. Win 3, draw 1, loss 0.",
    rulesLink: "https://example.com/tournament-rules.pdf",
    format: "single_elimination",
    singleEliminationSize: 8,
    ...overrides
  };
}

async function createPublishedTournament(overrides = {}) {
  const created = await tournamentsApi.createAdmin({
    client,
    user: root,
    body: tournamentBody(overrides)
  });
  const tournament = created.body.tournament;
  await tournamentsApi.publishAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: { status: "registration_open" }
  });
  return tournament;
}

async function addUserParticipant(tournament, user) {
  const result = await tournamentsApi.addParticipant({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: { userId: user.id }
  });
  return result.body.participant;
}

async function addUnregisteredParticipant(tournament, displayName) {
  const result = await tournamentsApi.addParticipant({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: { displayName }
  });
  return result.body.participant;
}

async function fillSingleEliminationTournament(tournament, currentCount = 0) {
  const fillers = [];
  for (let index = currentCount + 1; index <= 8; index += 1) {
    const user = await createUser(`Filler ${index}`);
    await addUserParticipant(tournament, user);
    fillers.push(user);
  }
  return fillers;
}

async function closeAndStart(tournament) {
  await tournamentsApi.closeRegistration({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  await tournamentsApi.startAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  return tournamentsApi.generateNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
}

function activeMatchForUser(view, userId) {
  return view.rounds[0].matches.find((match) =>
    match.status === "active" &&
    [match.participantA?.userId, match.participantB?.userId].includes(userId)
  );
}

function matchOpponentUserId(match, userId) {
  return match.participantA.userId === userId ? match.participantB.userId : match.participantA.userId;
}

function scores(winnerId, loserId) {
  return {
    [winnerId]: { crit: 6, kill: 6, tac: 6, primary: "crit", faction: "Kasrkin", tacOp: "" },
    [loserId]: { crit: 1, kill: 1, tac: 1, primary: "crit", faction: "Legionaries", tacOp: "" }
  };
}

test("single elimination: результат игрока сразу завершает матч и применяет Elo", async () => {
  const alpha = await createUser("Alpha");
  const tournament = await createPublishedTournament();
  await addUserParticipant(tournament, alpha);
  await fillSingleEliminationTournament(tournament, 1);

  const started = await closeAndStart(tournament);
  const match = activeMatchForUser(started, alpha.id);
  assert.ok(match);
  const opponent = await usersRepo.findById(client, matchOpponentUserId(match, alpha.id));

  const submittedThroughGames = await gamesApi.submitResult({
    client,
    user: alpha,
    params: { id: String(match.gameId) },
    body: { scores: scores(alpha.id, opponent.id) }
  });
  assert.equal(submittedThroughGames.game.status, "completed");
  const submitted = await tournamentsApi.getAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  const finalMatch = submitted.rounds[0].matches.find((item) => item.id === match.id);
  assert.equal(finalMatch.status, "completed");
  assert.equal(finalMatch.pendingResult, null);

  await assert.rejects(
    () => gamesApi.submitResult({
      client,
      user: alpha,
      params: { id: String(finalMatch.gameId) },
      body: { scores: scores(alpha.id, opponent.id) }
    }),
    /already completed/
  );

  assert.equal(submitted.tournament.status, "in_progress");
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1016);
  assert.equal((await usersRepo.findById(client, opponent.id)).rating, 984);

  assert.equal(finalMatch.result.challengeCredit, true);
  assert.equal(finalMatch.result.confirmedBy, alpha.id);
  assert.equal(finalMatch.elo[alpha.id].delta, 16);

  const linkedGame = await gamesRepo.findById(client, finalMatch.gameId);
  assert.equal(linkedGame.status, "completed");
  assert.equal(linkedGame.sourceType, "tournament_match");
  assert.equal(linkedGame.sourceId, match.id);
  assert.equal(linkedGame.result.winnerId, alpha.id);

  const completedGames = await gamesApi.listCompleted({ client });
  const completedGame = completedGames.games.find((game) => game.id === linkedGame.id);
  assert.ok(completedGame);
  assert.equal(completedGame.status, "completed");
  assert.equal(completedGame.tournament.slug, tournament.slug);
  assert.equal(completedGame.tournamentMatch.id, match.id);
  assert.equal(completedGame.tournamentMatch.status, "completed");

  const alphaProfile = await usersApi.profile({
    client,
    user: alpha,
    params: { id: String(alpha.id) }
  });
  assert.equal(alphaProfile.stats.matches, 1);
  assert.equal(alphaProfile.stats.wins, 1);
  assert.equal(alphaProfile.stats.eloDelta, 16);
  assert.equal(alphaProfile.recentGames[0].id, linkedGame.id);
  assert.equal(alphaProfile.recentGames[0].sourceType, "tournament_match");
  assert.equal(alphaProfile.recentGames[0].tournamentMatch.id, match.id);
  assert.equal(alphaProfile.challengeProgress.completedCount, 1);

  const publicPage = await tournamentsApi.getPublic({
    client,
    user: null,
    params: { slug: tournament.slug }
  });
  assert.equal(publicPage.tournament.slug, tournament.slug);
  assert.equal(publicPage.tournament.rulesLink, "https://example.com/tournament-rules.pdf");
  assert.equal(publicPage.tournament.singleEliminationSize, 8);
  assert.equal(publicPage.tournament.viewer.role, "spectator");
});

test("tournament rules are optional and every admin can manage another admin's tournament", async () => {
  const secondAdmin = await createUser("Second Admin", { isAdmin: true });
  const tournament = await createPublishedTournament({
    description: "",
    rulesSummary: "",
    rulesLink: ""
  });

  const updated = await tournamentsApi.updateAdmin({
    client,
    user: secondAdmin,
    params: { id: String(tournament.id) },
    body: { name: "Updated by another admin" }
  });

  assert.equal(updated.tournament.name, "Updated by another admin");
  const adminView = await tournamentsApi.getAdmin({
    client,
    user: secondAdmin,
    params: { id: String(tournament.id) }
  });
  assert.equal(adminView.tournament.ownerUserId, root.id);
  assert.equal(adminView.tournament.name, "Updated by another admin");
});

test("admin can delete a tournament with linked games and replay ratings", async () => {
  const alpha = await createUser("Alpha");
  const tournament = await createPublishedTournament();
  await addUserParticipant(tournament, alpha);
  await fillSingleEliminationTournament(tournament, 1);

  const started = await closeAndStart(tournament);
  const startedGameIds = started.rounds
    .flatMap((round) => round.matches)
    .map((item) => item.gameId)
    .filter(Number.isInteger);
  const match = activeMatchForUser(started, alpha.id);
  const opponent = await usersRepo.findById(client, matchOpponentUserId(match, alpha.id));

  const submitted = await tournamentsApi.submitResult({
    client,
    user: alpha,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(alpha.id, opponent.id) }
  });
  const completedMatch = submitted.rounds[0].matches.find((item) => item.id === match.id);
  assert.equal(completedMatch.status, "completed");
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1016);
  assert.ok(await gamesRepo.findById(client, completedMatch.gameId));

  const deleted = await tournamentsApi.deleteAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });

  assert.equal(deleted.ok, true);
  assert.equal(deleted.deletedGames, startedGameIds.length);
  for (const gameId of startedGameIds) assert.equal(await gamesRepo.findById(client, gameId), null);
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1000);
  assert.equal((await usersRepo.findById(client, opponent.id)).rating, 1000);
  assert.equal((await tournamentsApi.listAdmin({ client })).tournaments.length, 0);
});

test("single elimination activates child matches and publishes editable final standings", async () => {
  const tournament = await createPublishedTournament({
    tiebreakerOrder: ["total_vp", "vp_diff"]
  });
  for (let index = 1; index <= 8; index += 1) {
    await addUserParticipant(tournament, await createUser(`Bracket ${index}`));
  }

  let view = await closeAndStart(tournament);
  const completeActiveMatches = async () => {
    const active = view.rounds
      .flatMap((round) => round.matches)
      .filter((match) => match.status === "active" && !match.isBye);
    for (const match of active) {
      view = await tournamentsApi.saveMatchResultAdmin({
        client,
        user: root,
        params: { id: String(tournament.id), matchId: String(match.id) },
        body: { scores: scores(match.participantA.userId, match.participantB.userId) }
      });
    }
    return active.length;
  };

  assert.equal(await completeActiveMatches(), 4);
  const secondRound = view.rounds.find((round) => round.roundNumber === 2);
  assert.equal(secondRound.status, "active");
  assert.equal(secondRound.matches.length, 2);
  assert.equal(secondRound.matches.every((match) => match.status === "active"), true);
  assert.equal(secondRound.matches.every((match) => match.participantAId && match.participantBId), true);

  assert.equal(await completeActiveMatches(), 2);
  const finalRound = view.rounds.find((round) => round.roundNumber === 3);
  assert.equal(finalRound.status, "active");
  assert.equal(finalRound.matches[0].status, "active");
  assert.equal(Boolean(finalRound.matches[0].participantAId && finalRound.matches[0].participantBId), true);

  assert.equal(await completeActiveMatches(), 1);
  assert.equal(view.tournament.status, "in_progress");
  assert.equal(
    view.rounds.flatMap((round) => round.matches).every((match) => match.status === "completed"),
    true
  );

  const computedOrder = view.standings.map((row) => row.participantId);
  const manualOrder = [computedOrder[1], computedOrder[0], ...computedOrder.slice(2)];
  const published = await tournamentsApi.publishFinalStandingsAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: { participantIds: manualOrder }
  });

  assert.equal(published.tournament.status, "completed");
  assert.equal(published.tournament.finalResults.length, 8);
  assert.equal(published.tournament.finalResults[0].participantId, manualOrder[0]);
  assert.equal(published.tournament.finalResults[1].participantId, manualOrder[1]);
});

test("unranked tournament сохраняет Approved Ops результат без Elo и challenge-credit", async () => {
  const alpha = await createUser("Alpha");
  const tournament = await createPublishedTournament({
    ratingPolicy: "unranked",
    challengeCreditPolicy: "none"
  });
  await addUserParticipant(tournament, alpha);
  await fillSingleEliminationTournament(tournament, 1);
  const started = await closeAndStart(tournament);
  const match = activeMatchForUser(started, alpha.id);
  const opponent = await usersRepo.findById(client, matchOpponentUserId(match, alpha.id));

  const completed = await tournamentsApi.saveMatchResultAdmin({
    client,
    user: root,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(alpha.id, opponent.id) }
  });

  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1000);
  assert.equal((await usersRepo.findById(client, opponent.id)).rating, 1000);
  const finalMatch = completed.rounds[0].matches.find((item) => item.id === match.id);
  assert.equal(finalMatch.elo, null);
  assert.equal(finalMatch.result.challengeCredit, false);

  const game = await gamesRepo.findById(client, finalMatch.gameId);
  assert.equal(game.result.challengeCredit, false);
});

test("unregistered participant можно привязать к TGTV user, после чего игрок сам отправляет результат", async () => {
  const alpha = await createUser("Alpha");
  const tournament = await createPublishedTournament();
  const unregistered = await addUnregisteredParticipant(tournament, "Unregistered Alpha");
  await fillSingleEliminationTournament(tournament, 1);

  const linked = await tournamentsApi.updateParticipant({
    client,
    user: root,
    params: { id: String(tournament.id), participantId: String(unregistered.id) },
    body: { userId: alpha.id }
  });
  assert.equal(linked.participant.userId, alpha.id);
  assert.equal(linked.participant.displayName, "Unregistered Alpha");

  const started = await closeAndStart(tournament);
  const match = activeMatchForUser(started, alpha.id);
  assert.ok(match);
  const opponent = await usersRepo.findById(client, matchOpponentUserId(match, alpha.id));

  const completed = await tournamentsApi.submitResult({
    client,
    user: alpha,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(alpha.id, opponent.id) }
  });
  const finalMatch = completed.rounds[0].matches.find((item) => item.id === match.id);
  assert.equal(finalMatch.status, "completed");
  assert.equal(finalMatch.winnerParticipantId, unregistered.id);

  const publicView = await tournamentsApi.getPublic({
    client,
    user: alpha,
    params: { slug: tournament.slug }
  });
  assert.equal(publicView.tournament.viewer.participantId, unregistered.id);
});

test("registered player can submit result against unregistered tournament participant", async () => {
  const alpha = await createUser("Alpha");
  const tournament = await createPublishedTournament();
  const alphaParticipant = await addUserParticipant(tournament, alpha);
  for (const name of ["Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"]) {
    await addUserParticipant(tournament, await createUser(name));
  }
  const unregistered = await addUnregisteredParticipant(tournament, "Walk-in Player");

  const started = await closeAndStart(tournament);
  const match = activeMatchForUser(started, alpha.id);
  assert.ok(match);
  assert.equal(match.participantAId, alphaParticipant.id);
  assert.equal(match.participantBId, unregistered.id);

  const submitted = await tournamentsApi.submitResult({
    client,
    user: alpha,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(alpha.id, -unregistered.id) }
  });
  const submittedMatch = submitted.rounds[0].matches.find((item) => item.id === match.id);
  assert.equal(submittedMatch.status, "completed");
  assert.equal(submittedMatch.result.winnerId, alpha.id);
  assert.ok(Number.isInteger(submittedMatch.gameId));

  const completed = await tournamentsApi.saveMatchResultAdmin({
    client,
    user: root,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(alpha.id, -unregistered.id) }
  });
  const completedMatch = completed.rounds[0].matches.find((item) => item.id === match.id);
  assert.equal(completedMatch.status, "completed");
  assert.equal(completedMatch.gameId, submittedMatch.gameId);
  assert.equal(completedMatch.elo.flat, 15);
  assert.equal(completedMatch.elo[alpha.id].delta, 15);
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1015);

  const completedGames = await gamesApi.listCompleted({ client });
  const tournamentGame = completedGames.games.find((game) => game.id === completedMatch.gameId);
  assert.ok(tournamentGame);
  assert.equal(tournamentGame.status, "completed");
  assert.equal(tournamentGame.result.winnerId, alpha.id);
  assert.equal(tournamentGame.tournament.slug, tournament.slug);
  assert.equal(tournamentGame.tournamentMatch.id, match.id);
  assert.ok(tournamentGame.players.some((player) => player.id === alpha.id));
  assert.ok(tournamentGame.players.some((player) => player.id === -unregistered.id));

  const alphaProfile = await usersApi.profile({
    client,
    user: alpha,
    params: { id: String(alpha.id) }
  });
  assert.equal(alphaProfile.stats.matches, 1);
  assert.equal(alphaProfile.stats.wins, 1);
  assert.equal(alphaProfile.stats.eloDelta, 15);
  assert.equal(alphaProfile.recentGames[0].id, completedMatch.gameId);
  assert.equal(alphaProfile.recentGames[0].tournamentMatch.id, match.id);

  await tournamentsApi.saveMatchResultAdmin({
    client,
    user: root,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(alpha.id, -unregistered.id) }
  });
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1015);

  await tournamentsApi.deleteAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1000);
});

test("один TGTV user не может быть привязан к двум активным участникам одного турнира", async () => {
  const alpha = await createUser("Alpha");
  const tournament = await createPublishedTournament();
  const first = await addUnregisteredParticipant(tournament, "Unregistered Alpha");
  const second = await addUnregisteredParticipant(tournament, "Alpha Stand-in");

  await tournamentsApi.updateParticipant({
    client,
    user: root,
    params: { id: String(tournament.id), participantId: String(first.id) },
    body: { userId: alpha.id }
  });

  await assert.rejects(
    () =>
      tournamentsApi.updateParticipant({
        client,
        user: root,
        params: { id: String(tournament.id), participantId: String(second.id) },
        body: { userId: alpha.id }
      }),
    /already exists/
  );
});

test("закрытие регистрации автоматически уплотняет сиды без изменения порядка", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2
  });
  const participants = [];
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    participants.push(await addUserParticipant(tournament, await createUser(name)));
  }
  await tournamentsApi.removeParticipant({
    client,
    user: root,
    params: { id: String(tournament.id), participantId: String(participants[1].id) }
  });

  await tournamentsApi.closeRegistration({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });

  const view = await tournamentsApi.getAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.deepEqual(
    view.participants.map((participant) => [participant.id, participant.seed]),
    [
      [participants[0].id, 1],
      [participants[2].id, 2],
      [participants[3].id, 3]
    ]
  );
});

test("администратор может вручную перегенерировать contiguous-сиды до старта", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2
  });
  const participants = [];
  for (const name of ["Alpha", "Bravo", "Charlie"]) {
    participants.push(await addUserParticipant(tournament, await createUser(name)));
  }
  await tournamentsApi.removeParticipant({
    client,
    user: root,
    params: { id: String(tournament.id), participantId: String(participants[0].id) }
  });

  const regenerated = await tournamentsApi.regenerateSeeds({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });

  assert.deepEqual(
    regenerated.participants.map((participant) => [participant.id, participant.seed]),
    [
      [participants[1].id, 1],
      [participants[2].id, 2]
    ]
  );
});

test("single elimination start requires the selected bracket size", async () => {
  const tournament = await createPublishedTournament();
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"]) {
    await addUserParticipant(tournament, await createUser(name));
  }

  await tournamentsApi.closeRegistration({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });

  await assert.rejects(
    () =>
      tournamentsApi.startAdmin({
        client,
        user: root,
        params: { id: String(tournament.id) }
      }),
    /exactly 8 active participants/
  );
});

test("tournament start leaves first round pending until admin generates it", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2
  });
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    await addUserParticipant(tournament, await createUser(name));
  }

  await tournamentsApi.closeRegistration({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  const started = await tournamentsApi.startAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });

  assert.equal(started.tournament.status, "in_progress");
  assert.equal(started.rounds.length, 0);
  assert.equal(started.participants.every((participant) => participant.status === "active"), true);

  const preview = await tournamentsApi.previewNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal(preview.round.roundNumber, 1);
  assert.equal(preview.round.matches.filter((match) => match.status === "active").length, 2);

  const generated = await tournamentsApi.generateNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal(generated.rounds.length, 1);
  assert.equal(generated.rounds[0].roundNumber, 1);
  assert.equal(generated.rounds[0].status, "active");
});

test("round setup rejects duplicate players and Empty really frees a pairing slot", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2
  });
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    await addUserParticipant(tournament, await createUser(name));
  }
  await tournamentsApi.closeRegistration({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  await tournamentsApi.startAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  const preview = await tournamentsApi.previewNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  const duplicateMatchups = preview.round.matches.map((match) => ({
    participantAId: match.participantAId,
    participantBId: match.participantBId
  }));
  duplicateMatchups[1].participantAId = duplicateMatchups[0].participantAId;

  await assert.rejects(
    () => tournamentsApi.generateNextRoundAdmin({
      client,
      user: root,
      params: { id: String(tournament.id) },
      body: { matchups: duplicateMatchups }
    }),
    /Each player can appear only once/
  );

  const generated = await tournamentsApi.generateNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: {
      matchups: preview.round.matches.map((match, index) => ({
        participantAId: index === 0 ? "" : match.participantAId,
        participantBId: match.participantBId
      }))
    }
  });
  const firstMatch = generated.rounds[0].matches.find((match) => match.bracketPosition === 1);
  assert.equal(firstMatch.participantAId, null);
  assert.equal(firstMatch.status, "not_ready");
});

test("single elimination participant list is capped by bracket size", async () => {
  const tournament = await createPublishedTournament();
  await fillSingleEliminationTournament(tournament, 0);
  const extra = await createUser("Extra");

  await assert.rejects(
    () => addUserParticipant(tournament, extra),
    (err) => err.status === 409 && /limited to 8 participants/.test(err.message)
  );
});

test("Swiss tournament accepts arbitrary positive round count", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 100
  });
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    await addUserParticipant(tournament, await createUser(name));
  }

  const started = await closeAndStart(tournament);

  assert.equal(started.tournament.swissRoundCount, 100);
  assert.equal(started.rounds.length, 1);
  assert.equal(started.rounds[0].roundNumber, 1);
});

test("public tournament list includes participant and round summary counts", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2
  });
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    await addUserParticipant(tournament, await createUser(name));
  }

  let list = await tournamentsApi.listPublic({ client });
  let listed = list.tournaments.find((item) => item.id === tournament.id);
  assert.equal(listed.participantCount, 4);
  assert.equal(listed.roundCount, 0);

  await closeAndStart(tournament);
  list = await tournamentsApi.listPublic({ client });
  listed = list.tournaments.find((item) => item.id === tournament.id);
  assert.equal(listed.participantCount, 4);
  assert.equal(listed.roundCount, 1);
});

test("withdrawn tournament participants are hidden from rosters and counts", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2
  });
  const alpha = await createUser("Alpha");
  const bravo = await createUser("Bravo");

  await addUserParticipant(tournament, alpha);
  await tournamentsApi.join({
    client,
    user: bravo,
    params: { id: String(tournament.id) },
    body: { faction: "Kasrkin" }
  });
  await tournamentsApi.withdraw({
    client,
    user: bravo,
    params: { id: String(tournament.id) }
  });

  const publicView = await tournamentsApi.getPublic({
    client,
    user: bravo,
    params: { slug: tournament.slug }
  });
  assert.deepEqual(publicView.participants.map((participant) => participant.displayName), ["Alpha"]);
  assert.equal(publicView.standings.length, 1);
  assert.equal(publicView.tournament.viewer.participantId, null);

  const adminView = await tournamentsApi.getAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.deepEqual(adminView.participants.map((participant) => participant.displayName), ["Alpha"]);

  const list = await tournamentsApi.listPublic({ client });
  const listed = list.tournaments.find((item) => item.id === tournament.id);
  assert.equal(listed.participantCount, 1);
});

test("Swiss late participant входит только в следующий сгенерированный раунд", async () => {
  const users = [];
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]) {
    users.push(await createUser(name));
  }
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2,
    tiebreakerOrder: ["total_vp", "vp_diff"]
  });
  for (const person of users.slice(0, 4)) await addUserParticipant(tournament, person);

  const started = await closeAndStart(tournament);
  const firstRound = started.rounds[0];
  const firstRoundParticipantIds = firstRound.matches.flatMap((match) =>
    [match.participantAId, match.participantBId].filter(Boolean)
  );

  const late = await addUserParticipant(tournament, users[4]);
  assert.equal(late.status, "pending_placement");
  assert.equal(firstRoundParticipantIds.includes(late.id), false);

  let view = started;
  for (const match of firstRound.matches.filter((item) => item.status === "active")) {
    view = await tournamentsApi.saveMatchResultAdmin({
      client,
      user: root,
      params: { id: String(tournament.id), matchId: String(match.id) },
      body: {
        scores: scores(match.participantA.userId, match.participantB.userId)
      }
    });
  }

  assert.equal(view.tournament.status, "in_progress");
  assert.equal(view.rounds.length, 1);
  assert.equal(view.rounds[0].status, "completed");
  assert.equal(view.participants.find((participant) => participant.id === late.id).status, "pending_placement");

  view = await tournamentsApi.generateNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });

  assert.equal(view.tournament.status, "in_progress");
  assert.equal(view.rounds.length, 2);
  const secondRound = view.rounds.find((round) => round.roundNumber === 2);
  const secondRoundParticipantIds = secondRound.matches.flatMap((match) =>
    [match.participantAId, match.participantBId].filter(Boolean)
  );
  const placedLate = view.participants.find((participant) => participant.id === late.id);
  assert.equal(placedLate.status, "active");
  assert.equal(secondRoundParticipantIds.includes(late.id), true);
});

test("Swiss bulk add is blocked after tournament start", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2
  });
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    await addUserParticipant(tournament, await createUser(name));
  }

  await closeAndStart(tournament);
  const late = await addUserParticipant(tournament, await createUser("Echo"));
  assert.equal(late.status, "pending_placement");

  await assert.rejects(
    () => tournamentsApi.bulkParticipants({
      client,
      user: root,
      params: { id: String(tournament.id) },
      body: { names: "Foxtrot\nGolf" }
    }),
    (err) => err.status === 409 && /Bulk add is available only before tournament start/.test(err.message)
  );
});

test("Swiss late participant can be removed before placement after tournament start", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2
  });
  const users = [];
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]) {
    users.push(await createUser(name));
  }
  for (const person of users.slice(0, 4)) await addUserParticipant(tournament, person);

  const started = await closeAndStart(tournament);
  const activeParticipant = started.participants.find((participant) => participant.userId === users[0].id);
  const late = await addUserParticipant(tournament, users[4]);

  assert.equal(late.status, "pending_placement");

  const removed = await tournamentsApi.removeParticipant({
    client,
    user: root,
    params: { id: String(tournament.id), participantId: String(late.id) }
  });
  assert.equal(removed.participant.status, "removed");

  const view = await tournamentsApi.getAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal(view.participants.some((participant) => participant.id === late.id), false);

  await assert.rejects(
    () =>
      tournamentsApi.removeParticipant({
        client,
        user: root,
        params: { id: String(tournament.id), participantId: String(activeParticipant.id) }
      }),
    (err) => err.status === 409 && /generated matches/.test(err.message)
  );
});

test("admin can edit a completed Swiss match before generating the next round", async () => {
  const alpha = await createUser("Alpha");
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2
  });
  await addUserParticipant(tournament, alpha);
  for (const name of ["Bravo", "Charlie", "Delta"]) {
    await addUserParticipant(tournament, await createUser(name));
  }

  const started = await closeAndStart(tournament);
  const match = activeMatchForUser(started, alpha.id);
  const opponent = await usersRepo.findById(client, matchOpponentUserId(match, alpha.id));

  const saved = await tournamentsApi.saveMatchResultAdmin({
    client,
    user: root,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(alpha.id, opponent.id) }
  });
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1016);
  assert.equal((await usersRepo.findById(client, opponent.id)).rating, 984);
  const savedMatch = saved.rounds[0].matches.find((item) => item.id === match.id);
  const savedGame = await gamesRepo.findById(client, savedMatch.gameId);
  assert.equal(savedGame.result.winnerId, alpha.id);

  const edited = await tournamentsApi.saveMatchResultAdmin({
    client,
    user: root,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(opponent.id, alpha.id) }
  });

  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 984);
  assert.equal((await usersRepo.findById(client, opponent.id)).rating, 1016);
  const finalMatch = edited.rounds[0].matches.find((item) => item.id === match.id);
  assert.equal(finalMatch.status, "completed");
  assert.equal(finalMatch.winnerParticipantId, match.participantA.userId === opponent.id ? match.participantAId : match.participantBId);
  assert.equal(finalMatch.elo[alpha.id].delta, -16);

  const editedGame = await gamesRepo.findById(client, finalMatch.gameId);
  assert.equal(editedGame.result.winnerId, opponent.id);
  assert.equal(editedGame.elo[alpha.id].delta, -16);

  const alphaProfile = await usersApi.profile({
    client,
    user: alpha,
    params: { id: String(alpha.id) }
  });
  assert.equal(alphaProfile.stats.matches, 1);
  assert.equal(alphaProfile.stats.wins, 0);
  assert.equal(alphaProfile.stats.losses, 1);
  assert.equal(alphaProfile.stats.eloDelta, -16);
  assert.equal(alphaProfile.recentGames[0].result.winnerId, opponent.id);
  assert.equal(alphaProfile.challengeProgress.completedCount, 0);

  const opponentProfile = await usersApi.profile({
    client,
    user: opponent,
    params: { id: String(opponent.id) }
  });
  assert.equal(opponentProfile.stats.wins, 1);
  assert.equal(opponentProfile.challengeProgress.completedCount, 1);
});

test("admin tournament match edit replays Elo for later completed games", async () => {
  const alpha = await createUser("Alpha");
  const laterOpponent = await createUser("Outside");
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2
  });
  await addUserParticipant(tournament, alpha);
  for (const name of ["Bravo", "Charlie", "Delta"]) {
    await addUserParticipant(tournament, await createUser(name));
  }

  const started = await closeAndStart(tournament);
  const match = activeMatchForUser(started, alpha.id);
  const opponent = await usersRepo.findById(client, matchOpponentUserId(match, alpha.id));

  const saved = await tournamentsApi.saveMatchResultAdmin({
    client,
    user: root,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(alpha.id, opponent.id) }
  });
  const savedMatch = saved.rounds[0].matches.find((item) => item.id === match.id);
  await client.query("UPDATE games SET submitted_at = $2 WHERE id = $1", [
    savedMatch.gameId,
    "2026-01-01T00:00:00.000Z"
  ]);

  const laterGame = await gamesRepo.insert(client, {
    challengeId: null,
    playerIds: [alpha.id, laterOpponent.id]
  });
  await gamesApi.submitResult({
    client,
    user: alpha,
    params: { id: String(laterGame.id) },
    body: { scores: scores(alpha.id, laterOpponent.id) }
  });
  await gamesApi.respondToResult({
    client,
    user: laterOpponent,
    params: { id: String(laterGame.id), action: "confirm-result" }
  });

  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1031);
  assert.equal((await gamesRepo.findById(client, laterGame.id)).elo[alpha.id].delta, 15);

  const edited = await tournamentsApi.saveMatchResultAdmin({
    client,
    user: root,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(opponent.id, alpha.id) }
  });
  const editedMatch = edited.rounds[0].matches.find((item) => item.id === match.id);
  const tournamentGame = await gamesRepo.findById(client, editedMatch.gameId);
  const replayedLaterGame = await gamesRepo.findById(client, laterGame.id);

  assert.equal(tournamentGame.elo[alpha.id].delta, -16);
  assert.equal(editedMatch.elo[alpha.id].delta, -16);
  assert.equal(replayedLaterGame.elo[alpha.id].before, 984);
  assert.equal(replayedLaterGame.elo[alpha.id].delta, 17);
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1001);
  assert.equal((await usersRepo.findById(client, opponent.id)).rating, 1016);
  assert.equal((await usersRepo.findById(client, laterOpponent.id)).rating, 983);
});

test("api me replaces an active tournament card with its completed Game after submit", async () => {
  const alpha = await createUser("Alpha");
  const tournament = await createPublishedTournament();
  await addUserParticipant(tournament, alpha);
  await fillSingleEliminationTournament(tournament, 1);

  const started = await closeAndStart(tournament);
  const match = activeMatchForUser(started, alpha.id);
  const opponent = await usersRepo.findById(client, matchOpponentUserId(match, alpha.id));

  const activeSummary = await authApi.me({ client, user: alpha });
  const activeCards = activeSummary.games.filter((game) => game.sourceType === "tournament_match");
  assert.equal(activeCards.length, 1);
  assert.equal(activeCards[0].sourceId, match.id);
  assert.equal(activeCards[0].status, "open");
  assert.equal(activeCards[0].tournament.name, "August Cup");
  assert.equal(activeCards[0].tournamentMatch.roundNumber, match.roundNumber);
  assert.ok(activeCards[0].players.some((player) => player.id === alpha.id));

  await tournamentsApi.submitResult({
    client,
    user: alpha,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: { scores: scores(alpha.id, opponent.id) }
  });

  const completedSummary = await authApi.me({ client, user: alpha });
  const completedCards = completedSummary.games.filter((game) => game.sourceType === "tournament_match");
  assert.equal(completedCards.length, 1);
  assert.equal(completedCards[0].sourceId, match.id);
  assert.equal(completedCards[0].status, "completed");
  assert.equal(completedCards[0].pendingResult, null);
});

test("IRL Swiss tournament stores season, manages tables, and uses round setup payload", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2,
    seasonId: "2026-q2-dataslate",
    venueMode: "irl"
  });
  const players = [];
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    const user = await createUser(name);
    players.push(user);
    await addUserParticipant(tournament, user);
  }

  const firstTable = await tournamentsApi.addTableAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: { tableNumber: 1, killzone: "Volkus", deployment: 1 }
  });
  const secondTable = await tournamentsApi.addTableAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: { tableNumber: 2, killzone: "Gallowdark", deployment: 2 }
  });

  let view = await closeAndStart(tournament);
  assert.equal(view.tournament.seasonId, "2026-q2-dataslate");
  assert.equal(view.tournament.venueMode, "irl");
  assert.equal(view.tables.length, 2);
  assert.deepEqual(view.rounds[0].matches.map((match) => match.table?.tableNumber).sort(), [1, 2]);
  assert.deepEqual(view.rounds[0].matches.map((match) => match.mission?.layout).sort(), [1, 2]);

  for (const match of view.rounds[0].matches.filter((item) => item.status === "active")) {
    view = await tournamentsApi.saveMatchResultAdmin({
      client,
      user: root,
      params: { id: String(tournament.id), matchId: String(match.id) },
      body: {
        scores: scores(match.participantA.userId, match.participantB.userId),
        killzone: match.mission
      }
    });
  }

  assert.equal(view.tournamentGames.length, 2);
  const preview = await tournamentsApi.previewNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal(preview.round.roundNumber, 2);
  assert.equal(preview.tables.length, 2);

  view = await tournamentsApi.generateNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: {
      mission: { critOp: "Loot" },
      matchups: preview.round.matches.map((match, index) => ({
        participantAId: match.participantAId,
        participantBId: match.participantBId,
        tableId: index === 0 ? secondTable.body.table.id : firstTable.body.table.id
      }))
    }
  });

  const secondRound = view.rounds.find((round) => round.roundNumber === 2);
  assert.equal(secondRound.status, "active");
  assert.equal(secondRound.matches.every((match) => match.mission?.critOp === "Loot"), true);
  assert.equal(secondRound.matches.every((match) => match.tableId), true);
});

test("admin can roll back an unplayed Swiss round and regenerate its saved pairings and tables", async () => {
  const tournament = await createPublishedTournament({
    format: "swiss",
    swissRoundCount: 2,
    venueMode: "irl"
  });
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    await addUserParticipant(tournament, await createUser(name));
  }
  const firstTable = await tournamentsApi.addTableAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: { tableNumber: 1, killzone: "Volkus", deployment: 1 }
  });
  const secondTable = await tournamentsApi.addTableAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: { tableNumber: 2, killzone: "Gallowdark", deployment: 2 }
  });

  await tournamentsApi.closeRegistration({ client, user: root, params: { id: String(tournament.id) } });
  await tournamentsApi.startAdmin({ client, user: root, params: { id: String(tournament.id) } });
  const initialPreview = await tournamentsApi.previewNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  const savedMatchups = initialPreview.round.matches.filter((match) => !match.isBye).map((match, index) => ({
    participantAId: match.participantAId,
    participantBId: match.participantBId,
    tableId: index === 0 ? secondTable.body.table.id : firstTable.body.table.id
  }));
  const generated = await tournamentsApi.generateNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) },
    body: { mission: { critOp: "Loot" }, matchups: savedMatchups }
  });
  const originalRound = generated.rounds[0];

  const rolledBack = await tournamentsApi.rollbackLatestRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal(rolledBack.rounds.length, 0);
  const { rows: remainingGames } = await client.query(
    "SELECT id FROM games WHERE source_type = 'tournament_match'"
  );
  assert.equal(remainingGames.length, 0);

  const restored = await tournamentsApi.previewNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal(restored.restoredDraft, true);
  assert.equal(restored.round.mission.critOp, "Loot");
  assert.deepEqual(
    restored.round.matches.filter((match) => !match.isBye).map((match) => ({
      participantAId: match.participantAId,
      participantBId: match.participantBId,
      tableId: match.tableId
    })),
    savedMatchups
  );

  const regenerated = await tournamentsApi.generateNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal(regenerated.rounds.length, 1);
  assert.notEqual(regenerated.rounds[0].id, originalRound.id);
  assert.deepEqual(
    regenerated.rounds[0].matches.filter((match) => !match.isBye).map((match) => ({
      participantAId: match.participantAId,
      participantBId: match.participantBId,
      tableId: match.tableId
    })),
    savedMatchups
  );
});

test("round rollback is blocked after a match result is submitted", async () => {
  const tournament = await createPublishedTournament({ format: "swiss", swissRoundCount: 2 });
  for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
    await addUserParticipant(tournament, await createUser(name));
  }
  const view = await closeAndStart(tournament);
  const match = view.rounds[0].matches.find((item) => !item.isBye);
  await tournamentsApi.saveMatchResultAdmin({
    client,
    user: root,
    params: { id: String(tournament.id), matchId: String(match.id) },
    body: {
      scores: scores(match.participantA.userId, match.participantB.userId),
      killzone: match.mission
    }
  });

  await assert.rejects(
    () => tournamentsApi.rollbackLatestRoundAdmin({
      client,
      user: root,
      params: { id: String(tournament.id) }
    }),
    (err) => err.status === 409 && /before any match result/.test(err.message)
  );
});

test("single-elimination round can be returned to draft and activated again", async () => {
  const tournament = await createPublishedTournament();
  await fillSingleEliminationTournament(tournament, 0);
  const generated = await closeAndStart(tournament);
  const originalRound = generated.rounds.find((round) => round.roundNumber === 1);
  const originalPairings = originalRound.matches.map((match) => [
    match.participantAId,
    match.participantBId
  ]);

  const rolledBack = await tournamentsApi.rollbackLatestRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal(rolledBack.rounds.find((round) => round.roundNumber === 1).status, "not_ready");

  const restored = await tournamentsApi.previewNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal(restored.restoredDraft, true);
  assert.deepEqual(
    restored.round.matches.map((match) => [match.participantAId, match.participantBId]),
    originalPairings
  );

  const regenerated = await tournamentsApi.generateNextRoundAdmin({
    client,
    user: root,
    params: { id: String(tournament.id) }
  });
  assert.equal(regenerated.rounds.find((round) => round.roundNumber === 1).status, "active");
  assert.deepEqual(
    regenerated.rounds.find((round) => round.roundNumber === 1).matches.map((match) => [
      match.participantAId,
      match.participantBId
    ]),
    originalPairings
  );
});
