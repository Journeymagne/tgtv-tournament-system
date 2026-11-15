const { bootstrap } = require('../../../public/training/progression-history');
const { progression } = require('../../domain/training-progression');
const catalogStore = require('../repositories/training-catalog');
const training = require('../repositories/training');

module.exports = {
  version: 64, name: 'training_retained_ranks',
  async up(client) {
    await client.query(`
      ALTER TABLE knowthykt.training_profiles
        ADD COLUMN rank_tier SMALLINT NOT NULL DEFAULT 1 CHECK(rank_tier BETWEEN 1 AND 6),
        ADD COLUMN recertification_key TEXT;
      ALTER TABLE knowthykt.training_bank_state ADD COLUMN legacy_rank_cutoff TIMESTAMPTZ;
      UPDATE knowthykt.training_bank_state SET legacy_rank_cutoff=(SELECT applied_at FROM public.schema_migrations WHERE version=62);
      CREATE VIEW knowthykt.public_ranks AS SELECT user_id,rank_tier FROM knowthykt.training_profiles;
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_tournaments') THEN
          GRANT SELECT ON knowthykt.public_ranks TO kt_tournaments;
        END IF;
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_knowthykt') THEN
          GRANT SELECT ON knowthykt.public_ranks TO kt_knowthykt;
        END IF;
      END $$;
    `);
    const catalog = await catalogStore.load(client, true);
    const { rows: profiles } = await client.query('SELECT * FROM knowthykt.training_profiles ORDER BY user_id FOR UPDATE');
    for (const profile of profiles) {
      const { rows: sessions } = await client.query('SELECT items FROM knowthykt.training_sessions WHERE user_id=$1', [profile.user_id]);
      const restored = bootstrap(profile.stats, sessions, catalog.questions, catalog.legacyRankCutoff);
      // Also preserve titles earned in the 300-question release, whose course
      // included questions awaiting moderation. Never grant a legacy title for new answers.
      const previous = progression(profile.stats, catalog.questions.filter(q => q.status !== 'deleted').map(q => ({ ...q, status: 'active' })));
      profile.stats = restored.stats;
      profile.rank_tier = Math.max(restored.legacyTier, previous.rank.tier);
      await client.query('UPDATE knowthykt.training_profiles SET stats=$2,rank_tier=$3 WHERE user_id=$1',
        [profile.user_id, JSON.stringify(profile.stats), profile.rank_tier]);
      await training.syncJourney(client, profile, catalog);
    }
  }
};
