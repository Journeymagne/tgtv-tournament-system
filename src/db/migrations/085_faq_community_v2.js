const { additions, changes } = require('./085_faq_community_v2.json');

module.exports = {
  version: 85,
  name: 'faq_community_v2',
  async up(client) {
    for (const { id, category, expected, patch, archive } of changes) {
      const { rows: [entry] } = await client.query(
        "SELECT content, revision FROM faq_entries WHERE id=$1 AND status='published' FOR UPDATE",
        [id]
      );
      if (!entry || entry.content.category !== category || !expected.some(before =>
        entry.revision === before.revision && entry.content.question === before.question &&
        entry.content.answer === before.answer
      )) continue;

      const after = { ...entry.content, ...patch };
      const status = archive ? 'archived' : 'published';
      await client.query(
        'UPDATE faq_entries SET content=$2, status=$3, revision=revision+1, updated_at=NOW() WHERE id=$1',
        [id, JSON.stringify(after), status]
      );
      const snapshot = archive
        ? { before: entry.content, beforeStatus: 'published', afterStatus: status, revision: entry.revision }
        : { before: entry.content, after };
      await client.query(
        'INSERT INTO faq_history(entry_id,action,snapshot) VALUES($1,$2,$3)',
        [id, archive ? 'deleted' : 'edited', JSON.stringify(snapshot)]
      );
    }

    for (const { id, ...content } of additions) {
      const { rowCount } = await client.query(
        'INSERT INTO faq_entries(id,content) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',
        [id, JSON.stringify(content)]
      );
      if (rowCount) {
        await client.query(
          'INSERT INTO faq_history(entry_id,action,snapshot) VALUES($1,$2,$3)',
          [id, 'created', JSON.stringify({ after: content })]
        );
      }
    }
  }
};
