const { progression } = require('../../domain/training-progression');
const catalogStore = require('../repositories/training-catalog');

module.exports = {
  version: 82, name: 'training_first_correct_ranks',
  async up(client) {
    const catalog = await catalogStore.load(client, true);
    const { rows } = await client.query('SELECT * FROM knowthykt.training_profiles ORDER BY user_id FOR UPDATE');
    for (const profile of rows) {
      const journey = progression(profile.stats, catalog.questions, profile.rank_tier);
      // Award the new qualification to offline accounts too. Keep all earned
      // titles, XP, answers and the one-time notification marker untouched.
      if (journey.rank.tier > profile.rank_tier) {
        await client.query(`UPDATE knowthykt.training_profiles
          SET rank_tier=$2,revision=revision+1 WHERE user_id=$1`, [profile.user_id, journey.rank.tier]);
      }
    }
  }
};
