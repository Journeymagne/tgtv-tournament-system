const SCHEMA = `
  ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS round_draft JSONB;
`;

module.exports = {
  version: 11,
  name: "tournament_round_draft",
  async up(client) {
    await client.query(SCHEMA);
  }
};
