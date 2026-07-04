# TGTV Ranking Tournament System

A local website for challenges, Approved Ops results, and Elo ratings.

## Run

```powershell
node server.js
```

After the server starts, open `http://127.0.0.1:3000`.

You can also launch `outputs/start-kill-team-elo.cmd` with a double-click. Keep the opened window running while you use the site.

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
DATABASE_URL=postgres://killteam:killteam_dev_password@localhost:5432/kill_team_elo
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
DATABASE_URL=postgres://postgres:postgres@localhost:5432/kill_team_elo
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
