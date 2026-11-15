const { HttpError } = require('../http/io');
const { hash } = require('../telegram/security');
const games = require('./games');

function revision(game) { return hash(JSON.stringify({ status: game.status, result: game.result, pending: game.pendingResult })); }

async function gameDetail(ctx) {
  const { game } = await games.getOne(ctx);
  if (game.tournament?.id && !game.tournament.status) {
    const tournament = await require('../db/repositories/tournaments').findById(ctx.client, game.tournament.id);
    if (tournament) game.tournament = { ...game.tournament, status: tournament.status, format: tournament.format };
  }
  const participant = game.players.some(player => (player.userId ?? player.id) === ctx.user.id && !player.isProxy);
  const ownSubmission = game.pendingResult?.submittedBy === ctx.user.id;
  const permissions = game.resultPermissions || {
    canSubmit: participant && (game.status === 'open' || (game.status === 'pending_confirmation' && (game.sourceType === 'tournament_match' || ownSubmission))),
    canReview: participant && game.status === 'pending_confirmation' && !ownSubmission
  };
  if (game.tournament && game.tournament.status !== 'in_progress') {
    permissions.canSubmit = false;
    permissions.canReview = false;
  }
  const confirmationRequired = game.sourceType === 'tournament_match' ? false :
    !(game.sourceType === 'team_match_game' && game.tournament?.venueMode === 'irl' && !permissions.submitsAsCaptain);
  return { game: { ...game, resultPermissions: permissions, confirmationRequired, revision: revision(game) } };
}

async function changeResult(ctx) {
  await require('../db/rating-write-lock').acquireRatingWriteLock(ctx.client);
  const initial = await games.getOne(ctx);
  // Preserve the Mini App's tournament -> game locking and revision contract.
  if (initial.game.tournament?.id) await ctx.client.query('SELECT id FROM tournaments WHERE id=$1 FOR UPDATE', [initial.game.tournament.id]);
  await games.lockGame(ctx.client, ctx.params.id);
  const { game } = await gameDetail(ctx);
  if (typeof ctx.body.revision !== 'string' || ctx.body.revision !== game.revision) throw new HttpError(409, 'Результат изменился. Обновите матч перед сохранением.');
  if (ctx.params.action === 'result') await games.submitResult(ctx);
  else await games.respondToResult(ctx);
  return gameDetail(ctx);
}

module.exports = { gameDetail, changeResult, revision };
