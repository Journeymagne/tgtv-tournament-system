const updates = require('./083_faq_october_errata.json');

module.exports = {
  version: 83,
  name: 'faq_october_errata',
  async up(client) {
    for (const update of updates) {
      const { rows: [entry] } = await client.query(
        "SELECT content, revision FROM faq_entries WHERE id=$1 AND status='published' FOR UPDATE",
        [update.id]
      );
      if (!entry || entry.revision !== update.expectedRevision ||
          entry.content.question !== update.question ||
          (update.expectedAnswer !== undefined && entry.content.answer !== update.expectedAnswer)) {
        continue;
      }
      const after = { ...entry.content, ...update.content };
      await client.query(
        'UPDATE faq_entries SET content=$2, revision=revision+1, updated_at=NOW() WHERE id=$1',
        [update.id, JSON.stringify(after)]
      );
      await client.query(
        'INSERT INTO faq_history(entry_id,action,snapshot) VALUES($1,$2,$3)',
        [update.id, 'edited', JSON.stringify({ before: entry.content, after })]
      );
    }
  }
};
