const seed = require('../../training-data/questions.json');

module.exports = {
  version: 62, name: 'training_moderation',
  async up(client) {
    await client.query(`
      CREATE TABLE knowthykt.training_bank_state (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id), revision INTEGER NOT NULL DEFAULT 1);
      INSERT INTO knowthykt.training_bank_state(id) VALUES(TRUE);
      CREATE TABLE knowthykt.training_questions (
        id TEXT PRIMARY KEY, content JSONB NOT NULL CHECK (jsonb_typeof(content)='object'),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','review','deleted')),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE knowthykt.training_question_events (
        id BIGSERIAL PRIMARY KEY, question_id TEXT NOT NULL REFERENCES knowthykt.training_questions(id),
        actor_id INTEGER REFERENCES accounts.users(id) ON DELETE SET NULL,
        request_id UUID, action TEXT NOT NULL CHECK (action IN ('report','save','restore','delete','comment')),
        comment TEXT NOT NULL DEFAULT '', snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(actor_id,request_id));
      CREATE INDEX training_question_events_history ON knowthykt.training_question_events(question_id,id DESC);
      CREATE VIEW knowthykt.public_questions AS
        SELECT id,content,status,version,revision,updated_at FROM knowthykt.training_questions;
    `);
    for (const question of seed) {
      await client.query('INSERT INTO knowthykt.training_questions(id,content) VALUES($1,$2)', [question.id, JSON.stringify(question)]);
    }
    // Pin the original wording/answer order before the first moderator can edit it.
    await client.query(`UPDATE knowthykt.training_sessions s SET items=(
      SELECT jsonb_agg(CASE WHEN q.id IS NULL THEN item ELSE item || jsonb_build_object('question',q.content || jsonb_build_object('version',1,'revision',1)) END ORDER BY ordinal)
      FROM jsonb_array_elements(s.items) WITH ORDINALITY AS entries(item,ordinal)
      LEFT JOIN knowthykt.training_questions q ON q.id=item->>'questionId')`);
    // Both screenshots supplied by the user are queued for editorial review.
    for (const id of ['kt-083', 'kt-086']) {
      await client.query("UPDATE knowthykt.training_questions SET status='review',revision=2 WHERE id=$1", [id]);
      await client.query(`INSERT INTO knowthykt.training_question_events(question_id,action,comment,snapshot)
        SELECT id,'report',$2,content FROM knowthykt.training_questions WHERE id=$1`,
      [id, 'Сообщение пользователя от 22.10.2026: спорный вопрос / несоответствие вопроса и ответа на приложенных скриншотах. Проверить формулировку и правило.']);
    }
    // Existing split-service installations can use the new tables immediately.
    await client.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_knowthykt') THEN
        GRANT SELECT,INSERT,UPDATE,DELETE ON knowthykt.training_bank_state,knowthykt.training_questions,knowthykt.training_question_events TO kt_knowthykt;
        GRANT USAGE,SELECT ON SEQUENCE knowthykt.training_question_events_id_seq TO kt_knowthykt;
        GRANT SELECT ON knowthykt.public_questions TO kt_knowthykt;
      END IF;
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_tournaments') THEN
        GRANT SELECT ON knowthykt.public_questions TO kt_tournaments;
      END IF;
    END $$`);
  }
};
