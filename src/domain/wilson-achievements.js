const { wilsonScore } = require('../../public/game-data');
const { canonicalKillTeam } = require('./kill-teams');
const { realUserId, scoreTeam } = require('./kill-team-statistics');

const TIERS = [
  { key: 'experienced', threshold: 50, name: 'Опытный', nameEn: 'Experienced', emoji: '🥉' },
  { key: 'connoisseur', threshold: 60, name: 'Знаток', nameEn: 'Connoisseur', emoji: '🥈' },
  { key: 'master', threshold: 70, name: 'Мастер', nameEn: 'Master', emoji: '🥇' }
];

// Input must contain only publicly visible games. This is a current projection,
// so correcting/deleting a result or unpublishing an event also revokes badges.
function playerAchievements(games, userId) {
  if (!Number.isSafeInteger(userId) || userId <= 0) return [];
  const records = new Map();
  for (const game of games) {
    if (game.status !== 'completed' || !game.result || game.players?.length !== 2) continue;
    const entries = game.players.map(player => ({ player,
      team: canonicalKillTeam(scoreTeam(game.result.scores?.[player.id] || {}) || scoreTeam(player)) }));
    if (entries.some(entry => !entry.team) || entries[0].team === entries[1].team) continue;
    const own = entries.find(entry => realUserId(entry.player, game) === userId);
    if (!own) continue;
    if (!records.has(own.team)) records.set(own.team, { team: own.team, games: 0, wins: 0 });
    const row = records.get(own.team);
    row.games++;
    if (Number(game.result.winnerId) === Number(own.player.id)) row.wins++;
  }
  return [...records.values()].sort((a, b) => a.team.localeCompare(b.team)).flatMap(row => {
    const score = wilsonScore(row.wins, row.games);
    return TIERS.filter(tier => score >= tier.threshold).map(tier => ({
      ...row, ...tier, wilsonScore: score, automatic: true, kind: 'player', userId
    }));
  });
}

module.exports = { TIERS, playerAchievements };
