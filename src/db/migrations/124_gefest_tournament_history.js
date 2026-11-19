const slugs = [
  'sneaky-gits-vol-2',
  'shadows-bite-23-09-26',
  'warp-storm-vol-1',
  'sneaky-gits-vol-3',
  'shadows-bite-28-10-26',
  'shadows-bite-25-11-26-20'
];

module.exports = {
  version: 124, name: 'gefest_tournament_history',
  async up(client) {
    const {rows: [provider]} = await client.query(`SELECT id, owner_user_id
      FROM tournaments.tournament_providers
      WHERE slug = 'imgefest-tournament-series' AND owner_user_id = 100 AND archived_at IS NULL
      FOR UPDATE`);
    if (!provider) return;

    const {rows: tournaments} = await client.query(`SELECT id, provider_id
      FROM tournaments.tournaments
      WHERE owner_user_id = $1 AND slug = ANY($2::text[])
      ORDER BY id FOR UPDATE`, [provider.owner_user_id, slugs]);
    const ids = tournaments.map(row => row.id);
    const {rows: announcements} = await client.query(`SELECT id, provider_id
      FROM tournaments.calendar_events WHERE tournament_id = ANY($1::int[])
      ORDER BY id FOR UPDATE`, [ids]);
    if ([...tournaments, ...announcements].some(row => row.provider_id != null && row.provider_id !== provider.id)) {
      throw new Error('A selected Gefest tournament or announcement belongs to another organization');
    }

    await client.query(`WITH linked_tournaments AS (
      UPDATE tournaments.tournaments SET provider_id = $1, updated_at = clock_timestamp()
      WHERE id = ANY($2::int[]) AND provider_id IS NULL RETURNING id
    ), linked_announcements AS (
      UPDATE tournaments.calendar_events SET provider_id = $1, updated_at = clock_timestamp()
      WHERE tournament_id = ANY($2::int[]) AND provider_id IS NULL RETURNING id
    )
    INSERT INTO tournaments.tournament_provider_audit_events
      (provider_id, event_type, entity_type, entity_id, before, after)
    SELECT $1, 'event_linked', entity_type, id,
      jsonb_build_object('providerId', NULL::int), jsonb_build_object('providerId', $1::int)
    FROM (
      SELECT 'tournament' AS entity_type, id FROM linked_tournaments
      UNION ALL SELECT 'calendar_event', id FROM linked_announcements
    ) linked`, [provider.id, ids]);
  }
};
