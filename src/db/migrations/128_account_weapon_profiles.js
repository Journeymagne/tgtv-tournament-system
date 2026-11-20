module.exports = {
  version: 128,
  name: 'account_weapon_profiles',
  async up(client) {
    await client.query(`
      CREATE TABLE accounts.weapon_profiles (
        user_id INTEGER NOT NULL REFERENCES accounts.users(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('shoot','fight')),
        name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
        model JSONB NOT NULL CHECK (jsonb_typeof(model) = 'object' AND octet_length(model::TEXT) <= 16384),
        revision UUID NOT NULL DEFAULT gen_random_uuid(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY (user_id,mode,name)
      );
      CREATE TABLE accounts.weapon_profile_imports (
        user_id INTEGER NOT NULL REFERENCES accounts.users(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('shoot','fight')),
        import_id UUID NOT NULL,
        PRIMARY KEY (user_id,mode,import_id)
      );
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='kt_accounts') THEN
          GRANT SELECT,INSERT,UPDATE,DELETE ON accounts.weapon_profiles TO kt_accounts;
          GRANT SELECT,INSERT ON accounts.weapon_profile_imports TO kt_accounts;
        END IF;
      END $$;
    `);
  }
};
