const { HttpError, ValidationError } = require('../http/io');
const { PUBLISHED_STATUSES } = require('../db/repositories/tournaments');
const { mapTournament, TOURNAMENT_COLUMNS } = require('../db/rows');
const { tournamentSummaryView } = require('./views');
const { options } = require('../resources/pages');

// A manual public announcement linked to a hidden draft remains a safe announcement.
// Otherwise the tournament is the canonical card and its linked calendar row is omitted.
const SOURCE = `WITH provider_events AS (
  SELECT 'tournament'::text AS kind, t.id,
    CASE WHEN t.status='draft' OR t.starts_at IS NULL THEN 'draft'
      WHEN t.status='in_progress' THEN 'current'
      WHEN t.status IN ('completed','cancelled') THEN 'past' ELSE 'future' END AS event_group,
    t.starts_at AS sort_at, t.created_at
  FROM tournaments.tournaments t
  WHERE t.provider_id=$1 AND ($2::boolean OR t.status=ANY($3::text[]))
  UNION ALL
  SELECT 'calendar'::text, e.id,
    CASE WHEN e.event_date IS NULL THEN 'draft'
      WHEN e.event_date >= (CURRENT_TIMESTAMP AT TIME ZONE e.time_zone)::date THEN 'future' ELSE 'past' END,
    (e.event_date + COALESCE(e.start_time,'00:00'::time)) AT TIME ZONE e.time_zone, e.created_at
  FROM tournaments.calendar_events e LEFT JOIN tournaments.tournaments t ON t.id=e.tournament_id
  WHERE e.provider_id=$1 AND NOT e.auto_created AND (
    e.tournament_id IS NULL OR (NOT $2::boolean AND NOT t.status=ANY($3::text[]))
  )
)`;
function values(providerId, canSeeDrafts) { return [providerId,Boolean(canSeeDrafts),PUBLISHED_STATUSES]; }
async function counts(client, providerId, canSeeDrafts) {
  const {rows}=await client.query(SOURCE+` SELECT event_group,count(*)::int AS count
    FROM provider_events WHERE ($2::boolean OR event_group<>'draft') GROUP BY event_group`,values(providerId,canSeeDrafts));
  const result={current:0,future:0,past:0,...(canSeeDrafts?{draft:0}:{})};
  for (const row of rows) result[row.event_group]=row.count;
  return result;
}
async function list({client,user,provider,canSeeDrafts,query}) {
  const group=query?.get('group') || 'current';
  if (!['current','future','past','draft'].includes(group)) throw new ValidationError('Invalid event group');
  if (group==='draft' && !canSeeDrafts) throw new HttpError(403,'Organization membership required');
  const {page}=options(query);
  const calendar=require('../db/repositories/calendar-events');
  const columns=TOURNAMENT_COLUMNS.split(',').map(s=>s.trim())
    .filter(s=>s && !['logo_data','rules_link','round_draft','final_results'].includes(s)).map(s=>'t.'+s).join(',');
  // Count, visibility, page selection and both projections share one MVCC snapshot.
  const {rows:[result]}=await client.query(SOURCE+`, filtered AS (
    SELECT *,row_number() OVER (ORDER BY CASE WHEN $4='past' THEN sort_at END DESC NULLS LAST,
      CASE WHEN $4<>'past' THEN sort_at END ASC NULLS LAST,created_at DESC,kind,id DESC) AS position
    FROM provider_events WHERE event_group=$4
  ), metadata AS (
    SELECT count(*)::int AS total,LEAST($5::int,GREATEST(1,ceil(count(*)/20.0)::int)) AS page FROM filtered
  ), paged AS (
    SELECT * FROM filtered ORDER BY position LIMIT 20 OFFSET (SELECT (page-1)*20 FROM metadata)
  )
  SELECT m.total,m.page,COALESCE(jsonb_agg(jsonb_build_object(
    'kind',b.kind,'tournament',to_jsonb(tv),'calendar',to_jsonb(cv)) ORDER BY b.position)
    FILTER (WHERE b.id IS NOT NULL),'[]'::jsonb) AS entries
  FROM metadata m LEFT JOIN paged b ON TRUE
  LEFT JOIN tournaments.calendar_events e ON b.kind='calendar' AND e.id=b.id
  LEFT JOIN tournaments.tournaments t ON t.id=CASE WHEN b.kind='tournament' THEN b.id ELSE e.tournament_id END
  LEFT JOIN tournaments.tournament_providers p ON p.id=e.provider_id
  LEFT JOIN LATERAL (SELECT ${columns},
      CASE WHEN t.logo_data IS NOT NULL THEN '/api/tournament-logos/'||t.id||'?v='||
        left(encode(sha256(convert_to(t.logo_data,'UTF8')),'hex'),16) END AS logo_data,
      CASE WHEN t.rules_link LIKE 'data:%' THEN '/api/tournaments/'||t.slug||'/rules?v='||
        left(encode(sha256(convert_to(t.rules_link,'UTF8')),'hex'),16) ELSE t.rules_link END AS rules_link,
      CASE WHEN t.participant_mode='team' THEN (SELECT count(*) FROM tournaments.tournament_team_rosters r
        WHERE r.tournament_id=t.id AND r.status<>'withdrawn')
      ELSE (SELECT count(*) FROM tournaments.tournament_participants p WHERE p.tournament_id=t.id
        AND p.status NOT IN ('withdrawn','removed')) END::int AS participant_count,
      (SELECT count(*)::int FROM tournaments.tournament_rounds r WHERE r.tournament_id=t.id) AS round_count
  ) tv ON b.kind='tournament'
  LEFT JOIN LATERAL (SELECT ${calendar.COLUMNS}) cv ON b.kind='calendar'
  GROUP BY m.total,m.page`,[...values(provider.id,canSeeDrafts),group,page]);
  const summary={id:provider.id,slug:provider.slug,name:provider.name,logoUrl:provider.logoUrl};
  const items=[];
  for (const row of result.entries) {
    const item=row.kind==='tournament'?tournamentSummaryView(mapTournament(row.tournament)):calendar.view(row.calendar,user || false);
    if (item) items.push({...item,kind:row.kind,providerId:provider.id,provider:summary});
  }
  return {items,pagination:{page:result.page,currentPage:result.page,pageSize:20,total:result.total,totalPages:Math.max(1,Math.ceil(result.total/20))}};
}
module.exports={counts,list};
