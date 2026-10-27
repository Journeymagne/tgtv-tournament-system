const {
  TOURNAMENT_AUDIT_EVENT_COLUMNS: COLUMNS,
  mapTournamentAuditEvent
} = require("../rows");

async function insert(client, event) {
  const { rows } = await client.query(
    `INSERT INTO tournament_audit_events
       (tournament_id, actor_user_id, event_type, entity_type, entity_id,
        before, after, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
     RETURNING ${COLUMNS}`,
    [
      event.tournamentId,
      event.actorUserId || null,
      event.eventType,
      event.entityType || null,
      event.entityId || null,
      require('../../resources/audit').auditJson(event.before),
      require('../../resources/audit').auditJson(event.after),
      require('../../resources/audit').auditJson(event.metadata)
    ]
  );
  return mapTournamentAuditEvent(rows[0]);
}

async function listByTournament(client, tournamentId, query) {
  const result = await require('../../resources/pages').select(client,
    `SELECT ${COLUMNS} FROM tournament_audit_events
     WHERE tournament_id = $1
     ORDER BY created_at DESC, id DESC`,
    [tournamentId], query
  );
  return Object.assign(result.rows.map(mapTournamentAuditEvent), { pagination:result.pagination });
}

module.exports = { insert, listByTournament };
