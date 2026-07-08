# TGTV Ranking Tournament System

A website for Kill Team matchmaking, Approved Ops results, ratings, statistics, and challenge tracking.

## Run

```powershell
npm start
```

After the server starts, open `http://127.0.0.1:3000`.

The server uses port `3000` by default. For a staging replica, set another port in `.env`:

```env
PORT=3001
```

## PostgreSQL

The app uses PostgreSQL when `DATABASE_URL` is set. Without `DATABASE_URL`, it falls back to `data/db.json`.

### Local PostgreSQL with Docker

Install Docker Desktop, then run:

```powershell
docker compose up -d
node server.js
```

The local connection string is already written to `.env`:

```env
DATABASE_URL=postgres://tgtv:tgtv_dev_password@localhost:5432/tgtv_tournament
```

Stop the database:

```powershell
docker compose down
```

Delete the local database data:

```powershell
docker compose down -v
```

Create a `.env` file in the project root:

```env
DATABASE_URL=postgres://tgtv:tgtv_dev_password@localhost:5432/tgtv_tournament
```

For managed PostgreSQL services that require SSL:

```env
DATABASE_URL=postgres://user:password@host:5432/database
PGSSL=true
```

On startup, the server creates the required tables automatically. If PostgreSQL is empty and `data/db.json` exists, existing JSON data is imported once.

## Features

- registration and sign-in with name and password;
- the first registered user automatically becomes an administrator;
- live player search and challenge sending;
- accepting a challenge creates a game;
- Approved Ops result entry: `Crit Op`, `Kill Op`, `Tac Op`, `Primary Op`;
- automatic total and Elo calculation with `K=32`;
- leaderboard;
- admin panel: view users, delete users, edit ratings, assign administrators.

Data is stored in `data/db.json`.
