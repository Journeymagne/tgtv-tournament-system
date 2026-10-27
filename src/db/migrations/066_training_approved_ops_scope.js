const scope = require('../../training-data/approved-ops-scope.json');
const catalogStore = require('../repositories/training-catalog');
const training = require('../repositories/training');

module.exports = {
  version: 66, name: 'training_approved_ops_scope',
  async up(client) {
    const before = await catalogStore.load(client, true);
    const excluded = scope.excluded.map(entry => before.byId.get(entry.id));
    if (excluded.some(q => !q)) throw new Error('Approved Ops scope: expected question is missing');
    if (excluded.every(q => q.status === 'deleted')) return;
    // Preserve already earned titles before reducing the course, including for
    // offline accounts. Keep question IDs, content, snapshots and earned XP intact.
    await training.syncAllJourneys(client, before);
    let changed = false;
    for (const question of excluded) {
      if (question.status === 'deleted') continue;
      if (!/compound|stockade|fortified position|bheta.decima|octarius/i.test(question.topic + ' ' + question.question + ' ' + question.source.url)) {
        throw new Error('Approved Ops scope: question was repurposed; review ' + question.id);
      }
      await client.query(`UPDATE knowthykt.training_questions SET status='deleted',revision=revision+1,updated_at=NOW() WHERE id=$1`, [question.id]);
      await catalogStore.event(client, question.id, { id: null }, 'delete', scope.reason,
        { before: question, after: { ...question, status: 'deleted', revision: question.revision + 1 }, scope: scope.missionPack });
      changed = true;
    }
    if (!changed) return;
    await catalogStore.changed(client);
    await training.syncAllJourneys(client, await catalogStore.load(client));
    // Existing session reconciliation replaces unanswered withdrawn questions
    // on the next read. Checked answers retain their saved wording and scoring.
  }
};
