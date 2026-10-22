const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { SCHEMAS, SEARCH_PATH } = require("../../src/db/schemas");

const { TEST_DATABASE_URL } = require("../helpers/db");

const { migrate, MIGRATIONS } = require("../../src/db/migrate");

let pool;

test.before(() => {
  pool = new Pool(require("../helpers/schema").poolOptions);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await require("../helpers/schema").resetSchemas(pool);
});

test("версии миграций уникальны и идут по возрастанию", () => {
  const versions = MIGRATIONS.map((item) => item.version);
  assert.deepEqual(versions, [...new Set(versions)], "версии должны быть уникальны");
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b), "версии должны возрастать");
});

test("migrate на пустой базе создаёт схему", async () => {
  const applied = await migrate(pool);
  assert.ok(applied.includes(1));

  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = ANY($1) ORDER BY tablename`, [['public', ...SCHEMAS]]
  );
  const tables = rows.map((row) => row.tablename);
  for (const table of [
    "challenges",
    "feedback",
    "game_participants",
    "games",
    "notification_inbox_state",
    "notification_inbox_items",
    "schema_migrations",
    "sessions",
    "tournament_audit_events",
    "tournament_matches",
    "tournament_participants",
    "tournament_rounds",
    "tournaments",
    "users"
  ]) {
    assert.ok(tables.includes(table), `ожидалась таблица ${table}`);
  }
});

test("повторный migrate ничего не применяет", async () => {
  await migrate(pool);
  const applied = await migrate(pool);
  assert.deepEqual(applied, []);
});

test("training upgrades a released 1.4.x database without replaying service migrations", async () => {
  const client = await pool.connect();
  let user;
  try {
    await client.query("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    for (const migration of MIGRATIONS.filter(item => item.version <= 60)) {
      await migration.up(client);
      await client.query("INSERT INTO schema_migrations(version,name) VALUES($1,$2)", [migration.version, migration.name]);
    }
    // Match the shipped 1.4.x schema: 058-060 applied, no trainer or 056 entry.
    await client.query("DROP SCHEMA knowthykt CASCADE");
    await client.query("DELETE FROM schema_migrations WHERE version=56");
    user = (await client.query("INSERT INTO users(name,name_key,password_hash,rating) VALUES('Existing','existing','salt:hash',1234) RETURNING *")).rows[0];
    await client.query("INSERT INTO sessions(token,user_id,expires_at) VALUES('existing-session',$1,NOW()+INTERVAL '1 day')", [user.id]);
  } finally {
    client.release();
  }

  assert.deepEqual(await migrate(pool), [56, 61, 62]);
  assert.deepEqual((await pool.query("SELECT * FROM users WHERE id=$1", [user.id])).rows[0], user);
  assert.equal((await pool.query("SELECT user_id FROM sessions WHERE token='existing-session'")).rows[0].user_id, user.id);
  assert.equal((await pool.query("SELECT to_regclass('public.training_profiles') AS name")).rows[0].name, null);
  assert.ok((await pool.query("SELECT to_regclass('knowthykt.training_sessions') AS name")).rows[0].name);
  const stats = { question: { correct: 2 } };
  await pool.query("INSERT INTO training_profiles(user_id,stats) VALUES($1,$2)", [user.id, stats]);
  assert.deepEqual((await pool.query("SELECT stats FROM knowthykt.public_progress WHERE user_id=$1", [user.id])).rows[0].stats, stats);
  await pool.query("INSERT INTO knowthykt.notification_messages(user_id,notification_id,payload) VALUES($1,'training:upgrade',$2)", [user.id, { type: 'knowthykt_session' }]);
  await pool.query("DELETE FROM knowthykt.notification_messages WHERE user_id=$1", [user.id]);
  assert.deepEqual((await pool.query("SELECT operation FROM knowthykt.notification_outbox ORDER BY id")).rows.map(row => row.operation), ['upsert', 'delete']);
  assert.deepEqual(await migrate(pool), []);
});

test("training service migration preserves existing preview progress and queued notifications", async () => {
  await migrate(pool);
  const user = (await pool.query("INSERT INTO users(name,name_key,password_hash,rating) VALUES('Preview','preview','salt:hash',1000) RETURNING id")).rows[0];
  await pool.query("INSERT INTO training_profiles(user_id,revision,stats) VALUES($1,7,$2)", [user.id, { question: { correct: 2 } }]);
  await pool.query("INSERT INTO knowthykt.notification_messages(user_id,notification_id,payload,read_at) VALUES($1,'training:preview',$2,NOW())", [user.id, { type: 'knowthykt_session' }]);
  const progress = (await pool.query("SELECT * FROM training_profiles")).rows;
  const messages = (await pool.query("SELECT * FROM knowthykt.notification_messages")).rows;
  const outbox = (await pool.query("SELECT * FROM knowthykt.notification_outbox ORDER BY id")).rows;
  await pool.query("DELETE FROM schema_migrations WHERE version=61");

  assert.deepEqual(await migrate(pool), [61]);
  assert.deepEqual((await pool.query("SELECT * FROM training_profiles")).rows, progress);
  assert.deepEqual((await pool.query("SELECT * FROM knowthykt.notification_messages")).rows, messages);
  assert.deepEqual((await pool.query("SELECT * FROM knowthykt.notification_outbox ORDER BY id")).rows, outbox);
  await pool.query("UPDATE knowthykt.notification_messages SET payload=$1", [{ type: 'knowthykt_session', excerpt: 'Updated' }]);
  assert.equal((await pool.query("SELECT COUNT(*)::integer AS count FROM knowthykt.notification_outbox")).rows[0].count, outbox.length + 1);
});

test("venue address upgrade follows 1.2.0 without replacing Studio migration 32 or existing data", async () => {
  const client = await pool.connect();
  try {
    await client.query("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    for (const migration of MIGRATIONS.filter(item => item.version <= 54)) {
      await migration.up(client);
      await client.query("INSERT INTO schema_migrations(version,name) VALUES($1,$2)", [migration.version, migration.name]);
    }
    await client.query("INSERT INTO tournaments(slug,name,status,format,venue_mode,faction_count) VALUES('existing-irl','Existing IRL','draft','swiss','irl',3)");
  } finally {
    client.release();
  }
  assert.deepEqual(await migrate(pool), MIGRATIONS.filter(item => item.version > 54).map(item => item.version));
  const { rows: [event] } = await pool.query("SELECT name, venue_address, faction_count FROM tournaments WHERE slug='existing-irl'");
  assert.deepEqual(event, { name: "Existing IRL", venue_address: "", faction_count: 3 });
  const { rows: migrations } = await pool.query("SELECT version,name FROM schema_migrations WHERE version IN (32,55) ORDER BY version");
  assert.deepEqual(migrations, [{version:32,name:"studio_projects"}, {version:55,name:"tournament_venue_address"}]);
  assert.ok((await pool.query("SELECT to_regclass('studio_projects') AS name")).rows[0].name);
  await assert.rejects(pool.query("UPDATE tournaments SET venue_address=$1", ["x".repeat(501)]), { code: "23514" });
  await pool.query("UPDATE tournaments SET venue_address=$1", ["x".repeat(500)]);
  assert.deepEqual(await migrate(pool), []);
});

test("team Killzone help migration corrects seeded rules and preserves administrator revisions", async () => {
  await migrate(pool);
  const migration = MIGRATIONS.find(item => item.version === 51);
  const { rows: [editor] } = await pool.query(
    "INSERT INTO users(name,name_key,password_hash,rating,is_admin) VALUES('Docs Editor','docs editor','salt:hash',1000,true) RETURNING id"
  );
  await pool.query("UPDATE documentation_pages SET markdown='три разные Killzones', version=1, updated_by=NULL WHERE page_id='wtc-pairings' AND locale='ru'");
  for (const [version, author] of [[2, null], [1, editor.id]]) {
    await pool.query("UPDATE documentation_pages SET markdown='Administrator text: three different Killzones', version=$1, updated_by=$2 WHERE page_id='wtc-pairings' AND locale='en'", [version, author]);
    await migration.up(pool);
    const { rows } = await pool.query("SELECT locale, markdown, version, updated_by FROM documentation_pages WHERE page_id='wtc-pairings' ORDER BY locale");
    const ru = rows.find(row => row.locale === "ru");
    const en = rows.find(row => row.locale === "en");
    assert.match(ru.markdown, /Killzones могут повторяться/);
    assert.equal(ru.version, 2);
    assert.equal(en.markdown, "Administrator text: three different Killzones");
    assert.equal(en.version, version);
    assert.equal(en.updated_by, author);
    await migration.up(pool);
    assert.deepEqual((await pool.query("SELECT locale, markdown, version, updated_by FROM documentation_pages WHERE page_id='wtc-pairings' ORDER BY locale")).rows, rows);
  }
});

test("migrate на живой базе не ломает данные", async () => {
  await pool.query("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  for (const migration of MIGRATIONS.filter(item => item.version <= 55)) {
    await migration.up(pool);
    await pool.query("INSERT INTO schema_migrations(version,name) VALUES($1,$2)", [migration.version,migration.name]);
  }
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin)
     VALUES ('Alpha', 'alpha', 'salt:hash', 1000, true) RETURNING id`
  );
  const { rows: [tournament] } = await pool.query(
    `INSERT INTO tournaments (owner_user_id, slug, status, format, swiss_round_count)
     VALUES ($1, 'preserve-table-images', 'draft', 'swiss', 1) RETURNING id`, [user.id]
  );
  const { rows: [image] } = await pool.query(
    `INSERT INTO tournament_table_images (tournament_id, image_data, content_hash)
     VALUES ($1, 'saved-image-data', 'saved-image-hash') RETURNING *`, [tournament.id]
  );

  // Historical replayable migrations; newer migrations are ledger-driven.
  await pool.query("DELETE FROM schema_migrations WHERE version <= 35");
  const applied = await migrate(pool);
  assert.ok(applied.includes(1));

  const { rows } = await pool.query("SELECT name FROM users");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Alpha");
  const images = await pool.query("SELECT * FROM tournament_table_images");
  assert.deepEqual(images.rows, [image], "повторная миграция сохраняет изображения и их ID");
});

test("Studio review migrations preserve publications and backfill the latest rating for each version", async () => {
  const client = await pool.connect();
  const publicationId = randomUUID(), reviewId = randomUUID();
  const project = { team: { id: "existing-team", name: "Existing team", version: "2.0" } };
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    for (const migration of MIGRATIONS.filter(item => item.version <= 38)) {
      await migration.up(client);
      await client.query("INSERT INTO schema_migrations(version,name) VALUES($1,$2)", [migration.version,migration.name]);
    }
    const { rows: [owner, reviewer] } = await client.query(`INSERT INTO users(name,name_key,password_hash,rating,is_admin)
      VALUES('Owner','owner','salt:hash',1000,false),('Reviewer','reviewer','salt:hash',1000,false) RETURNING id`);
    await client.query(`INSERT INTO studio_projects(owner_id,project_id,project,revision,publication_id,published)
      VALUES($1,'published',$2,7,$3,$2),($1,'draft',$2,3,NULL,NULL)`, [owner.id,project,publicationId]);
    const reviews = MIGRATIONS.find(item => item.version === 39);
    await reviews.up(client);
    await client.query("INSERT INTO schema_migrations(version,name) VALUES($1,$2)", [reviews.version,reviews.name]);
    const migrated = (await client.query("SELECT project_id,project,published,published_revision FROM studio_projects ORDER BY project_id")).rows;
    assert.equal(migrated[0].published_revision, 0);
    assert.equal(migrated[0].published, null);
    assert.equal(migrated[1].published_revision, 1);
    assert.deepEqual(migrated[1].project, project);
    assert.deepEqual(migrated[1].published, project);
    const { rows: [review] } = await client.query(`INSERT INTO studio_reviews
      (id,publication_id,author_id,body,theme_score,balance_score,lore_score,publication_revision,version_label,request_id)
      VALUES($1,$2,$3,'Preserved review',5,5,5,2,'2.0',$4) RETURNING *`, [reviewId,publicationId,reviewer.id,randomUUID()]);
    for (const score of [3,4]) {
      await client.query(`INSERT INTO studio_review_audit(review_id,actor_id,action,snapshot) VALUES($1,$2,'update',$3)`,
        [reviewId,reviewer.id,{...review,version_label:'1.0',publication_revision:1,theme_score:score,balance_score:score,lore_score:score}]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  assert.deepEqual(await migrate(pool), MIGRATIONS.filter(item => item.version > 39).map(item => item.version));
  const ratings = (await pool.query(`SELECT version_label,theme_score,balance_score,lore_score
    FROM studio_review_ratings WHERE review_id=$1 ORDER BY version_label`, [reviewId])).rows;
  assert.deepEqual(ratings, [
    { version_label: '1.0', theme_score: 4, balance_score: 4, lore_score: 4 },
    { version_label: '2.0', theme_score: 5, balance_score: 5, lore_score: 5 }
  ]);
  assert.deepEqual(await migrate(pool), []);
});

test("migration 010 creates a canonical Game for a tournament match with a guest", async () => {
  await migrate(pool);
  const user = await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin)
     VALUES ('Alpha', 'alpha', 'salt:hash', 1000, true)
     RETURNING id`
  );
  const tournament = await pool.query(
    `INSERT INTO tournaments (owner_user_id, slug, status, format, swiss_round_count)
     VALUES ($1, 'migration-test', 'in_progress', 'swiss', 1)
     RETURNING id`,
    [user.rows[0].id]
  );
  const participants = await pool.query(
    `INSERT INTO tournament_participants
       (tournament_id, user_id, display_name, display_name_key, status, source)
     VALUES
       ($1, $2, 'Alpha', 'alpha', 'active', 'admin_manual'),
       ($1, NULL, 'Guest', 'guest', 'active', 'admin_manual')
     RETURNING id, user_id`,
    [tournament.rows[0].id, user.rows[0].id]
  );
  participants.rows.sort((a, b) => a.id - b.id);
  const round = await pool.query(
    `INSERT INTO tournament_rounds (tournament_id, round_number, status)
     VALUES ($1, 1, 'completed') RETURNING id`,
    [tournament.rows[0].id]
  );
  const guestResultKey = -participants.rows[1].id;
  const match = await pool.query(
    `INSERT INTO tournament_matches
       (tournament_id, round_id, round_number, status, is_bye,
        participant_a_id, participant_b_id, result, completed_at, winner_participant_id)
     VALUES ($1, $2, 1, 'completed', FALSE, $3, $4, $5::jsonb, NOW(), $3)
     RETURNING id`,
    [
      tournament.rows[0].id,
      round.rows[0].id,
      participants.rows[0].id,
      participants.rows[1].id,
      JSON.stringify({ winnerId: user.rows[0].id, scores: { [user.rows[0].id]: {}, [guestResultKey]: {} } })
    ]
  );

  await pool.query("DELETE FROM schema_migrations WHERE version = 10");
  const applied = await migrate(pool);
  assert.ok(applied.includes(10));

  const games = await pool.query(
    `SELECT g.id, g.player_ids, g.source_id, tm.game_id
     FROM games g
     JOIN tournament_matches tm ON tm.game_id = g.id
     WHERE tm.id = $1`,
    [match.rows[0].id]
  );
  assert.equal(games.rowCount, 1);
  assert.equal(games.rows[0].source_id, match.rows[0].id);
  assert.deepEqual(games.rows[0].player_ids, [user.rows[0].id]);

  const gameParticipants = await pool.query(
    `SELECT slot, user_id, tournament_participant_id, result_key
     FROM game_participants WHERE game_id = $1 ORDER BY slot`,
    [games.rows[0].id]
  );
  assert.equal(gameParticipants.rowCount, 2);
  assert.equal(gameParticipants.rows[0].user_id, user.rows[0].id);
  assert.equal(gameParticipants.rows[1].user_id, null);
  assert.equal(gameParticipants.rows[1].result_key, guestResultKey);
});

test("схема users содержит ожидаемые колонки", async () => {
  await migrate(pool);
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'users' ORDER BY column_name`
  );
  const columns = rows.map((row) => row.column_name);
  for (const column of [
    "avatar_data",
    "avatar_version",
    "challenge_credits",
    "created_at",
    "id",
    "is_admin",
    "name",
    "name_key",
    "password_hash",
    "rating",
    "rating_combined",
    "rating_irl",
    "rating_tts",
    "register_nickname",
    "telegram_contact",
    "updated_at"
  ]) {
    assert.ok(columns.includes(column), `ожидалась колонка users.${column}`);
  }
});

test("уникальный индекс share_token существует", async () => {
  await migrate(pool);
  const { rows } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'challenges'`
  );
  assert.ok(rows.some((row) => row.indexname === "idx_challenges_share_token"));
});
