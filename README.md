# TGTV Ranking Tournament System

A website for Kill Team matchmaking, Approved Ops results, ratings, statistics, and challenge tracking.

## Run

PostgreSQL is required. Without `DATABASE_URL` the server refuses to start.

```powershell
docker compose up -d
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
```

Set `DB_PORT` to something else if port 5432 is already taken on your machine,
and keep `DATABASE_URL` in sync with it.

For managed PostgreSQL services that require SSL, set `PGSSL=true`.
In production, set `NODE_ENV=production` so the session cookie carries the
`Secure` flag, or set `COOKIE_SECURE=true` explicitly.

The schema is created and upgraded automatically by versioned migrations on
startup. Applied versions are recorded in the `schema_migrations` table.

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
