const games = require('../db/repositories/games');
const users = require('../db/repositories/users');
const { attachTournamentGameDetails } = require('./tournament-game-details');
const { gameView } = require('./views');
const { playerAchievements } = require('../domain/wilson-achievements');

async function forUser(client, userId) {
  if (!userId) return [];
  const completed = await attachTournamentGameDetails(client, await games.listPublishedCompletedForUser(client, userId));
  const people = await users.findByIds(client, [...new Set(completed.flatMap(game => game.playerIds))]);
  return playerAchievements(completed.map(game => gameView(game, people)), userId);
}

module.exports = { forUser };
