module.exports = {
  version: 123, name: 'event_venue_and_chat',
  async up(client) {
    await client.query(`ALTER TABLE tournaments.tournaments ADD COLUMN chat_url varchar(2048) NOT NULL DEFAULT '';
      ALTER TABLE tournaments.calendar_events
        ADD COLUMN chat_url varchar(2048),
        ADD COLUMN venue_mode text CHECK (venue_mode IN ('irl','tts')),
        DROP CONSTRAINT calendar_event_city_length,
        DROP CONSTRAINT calendar_event_venue_length,
        ADD CONSTRAINT calendar_event_city_length CHECK (char_length(btrim(city)) BETWEEN
          CASE WHEN auto_created OR venue_mode = 'tts' THEN 0 ELSE 1 END AND 80),
        ADD CONSTRAINT calendar_event_venue_length CHECK (char_length(btrim(venue)) BETWEEN
          CASE WHEN auto_created OR venue_mode = 'tts' THEN 0 ELSE 1 END AND 160);`);
  }
};
