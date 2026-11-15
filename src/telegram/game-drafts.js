const crypto = require('node:crypto');
const { HttpError } = require('../http/io');
const { hash } = require('./security');
const access = require('./access');
const results = require('../api/game-results');
const { acquireRatingWriteLock } = require('../db/rating-write-lock');
const steps = require('./game-draft-steps');

function failure(status, code, message) { return Object.assign(new HttpError(status, message), { code }); }
const conflict = () => failure(409, 'GAME_DRAFT_CONTEXT_CHANGED', 'The game changed. Open the current game again.');
function requiresRatingLock(event) { return ['start', 'submit'].includes(event?.type); }

// Caller owns the transaction. Roll back even expected business errors to keep
// partial Elo/audit/notification effects out of its eventual localized reply.
async function isolated(client, fn) {
  await client.query('SAVEPOINT telegram_game_draft');
  try { const value = await fn(); await client.query('RELEASE SAVEPOINT telegram_game_draft'); return value; }
  catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT telegram_game_draft');
    await client.query('RELEASE SAVEPOINT telegram_game_draft');
    throw error;
  }
}

async function identity(client, user, link) {
  if (!Number.isSafeInteger(user?.id) || user.id <= 0 || !link?.id || String(link.user_id) !== String(user.id) ||
      !/^[1-9][0-9]*$/.test(String(link.telegram_id)) || String(link.chat_id) !== String(link.telegram_id)) {
    throw failure(403, 'GAME_DRAFT_IDENTITY', 'Open the game from your linked private chat.');
  }
  // Same actor -> link order as linking/unlinking. Only public account columns.
  const { rows: [actor] } = await client.query('SELECT id,name,is_admin,suspended_until FROM accounts.users WHERE id=$1 FOR UPDATE', [user.id]);
  if (!actor || (actor.suspended_until && new Date(actor.suspended_until).getTime() > Date.now())) {
    throw failure(403, 'GAME_DRAFT_IDENTITY', 'This account is unavailable.');
  }
  const { rows: [current] } = await client.query(`SELECT id,user_id,telegram_id,chat_id,locale FROM telegram_links
    WHERE id=$1 AND user_id=$2 AND telegram_id=$3 AND chat_id=$4 FOR UPDATE`, [link.id, actor.id, link.telegram_id, link.chat_id]);
  if (!current) throw failure(403, 'GAME_DRAFT_IDENTITY', 'The Telegram link changed. Open the current game again.');
  await access.assertAllowed(client, actor.id);
  return { user: { id: actor.id, name: actor.name, isAdmin: actor.is_admin }, link: current };
}

// A single narrow row for one game. Only two participant records are aggregated;
// no image, account secret, full tournament, activeItems or per-game hydration.
async function context(client, gameId, userId) {
  const { rows: [row] } = await client.query(`SELECT g.id,g.status,g.result,g.pending_result,
    t.id AS tournament_id,tm.id AS team_match_id,
    (EXISTS(SELECT 1 FROM game_participants own WHERE own.game_id=g.id AND own.user_id=$2 AND NOT own.is_proxy)
      OR ra.captain_user_id=$2 OR rb.captain_user_id=$2) AS eligible,
    jsonb_build_object('source',jsonb_build_array(g.source_type,g.source_id,g.source_slot,g.player_ids,g.venue_mode),
      'tournament',jsonb_build_array(t.id,t.status,t.format,t.venue_mode,t.participant_mode,t.faction_count,t.rating_policy,t.challenge_credit_policy),
      'match',jsonb_build_array(m.id,m.participant_a_id,m.participant_b_id,m.participant_snapshots,m.mission,m.table_id,m.status,r.status),
      'team',jsonb_build_array(tm.id,tm.roster_a_id,tm.roster_b_id,tm.phase,tm.resolution,tm.pairing_version,tm.pairing_revision,tr.status,
        l.id,l.slot,l.roster_a_member_id,l.roster_b_member_id,l.mission,l.table_id),
      'captains',jsonb_build_array(ra.id,ra.captain_user_id,ra.status,rb.id,rb.captain_user_id,rb.status),
      'participants',(SELECT jsonb_agg(jsonb_build_array(p.id,p.slot,p.user_id,p.is_proxy,p.result_key,p.tournament_participant_id,
          p.display_name_snapshot,p.faction_snapshot,tp.user_id,tp.status,tp.factions,ma.user_id,ma.ended_at,ma.factions,mb.user_id,mb.ended_at,mb.factions) ORDER BY p.slot)
        FROM game_participants p LEFT JOIN tournament_participants tp ON tp.id=p.tournament_participant_id
        LEFT JOIN tournament_team_roster_members ma ON ma.id=l.roster_a_member_id
        LEFT JOIN tournament_team_roster_members mb ON mb.id=l.roster_b_member_id WHERE p.game_id=g.id)) AS fingerprint
    FROM games g LEFT JOIN tournament_matches m ON g.source_type='tournament_match' AND m.game_id=g.id
    LEFT JOIN tournament_rounds r ON r.id=m.round_id
    LEFT JOIN tournament_team_match_games l ON g.source_type='team_match_game' AND l.game_id=g.id
    LEFT JOIN tournament_team_matches tm ON tm.id=l.team_match_id
    LEFT JOIN tournament_rounds tr ON tr.id=tm.round_id
    LEFT JOIN tournament_team_rosters ra ON ra.id=tm.roster_a_id
    LEFT JOIN tournament_team_rosters rb ON rb.id=tm.roster_b_id
    LEFT JOIN tournaments t ON t.id=COALESCE(m.tournament_id,tm.tournament_id)
    WHERE g.id=$1`, [gameId, userId]);
  if (!row) throw failure(404, 'GAME_DRAFT_NOT_FOUND', 'Game not found.');
  if (!row.eligible) throw failure(403, 'GAME_DRAFT_PERMISSION', 'This game is no longer available to this account.');
  return { ...row, contextRevision: hash(JSON.stringify(row.fingerprint)),
    resultRevision: results.revision({ status: row.status, result: row.result, pendingResult: row.pending_result }) };
}

function compact(game) {
  const mission = game.teamTournamentGame;
  const match = game.tournamentMatch;
  const missionValues = value => value ? { killzone: value.killzone || '', critOp: value.critOp || '', layout: value.layout ?? null } : null;
  return { id: game.id, status: game.status, sourceType: game.sourceType,
    playerIds: game.players.map(player => player.resultKey ?? player.id),
    players: game.players.map(player => ({ id: player.resultKey ?? player.id, userId: player.userId ?? (player.isProxy ? null : player.id),
      name: player.name, isProxy: Boolean(player.isProxy), faction: player.faction || '', factions: player.factions || (player.faction ? [player.faction] : []) })),
    tournament: game.tournament ? { id: game.tournament.id, name: game.tournament.name, slug: game.tournament.slug,
      status: game.tournament.status, format: game.tournament.format, venueMode: game.tournament.venueMode } : null,
    tournamentMatch: match ? { id: match.id, roundNumber: match.roundNumber, mission: missionValues(match.mission),
      tableId: match.tableId, table: match.table ? { id: match.table.id, number: match.table.number, name: match.table.name } : null } : null,
    teamMatch: game.teamMatch ? { id: game.teamMatch.id, roundNumber: game.teamMatch.roundNumber } : null,
    teamTournamentGame: mission ? { missionLocked: Boolean(mission.missionLocked), mission: missionValues(mission.mission), tableId: mission.tableId } : null,
    resultPermissions: game.resultPermissions, confirmationRequired: game.confirmationRequired,
    revision: game.revision, result: game.result, pendingResult: game.pendingResult };
}
function assertPermission(game, mode) {
  if (!(mode === 'submit' ? game.resultPermissions?.canSubmit : game.resultPermissions?.canReview)) {
    throw failure(409, 'GAME_DRAFT_PERMISSION', 'This result action is no longer available.');
  }
}
function assertUnchanged(row, current) {
  if (row.result_revision !== current.resultRevision || row.context_revision !== current.contextRevision) throw conflict();
}
function draftView(row, current = null) {
  const game = { ...row.state.context };
  if (current) {
    game.status = current.status; game.result = current.result; game.pendingResult = current.pending_result;
    game.revision = current.resultRevision;
  }
  const ui = steps.view(game, row.state.workflow);
  if (row.state.receipt) {
    ui.screen = 'saved'; ui.step = null; ui.choices = []; ui.editableFields = [];
    ui.summary = { result: game.result || game.pendingResult?.result || null,
      confirmationRequired: game.confirmationRequired, outcome: row.state.receipt.outcome,
      savedAt: row.state.receipt.savedAt, status: game.status };
    // A saved receipt is a read-only screen even if another action is possible.
    game.resultPermissions = { canSubmit: false, canReview: false };
  }
  return { token: row.token, version: row.version, expiresAt: new Date(row.expires_at).toISOString(), mode: row.mode, game, ...ui };
}
async function loadDraft(client, identityValue, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(token)) throw failure(404, 'GAME_DRAFT_NOT_FOUND', 'Draft not found.');
  const { user, link } = identityValue;
  const { rows: [row] } = await client.query(`SELECT *,expires_at<=clock_timestamp() AS expired FROM telegram_game_drafts
    WHERE token=$1 AND link_id=$2 AND user_id=$3 AND chat_id=$4 FOR UPDATE`, [token, link.id, user.id, link.chat_id]);
  if (!row) throw failure(404, 'GAME_DRAFT_NOT_FOUND', 'Draft not found.');
  if (row.expired) throw failure(410, 'GAME_DRAFT_EXPIRED', 'Draft expired. Open the game again.');
  return row;
}

async function startDraft(client, { user, link, gameId, mode }) {
  // FK(game_id) takes KEY SHARE: start must also precede generic bot user locks.
  await acquireRatingWriteLock(client);
  return isolated(client, async () => {
    if (!Number.isSafeInteger(gameId) || gameId <= 0 || !['submit', 'confirm', 'reject'].includes(mode)) throw failure(400, 'GAME_DRAFT_INPUT', 'Invalid game draft.');
    const actor = await identity(client, user, link);
    const before = await context(client, gameId, actor.user.id);
    const detail = (await results.gameDetail({ client, user: actor.user, params: { id: String(gameId) } })).game;
    assertPermission(detail, mode);
    const fresh = await context(client, gameId, actor.user.id);
    if (before.contextRevision !== fresh.contextRevision || before.resultRevision !== fresh.resultRevision || detail.revision !== fresh.resultRevision) throw conflict();
    const canonical = compact(detail);
    const token = crypto.randomBytes(12).toString('base64url');
    const state = { context: canonical, workflow: steps.createState(canonical, mode) };
    const { rows: [row] } = await client.query(`INSERT INTO telegram_game_drafts(token,link_id,user_id,chat_id,game_id,mode,result_revision,context_revision,state)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(link_id,chat_id) DO UPDATE SET
      token=EXCLUDED.token,user_id=EXCLUDED.user_id,game_id=EXCLUDED.game_id,mode=EXCLUDED.mode,version=0,
      created_at=EXCLUDED.created_at,expires_at=EXCLUDED.expires_at,result_revision=EXCLUDED.result_revision,
      context_revision=EXCLUDED.context_revision,state=EXCLUDED.state RETURNING *`,
    [token, actor.link.id, actor.user.id, actor.link.chat_id, gameId, mode, fresh.resultRevision, fresh.contextRevision, JSON.stringify(state)]);
    return draftView(row);
  });
}
async function readDraft(client, { user, link, token }) {
  return isolated(client, async () => {
    const actor = await identity(client, user, link);
    const row = await loadDraft(client, actor, token);
    const fresh = await context(client, row.game_id, actor.user.id);
    if (!row.state.receipt) assertUnchanged(row, fresh);
    return draftView(row, fresh);
  });
}

async function lockContext(client, current) {
  // The rating lock already precedes actor/link/draft locks. Match website order
  // for tournament/pairing/game, then protect the small recorded context itself.
  if (current.tournament_id) await client.query('SELECT id FROM tournaments WHERE id=$1 FOR UPDATE', [current.tournament_id]);
  if (current.team_match_id) await client.query('SELECT id FROM tournament_team_matches WHERE id=$1 FOR UPDATE', [current.team_match_id]);
  await client.query('SELECT id FROM games WHERE id=$1 FOR UPDATE', [current.id]);
  await client.query('SELECT id FROM game_participants WHERE game_id=$1 ORDER BY slot FOR SHARE', [current.id]);
  if (current.tournament_id) {
    // Tournament writes use its parent lock. These additional locks also guard
    // narrow direct context updates while the fingerprint is checked again.
    await client.query('SELECT id FROM tournament_matches WHERE game_id=$1 FOR SHARE', [current.id]);
    await client.query('SELECT id FROM tournament_team_match_games WHERE game_id=$1 FOR SHARE', [current.id]);
    await client.query(`SELECT r.id FROM tournament_rounds r WHERE r.id IN (
      SELECT round_id FROM tournament_matches WHERE game_id=$1 UNION
      SELECT tm.round_id FROM tournament_team_matches tm JOIN tournament_team_match_games l ON l.team_match_id=tm.id WHERE l.game_id=$1)
      ORDER BY r.id FOR SHARE`, [current.id]);
    await client.query(`SELECT p.id FROM tournament_participants p JOIN game_participants gp ON gp.tournament_participant_id=p.id
      WHERE gp.game_id=$1 ORDER BY p.id FOR SHARE OF p`, [current.id]);
    await client.query(`SELECT r.id FROM tournament_team_rosters r JOIN tournament_team_match_games l
      ON r.id IN (l.roster_a_id,l.roster_b_id) WHERE l.game_id=$1 ORDER BY r.id FOR SHARE OF r`, [current.id]);
    await client.query(`SELECT m.id FROM tournament_team_roster_members m JOIN tournament_team_match_games l
      ON m.id IN (l.roster_a_member_id,l.roster_b_member_id) WHERE l.game_id=$1 ORDER BY m.id FOR SHARE OF m`, [current.id]);
  }
}
async function transitionDraft(client, { user, link, token, version, event }) {
  if (requiresRatingLock(event)) await acquireRatingWriteLock(client);
  return isolated(client, async () => {
    if (!Number.isSafeInteger(version) || version < 0 || !event || typeof event !== 'object' || Array.isArray(event)) throw failure(400, 'GAME_DRAFT_INPUT', 'Invalid draft action.');
    const actor = await identity(client, user, link);
    const row = await loadDraft(client, actor, token);
    if (row.state.receipt && event.type === 'submit') {
      // A lost Telegram response must never repeat the committed result/Elo.
      return draftView(row, await context(client, row.game_id, actor.user.id));
    }
    if (version !== row.version) throw failure(409, 'GAME_DRAFT_STALE', 'This button is outdated. Use the current draft.');
    let fresh = await context(client, row.game_id, actor.user.id);
    assertUnchanged(row, fresh);
    if (event.type === 'submit') {
      if (!['summary', 'review'].includes(row.state.workflow.screen)) throw failure(409, 'GAME_DRAFT_INCOMPLETE', 'Finish and review the result before submitting.');
      await lockContext(client, fresh);
      fresh = await context(client, row.game_id, actor.user.id);
      assertUnchanged(row, fresh);
      const detail = (await results.gameDetail({ client, user: actor.user, params: { id: String(row.game_id) } })).game;
      assertPermission(detail, row.mode);
      const body = row.mode === 'submit' ? steps.resultBody(row.state.context, row.state.workflow) : {};
      const action = { submit: 'result', confirm: 'confirm-result', reject: 'reject-result' }[row.mode];
      const saved = (await results.changeResult({ client, user: actor.user, params: { id: String(row.game_id), action }, body: { ...body, revision: row.result_revision } })).game;
      row.state.context = compact(saved);
      row.state.receipt = { outcome: row.mode === 'reject' ? 'rejected' : row.mode === 'confirm' ? 'confirmed' : saved.status === 'completed' ? 'completed' : 'submitted', savedAt: new Date().toISOString() };
      row.state.workflow.screen = 'saved';
    } else {
      row.state.workflow = steps.transition(row.state.context, row.state.workflow, event);
    }
    const { rows: [updated] } = await client.query('UPDATE telegram_game_drafts SET state=$2,version=version+1 WHERE token=$1 RETURNING *', [token, JSON.stringify(row.state)]);
    return draftView(updated);
  });
}

module.exports = { startDraft, readDraft, transitionDraft, requiresRatingLock };
