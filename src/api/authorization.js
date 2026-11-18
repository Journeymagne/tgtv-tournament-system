const { HttpError } = require("../http/io");
const access = require("../db/repositories/access");
const tournaments = require("../db/repositories/tournaments");
const { canManageTournament, canManageJudges, canCreateTournament, canOpenAdministration, isPlatformAdmin } = require("../domain/access");
const { requirePositiveIntId } = require("./params");

async function freshUser(client,user) {
  user = await access.hydrate(client,user);
  if (!user) throw new HttpError(401,"You need to sign in");
  access.assertActive(user);
  return user;
}

async function tournamentAccess(client,user,id,{lock=false,scopedOnly=false,permission}={}) {
  id = requirePositiveIntId(id,404,"Tournament not found");
  if (lock) {
    const provided = await tournaments.lockProviderForTournament(client,id);
    // Direct domain handlers historically also implement personal tournaments.
    // Their route checks continue to apply to those legacy records.
    if (!provided && scopedOnly) return user;
  }
  const {rows:[row]} = await client.query(`SELECT id,status,provider_id,owner_user_id FROM tournaments
    WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!row) throw new HttpError(404,"Tournament not found");
  const tournament = {id:row.id,providerId:row.provider_id,ownerUserId:row.owner_user_id};
  user = await freshUser(client,user);
  const manager = canManageTournament(user,tournament);
  if (permission === 'tournament.participate' || permission === 'game.participate') {
    if (!manager && row.provider_id != null && !tournaments.PUBLISHED_STATUSES.includes(row.status)) throw new HttpError(404,"Tournament not found");
  } else if (!(permission === 'judges.manage' ? canManageJudges(user,tournament) : manager)) {
    throw new HttpError(403,"You do not have permission to manage this tournament");
  }
  return user;
}

function withProviderWriteAccess(handler,permission='tournament.manage') {
  return async function providerWrite(context,...args) {
    const user = await tournamentAccess(context.client,context.user,context.params.id,{lock:true,scopedOnly:true,permission});
    return handler({...context,user},...args);
  };
}

async function authorize({client,user,params,route,body={}}) {
  if (!route.permission) return user;
  if (!user) throw new HttpError(401,"You need to sign in");
  if (route.permission === "super") {
    if (!user.isSuperAdmin) throw new HttpError(403,"Super administrator rights required");
    return user;
  }
  if (route.permission === "calendar.manage") {
    if (route.method === "POST" && !canCreateTournament(user) && !user.capabilities?.canCreateProviderEvents) {
      throw new HttpError(403,"Calendar creation permission required");
    }
    return user; // Handler resolves and locks the event's provider.
  }
  if (route.permission === "administration") {
    if (!canOpenAdministration(user)) throw new HttpError(403,"Administration access required");
    return user;
  }
  if (route.permission === "tournaments.create") {
    return (await require('./calendar-events').tournamentCreationContext(client,user,body)).user;
  }
  let id = params.id;
  if (route.permission === "game.manage" || route.permission === "game.participate") {
    const game = await require("./games").findGame(client,params.id);
    const sql = game.sourceType === "tournament_match"
      ? "SELECT tournament_id FROM tournament_matches WHERE id=$1 AND game_id=$2"
      : game.sourceType === "team_match_game"
        ? `SELECT m.tournament_id FROM tournament_team_matches m JOIN tournament_team_match_games g ON g.team_match_id=m.id
           WHERE m.id=$1 AND g.game_id=$2` : null;
    if (!sql) {
      if (route.permission === "game.manage" && !isPlatformAdmin(user)) throw new HttpError(403,"Administrator rights required");
      return user;
    }
    const {rows:[link]} = await client.query(sql,[game.sourceId,game.id]);
    if (!link) throw new HttpError(409,"Tournament game link is invalid");
    id = link.tournament_id;
  }
  return tournamentAccess(client,user,id,{lock:!!route.tx,permission:route.permission});
}

module.exports = {authorize,freshUser,tournamentAccess,withProviderWriteAccess};
