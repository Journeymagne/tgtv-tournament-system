module.exports = {
  version:119,name:'calendar_pending_conditions',
  async up(client) {
    await client.query(`ALTER TABLE tournaments.calendar_events
      DROP CONSTRAINT calendar_event_fee_required,
      DROP CONSTRAINT calendar_event_capacity,
      ADD CONSTRAINT calendar_event_capacity CHECK(
        participant_limit IS NULL OR
        (auto_created AND participant_limit>=1) OR
        (NOT auto_created AND participant_limit BETWEEN 2 AND 10000)
      );`);
  }
};
