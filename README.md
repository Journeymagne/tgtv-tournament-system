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

## Stored files are served as files, not JSON

Avatars, and an uploaded tournament rules PDF, are kept in PostgreSQL as base64
`data:` URLs but are **not** sent inside API responses. They are served by
`GET /api/users/:id/avatar` and `GET /api/tournaments/:slug/rules`, and the URL
in the JSON carries a `?v=` fingerprint of the stored bytes. A request that
includes that marker is answered with `Cache-Control: public, max-age=604800,
immutable`; the bare URL stays revalidatable through its `ETag`.

A proxy in front of the app must therefore not strip `ETag` or rewrite
`Cache-Control` on `/api/`, or every avatar will be refetched on every page.

JSON responses are compressed by the app itself (brotli, falling back to gzip)
and carry `Content-Encoding` and `Vary: Accept-Encoding`. Nginx passes an
already-encoded upstream response through untouched, so no extra configuration
is needed -- but do not enable a module that re-compresses proxied responses.

## Client bundles loaded on demand

`public/app.js` is the only script `index.html` loads. Three more are fetched at
runtime and must be deployed alongside it:

- `admin.js` -- the administration UI, requested once `/api/me` reports
  `isAdmin`. It is roughly a fifth of the client and nobody else downloads it.
- `documentation.js` and `documentation.css` -- fetched when a reader opens
  Documentation.
- `i18n/en.js` / `i18n/ru.js` -- only the visitor's locale is loaded; the other
  arrives if they use the language toggle.

All of them are cache-busted by the `?v=` marker in `public/index.html`, which
`src/http/seo.js` mirrors in `ASSET_VERSION` for the server-rendered tournament
pages. **Bump both together** when releasing changed assets; a unit test fails
if they drift.

User pickers use the shared live nickname search, with the same case-insensitive
substring matching as User administration. For new player selects, add
`data-user-search` and call `wireComboFields(container)` after rendering. The
native select keeps its name and submitted ID; after changing its value or
options in code, call `syncUserSelect(select, true)`. Use `data-user-name` on
options whose displayed labels also include a faction. ID-based combo fields
can use `userComboItems(users)` with the `users` options key.

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

## Tournament rules uploads behind Nginx

Tournament rules PDFs can be up to 2 MiB and logos up to 1 MiB. The browser
encodes attachments as Base64 inside JSON, so a combined upload can exceed
4 MiB. Tournament creation and editing accept up to 5 MiB; other application
routes retain a 2 MiB limit.

In the existing Nginx `server` block serving `rating.ktcompanion.ru` over
HTTPS, set the following (remove or update any smaller override in its
API `location` block):

```nginx
client_max_body_size 5m;
```

Validate the configuration and reload Nginx:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

This is a host configuration change: deploying the app with
`update_tgtv-ts.sh` does not apply it. An HTML `413 Request Entity Too Large`
response from Nginx means the request was rejected before reaching Node.
After deployment, verify saving and reopening a tournament with a PDF near
the 2 MiB file limit, through the public HTTPS site.

## Editing documentation

Sign in as an administrator, open **Documentation**, choose a page and click
**Edit**. The editor supports Markdown headings, lists, links, tables and fenced
code/formulas, with a live preview. Russian and English are edited separately.
**Save** publishes the selected language immediately. **Open .md** imports text
into the draft; **Download .md** exports the current text. Drafts are kept in the
current browser tab across reloads. A conflicting edit in another tab cannot
silently overwrite a saved revision.

Migration `018_documentation` seeds all ten existing translations from
`docs/documentation/{ru,en}/*.md` and `docs/documentation/pages.json`. Thereafter,
published content lives in PostgreSQL's `documentation_pages` table; deploying
new source files or rerunning the seed does not overwrite administrator edits.
To publish changes to a local Markdown file, import it in the editor and save.
Include this table in regular database backups. Raw HTML is displayed as text;
preview and public pages use the same Markdown renderer.

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
- team leaderboard with TTS, IRL, and combined ratings (TTS + IRL - 1000);
- team leaders and administrators can permanently delete teams without tournament matches from the team profile, including archived teams. Scheduled matches and active tournament rosters block deletion. Deletion removes the team's rosters, memberships, and invitations, while preserving player accounts and personal games;
- Teams Administration: search all teams, edit names, descriptions and logos,
  remove members, transfer leadership, archive and restore teams;
- admin panel: view users, delete users, edit ratings, assign administrators.
