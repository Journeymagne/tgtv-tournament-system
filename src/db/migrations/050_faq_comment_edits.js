module.exports = {
  version: 50,
  name: 'faq_comment_edits',
  async up(client) {
    await client.query(`ALTER TABLE faq_questions
      ADD COLUMN revision INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN updated_at TIMESTAMPTZ,
      ADD COLUMN reply_updated_at TIMESTAMPTZ`);
  }
};
