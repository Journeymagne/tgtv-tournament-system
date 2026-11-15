module.exports = {
  version: 49,
  name: 'faq_info',
  async up(client) {
    const id = 'community-017';
    const { rows: [entry] } = await client.query(
      'SELECT content FROM faq_entries WHERE id=$1 FOR UPDATE', [id]
    );
    if (entry?.content.category === 'community') {
      const after = { ...entry.content, category: 'info' };
      await client.query(
        'UPDATE faq_entries SET content=$2,revision=revision+1,updated_at=NOW() WHERE id=$1',
        [id, JSON.stringify(after)]
      );
      await client.query(
        'INSERT INTO faq_history(entry_id,action,snapshot) VALUES($1,$2,$3)',
        [id, 'moved_to_info', JSON.stringify({ before: entry.content, after })]
      );
    }
    // Keep pending corrections in the same section as their source record.
    await client.query(
      `UPDATE faq_submissions SET content=jsonb_set(content,'{category}','"info"'::jsonb)
       WHERE entry_id=$1 AND content->>'category'='community'
         AND status IN ('pending','needs_changes')`, [id]
    );
  }
};
