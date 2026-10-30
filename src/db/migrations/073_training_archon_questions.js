const questions = require('../../training-data/hand-of-the-archon.json');
module.exports = {
  version: 73, name: 'training_archon_questions',
  async up(client) {
    await client.query('SELECT id FROM knowthykt.training_bank_state WHERE id=TRUE FOR UPDATE');
    for (const question of questions) {
      await client.query('INSERT INTO knowthykt.training_questions(id,content) VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [question.id, JSON.stringify(question)]);
    }
    await client.query('UPDATE knowthykt.training_bank_state SET revision=revision+1 WHERE id=TRUE');
  }
};
