module.exports = {
  version:113,name:'calendar_tournament_sync',
  async up(client) {
    await client.query(`ALTER TABLE tournaments.calendar_events
      ADD COLUMN auto_created BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'UTC',
      ALTER COLUMN event_date DROP NOT NULL,
      ALTER COLUMN participant_limit DROP NOT NULL,
      ALTER COLUMN participant_limit TYPE BIGINT,
      ALTER COLUMN entry_fee DROP NOT NULL,
      DROP CONSTRAINT calendar_events_name_check,
      DROP CONSTRAINT calendar_events_city_check,
      DROP CONSTRAINT calendar_events_venue_check,
      DROP CONSTRAINT calendar_events_address_check,
      DROP CONSTRAINT calendar_events_participant_limit_check;
      ALTER TABLE tournaments.calendar_events
      ADD CONSTRAINT calendar_event_name_length CHECK(char_length(btrim(name)) BETWEEN CASE WHEN auto_created THEN 0 ELSE 1 END AND 120),
      ADD CONSTRAINT calendar_event_city_length CHECK(char_length(btrim(city)) BETWEEN CASE WHEN auto_created THEN 0 ELSE 1 END AND 80),
      ADD CONSTRAINT calendar_event_venue_length CHECK(char_length(btrim(venue)) BETWEEN CASE WHEN auto_created THEN 0 ELSE 1 END AND 160),
      ADD CONSTRAINT calendar_event_address_length CHECK(char_length(address)<=CASE WHEN auto_created THEN 500 ELSE 300 END),
      ADD CONSTRAINT calendar_event_capacity CHECK((auto_created AND (participant_limit IS NULL OR participant_limit>=1)) OR (NOT auto_created AND participant_limit BETWEEN 2 AND 10000 AND participant_limit IS NOT NULL)),
      ADD CONSTRAINT calendar_event_fee_required CHECK(auto_created OR entry_fee IS NOT NULL);`);
  }
};
