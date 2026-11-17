const COLUMNS = `e.id,e.name,to_char(e.event_date,'YYYY-MM-DD') AS date,
  to_char(e.start_time,'HH24:MI') AS time,e.city,e.venue,e.address,e.tournament_type,
  e.participant_limit,e.entry_fee,e.tournament_id,e.swiss_round_count,e.team_size,e.auto_created,
  to_char(e.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  t.slug AS tournament_slug,t.status AS tournament_status,t.venue_mode,
  (t.logo_data IS NOT NULL AND t.logo_data<>'') AS has_poster`;
const FROM = 'tournaments.calendar_events e LEFT JOIN tournaments.tournaments t ON t.id=e.tournament_id';
const FIELDS = ['name','event_date','start_time','city','venue','address','tournament_type','participant_limit','entry_fee','swiss_round_count','team_size'];
const values = e => [e.name,e.date,e.time,e.city,e.venue,e.address,e.tournamentType,e.participantLimit,e.entryFee,e.swissRoundCount,e.teamSize];

function view(row, admin = false) {
  if (!row) return null;
  const published = ['registration_open','registration_closed','in_progress','completed','cancelled'].includes(row.tournament_status);
  return { id: row.id, name: row.name, date: row.date, time: row.time, city: row.city, venue: row.venue,
    address: row.address, tournamentType: row.tournament_type, participantMode:row.tournament_type==='solo'?'individual':'team',
    teamSize:row.team_size,swissRoundCount:row.swiss_round_count,participantLimit: row.participant_limit==null?null:Number(row.participant_limit),
    entryFee: row.entry_fee==null?null:Number(row.entry_fee), autoCreated:row.auto_created, venueMode:row.venue_mode,
    updatedAt: row.updated_at, tournamentCreated: !!row.tournament_id,
    isParticipant: Boolean(row.is_participant && (admin || published)),
    posterUrl:row.has_poster && row.tournament_id && (admin || published) ? `/api/tournament-logos/${row.tournament_id}` : null,
    tournament: row.tournament_id && (admin || published)
      ? { id: row.tournament_id, slug: row.tournament_slug, status: row.tournament_status } : null };
}
async function list(client, range, admin, userId = null) {
  const { rows } = await client.query(`SELECT ${COLUMNS},
    CASE WHEN $3::int IS NULL THEN FALSE
      WHEN t.participant_mode='individual' THEN EXISTS (
        SELECT 1 FROM tournaments.tournament_participants p
        WHERE p.tournament_id=t.id AND p.user_id=$3 AND p.status NOT IN ('withdrawn','removed')
      )
      WHEN t.participant_mode='team' THEN EXISTS (
        SELECT 1 FROM tournaments.tournament_team_rosters r
        WHERE r.tournament_id=t.id AND r.status<>'withdrawn' AND (
          r.captain_user_id=$3 OR EXISTS (
            SELECT 1 FROM tournaments.tournament_team_roster_members m
            WHERE m.roster_id=r.id AND m.user_id=$3 AND m.ended_at IS NULL
          )
        )
      ) ELSE FALSE END AS is_participant
    FROM ${FROM}
    WHERE e.event_date >= $1::date AND e.event_date < $2::date
      AND (NOT e.auto_created OR (t.id IS NOT NULL AND ($4::boolean OR t.status=ANY($5::text[]))))
    ORDER BY e.event_date,e.start_time NULLS LAST,e.id`, [range.from, range.until, userId, !!admin, require('./tournaments').PUBLISHED_STATUSES]);
  return rows.map(row => view(row, admin));
}
async function find(client, id, admin = false, lock = false) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE e.id=$1${lock ? ' FOR UPDATE OF e' : ''}`, [id]);
  return view(rows[0], admin);
}
async function insert(client, event, userId) {
  const { rows } = await client.query(`INSERT INTO tournaments.calendar_events (${FIELDS.join(',')},created_by)
    VALUES (${FIELDS.map((_, i) => '$'+(i+1)).join(',')},$${FIELDS.length+1}) RETURNING id`, [...values(event), userId]);
  return find(client, rows[0].id, true);
}
async function update(client, id, event) {
  await client.query(`UPDATE tournaments.calendar_events SET ${FIELDS.map((name,i)=>`${name}=$${i+2}`).join(',')},updated_at=clock_timestamp() WHERE id=$1`, [id,...values(event)]);
  return find(client, id, true);
}
async function link(client, id, tournamentId) {
  await client.query('UPDATE tournaments.calendar_events SET tournament_id=$2,updated_at=clock_timestamp() WHERE id=$1', [id,tournamentId]);
}
async function syncTournament(client, tournament, timeZone = null) {
  try {
  // Keep announcement identity and editorial fields; only the tournament start owns the schedule.
  const {rows}=await client.query(`UPDATE tournaments.calendar_events SET
    event_date=($2::timestamptz AT TIME ZONE COALESCE($3,time_zone))::date,
    start_time=($2::timestamptz AT TIME ZONE COALESCE($3,time_zone))::time,
    time_zone=COALESCE($3,time_zone),updated_at=clock_timestamp()
    WHERE tournament_id=$1 RETURNING id`,[tournament.id,tournament.startsAt,timeZone]);
  if(rows.length||!tournament.startsAt)return;
  const size=tournament.participantMode==='team'?tournament.teamSize:1;
  const rounds=tournament.swissRoundCount||Math.log2(tournament.singleEliminationSize||8);
  const limit=tournament.registrationLimit?Number(tournament.registrationLimit)*size:
    tournament.format==='single_elimination'?tournament.singleEliminationSize:null;
  await client.query(`INSERT INTO tournaments.calendar_events
    (name,event_date,start_time,city,venue,address,tournament_type,participant_limit,entry_fee,
      tournament_id,swiss_round_count,team_size,created_by,auto_created,time_zone)
    VALUES ($1,($2::timestamptz AT TIME ZONE $3)::date,($2::timestamptz AT TIME ZONE $3)::time,
      '','',$4,$5,$6,NULL,$7,$8,$9,$10,TRUE,$3)
    ON CONFLICT(tournament_id) DO NOTHING`,[tournament.name,tournament.startsAt,timeZone||'UTC',tournament.venueAddress||'',
      size===1?'solo':size===2?'pairs':'teams',limit,tournament.id,rounds,size===1?null:size,tournament.ownerUserId]);
  } catch(error) {
    if(error.code==='23514'&&error.constraint==='calendar_events_event_date_check') {
      throw new (require('../../http/io').ValidationError)('Calendar date must be between 2000-01-01 and 2099-12-31');
    }
    if(error.code==='22023'&&/time zone/i.test(error.message))throw new (require('../../http/io').ValidationError)('Invalid calendar time zone');
    throw error;
  }
}
async function remove(client, id) { await client.query('DELETE FROM tournaments.calendar_events WHERE id=$1',[id]); }
module.exports = { list, find, insert, update, link, syncTournament, remove };
