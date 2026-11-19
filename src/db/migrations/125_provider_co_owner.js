module.exports = {
  version: 125, name: 'provider_co_owner',
  async up(client) {
    await client.query(`ALTER TABLE tournaments.tournament_providers
      ADD COLUMN co_owner_user_id INTEGER REFERENCES accounts.users(id),
      ADD CHECK (co_owner_user_id <> owner_user_id),
      ADD CONSTRAINT tournament_providers_active_co_owner_fkey
        FOREIGN KEY (id, co_owner_user_id)
        REFERENCES tournaments.tournament_provider_memberships (provider_id, active_organizer_user_id)
        DEFERRABLE INITIALLY DEFERRED`);
  }
};
