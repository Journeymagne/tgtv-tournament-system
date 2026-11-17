const COLUMNS = `e.id,e.name,to_char(e.event_date,'YYYY-MM-DD') AS date,
  to_char(e.start_time,'HH24:MI') AS time,e.city,e.venue,e.address,e.tournament_type,
  e.participant_limit,e.entry_fee,e.tournament_id,
  to_char(e.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  t.slug AS tournament_slug,t.status AS tournament_status`;
const FROM = 'tournaments.calendar_events e LEFT JOIN tournaments.tournaments t ON t.id=e.tournament_id';
const FIELDS = ['name','event_date','start_time','city','venue','address','tournament_type','participant_limit','entry_fee'];
const values = e => [e.name,e.date,e.time,e.city,e.venue,e.address,e.tournamentType,e.participantLimit,e.entryFee];

function view(row, admin = false) {
  if (!row) return null;
  const published = ['registration_open','registration_closed','in_progress','completed','cancelled'].includes(row.tournament_status);
  return { id: row.id, name: row.name, date: row.date, time: row.time, city: row.city, venue: row.venue,
    address: row.address, tournamentType: row.tournament_type, participantLimit: row.participant_limit,
    entryFee: Number(row.entry_fee), updatedAt: row.updated_at, tournamentCreated: !!row.tournament_id,
    tournament: row.tournament_id && (admin || published)
      ? { id: row.tournament_id, slug: row.tournament_slug, status: row.tournament_status } : null };
}
async function list(client, range, admin) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM ${FROM}
    WHERE e.event_date >= $1::date AND e.event_date < $2::date ORDER BY e.event_date,e.start_time NULLS LAST,e.id`, [range.from, range.until]);
  return rows.map(row => view(row, admin));
}
async function find(client, id, admin = false, lock = false) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE e.id=$1${lock ? ' FOR UPDATE OF e' : ''}`, [id]);
  return view(rows[0], admin);
}
async function insert(client, event, userId) {
  const { rows } = await client.query(`INSERT INTO tournaments.calendar_events (${FIELDS.join(',')},created_by)
    VALUES (${FIELDS.map((_, i) => '$'+(i+1)).join(',')},$10) RETURNING id`, [...values(event), userId]);
  return find(client, rows[0].id, true);
}
async function update(client, id, event) {
  await client.query(`UPDATE tournaments.calendar_events SET ${FIELDS.map((name,i)=>`${name}=$${i+2}`).join(',')},updated_at=clock_timestamp() WHERE id=$1`, [id,...values(event)]);
  return find(client, id, true);
}
async function link(client, id, tournamentId) {
  await client.query('UPDATE tournaments.calendar_events SET tournament_id=$2,updated_at=clock_timestamp() WHERE id=$1', [id,tournamentId]);
}
async function remove(client, id) { await client.query('DELETE FROM tournaments.calendar_events WHERE id=$1',[id]); }
module.exports = { list, find, insert, update, link, remove };
