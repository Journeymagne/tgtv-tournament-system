const { PUBLISHED_STATUSES } = require('./tournaments');
const { uniqueSlug, baseSlug } = require('../../domain/tournaments/slug');
const { leagueFormat, resolveTournamentOrder, supportedMetrics } = require('../../domain/leagues/rules');

const LEAGUE_COLUMNS = 'l.id,l.slug,l.name,l.formats,l.revision,l.owner_user_id AS "ownerUserId"';
const SOURCE_COLUMNS = `t.id,t.name,t.slug,t.status,t.format,t.starts_at AS "startsAt",
  t.completed_at AS "completedAt",t.participant_mode AS "participantMode",t.team_size AS "teamSize",
  t.pairing_type AS "pairingType",t.team_tiebreaker_order AS "teamTiebreakerOrder",
  t.tiebreaker_order AS "tiebreakerOrder"`;

async function list(client) {
  const {rows} = await client.query(`SELECT ${LEAGUE_COLUMNS},
    (SELECT count(*)::int FROM league_tournaments lt JOIN tournaments t ON t.id=lt.tournament_id
      WHERE lt.league_id=l.id AND t.status=ANY($1)) AS "eventCount"
    FROM leagues l ORDER BY lower(l.name),l.id`,[PUBLISHED_STATUSES]);
  return rows;
}

async function find(client, key, {slug=false,lock=false}={}) {
  const {rows} = await client.query(`SELECT ${LEAGUE_COLUMNS} FROM leagues l
    WHERE l.${slug?'slug':'id'}=$1 ${lock?'FOR UPDATE':''}`,[key]);
  return rows[0] || null;
}

async function config(client,id) {
  const {rows} = await client.query(`SELECT track,primary_points,scale,criteria,source_snapshot
    FROM league_rules WHERE league_id=$1`,[id]);
  const rules = Object.fromEntries(rows.map(row => [row.track,{
    primary:row.primary_points,scale:row.scale.map(Number),criteria:row.criteria,...row.source_snapshot
  }]));
  const links = await client.query(`SELECT t.id FROM league_tournaments lt JOIN tournaments t ON t.id=lt.tournament_id
    WHERE lt.league_id=$1 AND t.status=ANY($2) ORDER BY t.id`,[id,PUBLISHED_STATUSES]);
  return {rules,tournamentIds:links.rows.map(row=>row.id)};
}

async function availableSources(client,{ids=null,q='',lock=false}={}) {
  const {rows} = await client.query(`SELECT ${SOURCE_COLUMNS} FROM tournaments t
    WHERE t.status=ANY($1) AND ($2::integer[] IS NULL OR t.id=ANY($2)) AND strpos(lower(t.name),lower($3))>0
    ORDER BY ${lock?'t.id':'t.starts_at DESC NULLS LAST,t.id DESC'} ${lock?'FOR SHARE OF t':''}`,[PUBLISHED_STATUSES,ids,q]);
  return rows;
}

function sourceSummary(t) {
  const format=leagueFormat(t);
  return {id:t.id,name:t.name,slug:t.slug,date:t.startsAt || t.completedAt,format,pairingType:t.pairingType,track:format==='solo'?'solo':'org',
    status:t.status,order:resolveTournamentOrder(t),supportedMetrics:supportedMetrics(t)};
}

async function insert(client,data,userId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('league_slug_allocation'))");
  const slug = await uniqueSlug(baseSlug(data.name)==='tournament'?'league':data.name, async candidate =>
    ['new','sources','preview'].includes(candidate) || (await client.query('SELECT 1 FROM leagues WHERE slug=$1',[candidate])).rowCount>0);
  const {rows:[row]}=await client.query(`INSERT INTO leagues(name,slug,formats,owner_user_id) VALUES ($1,$2,$3,$4)
    RETURNING id,revision`,[data.name,slug,data.formats,userId]);
  return row;
}

async function replaceConfig(client,id,data) {
  await client.query('DELETE FROM league_rules WHERE league_id=$1',[id]);
  for (const [track,rule] of Object.entries(data.rules)) {
    const snapshot = rule.sourceTournamentId ? {sourceTournamentId:rule.sourceTournamentId,sourceName:rule.sourceName,
      sourceVersion:rule.sourceVersion || 1} : null;
    await client.query(`INSERT INTO league_rules(league_id,track,primary_points,scale,criteria,source_snapshot)
      VALUES ($1,$2,$3,$4,$5,$6)`,[id,track,rule.primary,rule.scale,JSON.stringify(rule.criteria),snapshot]);
  }
  // Unpublished links stay dormant if a tournament returns to draft.
  await client.query(`DELETE FROM league_tournaments lt USING tournaments t
    WHERE lt.league_id=$1 AND t.id=lt.tournament_id AND t.status=ANY($3)
    AND NOT (lt.tournament_id=ANY($2::int[]))`,[id,data.tournamentIds,PUBLISHED_STATUSES]);
  await client.query(`INSERT INTO league_tournaments(league_id,tournament_id)
    SELECT $1,unnest($2::int[]) ON CONFLICT DO NOTHING`,[id,data.tournamentIds]);
}

async function update(client,id,data) {
  await client.query('UPDATE leagues SET name=$2,formats=$3,revision=revision+1 WHERE id=$1',[id,data.name,data.formats]);
}

async function forTournament(client,id) {
  const {rows}=await client.query(`SELECT l.slug,l.name,
    CASE WHEN t.participant_mode='team' THEN 'org' ELSE 'solo' END AS track
    FROM league_tournaments lt JOIN leagues l ON l.id=lt.league_id JOIN tournaments t ON t.id=lt.tournament_id
    WHERE lt.tournament_id=$1 AND t.status=ANY($2)
      AND (CASE WHEN t.participant_mode<>'team' THEN 'solo'
        WHEN t.pairing_type IN ('doubles','wtc_doubles') THEN 'doubles' ELSE 'team' END)=ANY(l.formats)
    ORDER BY lower(l.name),l.id`,[id,PUBLISHED_STATUSES]);
  return rows;
}

// The caller already holds the tournament write lock. Configuration writes lock sources before leagues as well.
async function syncTournamentIdentities(client,id) {
  const {rows}=await client.query(`SELECT l.id FROM leagues l JOIN league_tournaments lt ON lt.league_id=l.id
    WHERE lt.tournament_id=$1 ORDER BY l.id FOR UPDATE OF l`,[id]);
  if (!rows.length) return;
  const bundles=await require('./league-events').loadLeagueEvents(client,[id]);
  const people=require('./league-identities');
  for (const row of rows) await people.sync(client,row.id,bundles);
}

module.exports={list,find,config,availableSources,sourceSummary,insert,replaceConfig,update,forTournament,syncTournamentIdentities};
