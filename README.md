# TGTV Ranking Tournament System

A website for Kill Team matchmaking, Approved Ops results, ratings, statistics, and challenge tracking.

## Run

PostgreSQL is required. Without `DATABASE_URL` the server refuses to start.

```powershell
docker compose up -d
npm install
npm start
```

After the server starts, open `http://127.0.0.1:3000`.

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```env
DB_PASSWORD=your_password
DB_PORT=5432
DATABASE_URL=postgres://tgtv:your_password@localhost:5432/tgtv_tournament
PORT=3000
SITE_URL=https://rating.ktcompanion.ru
```

Set `DB_PORT` to something else if port 5432 is already taken on your machine,
and keep `DATABASE_URL` in sync with it.

For managed PostgreSQL services that require SSL, set `PGSSL=true`.

`SITE_URL` is optional locally, but production should set it to the public
HTTPS origin so canonical URLs, `robots.txt`, and `sitemap.xml` are stable.

The schema is created and upgraded automatically by versioned migrations on
startup. Applied versions are recorded in the `schema_migrations` table.

### Production rollout for canonical tournament Games

Migration `010_canonical_tournament_games` is an expand/backfill migration. It
creates `game_participants`, creates a real `games` row for every playable
tournament match (including guest participants), repairs interrupted links, and
keeps the existing tournament result columns for a compatibility window. It
does not delete production data or remove old columns.

Before deploying, take a PostgreSQL backup and verify that it can be restored.
Drain traffic and stop every old application instance before starting the new
release: an old instance could otherwise create a tournament match after the
one-time backfill. Startup migrations are serialized across new app instances
with a PostgreSQL advisory lock. Start one new instance, then run:

```powershell
npm run verify:migration:canonical-games
```

All checks must report `OK` before traffic is restored and the remaining new
instances are started. Legacy tournament result routes and duplicated match
columns intentionally stay available in this release, so a normal application
rollback does not require a down migration. Restore the pre-deploy backup only
if the integrity checks report damaged data; keep all writers stopped while
doing so.

## Deploying to production

**`NODE_ENV=production` must be set on the running process.** `src/config.js`
defaults `COOKIE_SECURE` to `NODE_ENV === "production"`, and the `Secure`
flag on the session cookie is what stops it (and the admin password reset,
which returns a plaintext temporary password over that same cookie's
channel) from ever being sent over plain HTTP.

`update_tgtv-ts.sh` sets `NODE_ENV=production` itself when it starts the app
under pm2, so a deploy through that script gets this for free -- but if you
start the app any other way (a different process manager, a container image,
a manual `pm2 start`), you must set it yourself, e.g.:

```bash
NODE_ENV=production pm2 start server.js --name tgtv-app
```

If your setup can't rely on `NODE_ENV` (for example the app runs behind a
proxy that already terminates TLS but `NODE_ENV` isn't propagated), set
`COOKIE_SECURE=true` explicitly in `.env` instead -- it always overrides the
`NODE_ENV`-based default. Only run without either setting on a deployment
that is genuinely not served over HTTPS.

`update_tgtv-ts.sh` also expects an env file to already exist outside the
repo at the path it names (`ENV_FILE`, `/app/tgtv-ts.env` by default) and
copies it into place on every deploy -- create it once from `.env.example`
and update it there, not in the repo checkout.

## Tests

Tests need a separate database:

```powershell
docker compose exec postgres createdb -U tgtv tgtv_tournament_test
npm test
```

`npm run test:unit` runs the tests that need no database.

## Migrating from JSON storage

Earlier versions fell back to `data/db.json`. That fallback is gone. To move
existing JSON data into PostgreSQL, run once:

```powershell
node scripts/import-json-db.js
```

## Features

- registration and sign-in with name and password;
- the first registered user automatically becomes an administrator;
- live player search and challenge sending;
- accepting a challenge creates a game;
- Approved Ops result entry: `Crit Op`, `Kill Op`, `Tac Op`, `Primary Op`;
- automatic total and Elo calculation with `K=32`;
- leaderboard;
- admin panel: view users, delete users, edit ratings, assign administrators.
