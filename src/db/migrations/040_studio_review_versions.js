module.exports={
  version:40,name:"studio_review_versions",
  async up(client){
    await client.query(`CREATE TABLE studio_review_ratings (
      review_id UUID NOT NULL REFERENCES studio_reviews(id) ON DELETE CASCADE,
      version_label TEXT NOT NULL,
      publication_revision INTEGER NOT NULL,
      theme_score SMALLINT NOT NULL CHECK(theme_score BETWEEN 1 AND 5),
      balance_score SMALLINT NOT NULL CHECK(balance_score BETWEEN 1 AND 5),
      lore_score SMALLINT NOT NULL CHECK(lore_score BETWEEN 1 AND 5),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(review_id,version_label)
    );
    INSERT INTO studio_review_ratings
    SELECT DISTINCT ON (review_id,COALESCE(NULLIF(btrim(snapshot->>'version_label'),''),'1.0'))
      review_id,COALESCE(NULLIF(btrim(snapshot->>'version_label'),''),'1.0'),
      (snapshot->>'publication_revision')::int,(snapshot->>'theme_score')::int,
      (snapshot->>'balance_score')::int,(snapshot->>'lore_score')::int,
      COALESCE((snapshot->>'updated_at')::timestamptz,created_at)
    FROM studio_review_audit WHERE snapshot ? 'theme_score'
    ORDER BY review_id,COALESCE(NULLIF(btrim(snapshot->>'version_label'),''),'1.0'),id DESC;
    UPDATE studio_reviews SET version_label=COALESCE(NULLIF(btrim(version_label),''),'1.0');
    INSERT INTO studio_review_ratings
      SELECT id,version_label,publication_revision,theme_score,balance_score,lore_score,updated_at FROM studio_reviews
      ON CONFLICT(review_id,version_label) DO UPDATE SET
        publication_revision=EXCLUDED.publication_revision,theme_score=EXCLUDED.theme_score,
        balance_score=EXCLUDED.balance_score,lore_score=EXCLUDED.lore_score,updated_at=EXCLUDED.updated_at;
    `);
  }
};
