# KT Companion / TGTV Ranking Tournament System

The site opens on the Companion home page with four sections: initiative
calculator, activation tracker, tournament system and KT Studio. The calculators,
Studio editor and published team library are public. Saving or publishing a team
requires the same account and session as the tournament system. Existing
public tournament pages remain available. See [Companion integration](docs/companion-integration.md)
for routes, imported sources, account-owned drafts and deployment settings.
The home page is a service selector. Each service opens on its own page under
the same hostname: `/tournament`, `/initiative`, `/tracker` and `/studio`,
with a shared account. The header logo opens the service selector; the service
name opens its start page (Studio library or tournament My Games).
Sun and moon buttons select a shared light or dark theme.

A website for Kill Team matchmaking, Approved Ops results, ratings, statistics, and challenge tracking.

## Release 4.7.2

Studio portrait framing supports vertical shifts beyond the top of the card and
zooming out to 10%. The preview shows the actual card header; saved projects,
PDF and TTS retain the framing. Player names in game cards and result forms
link to their profiles. No new database migrations are required.

## Release 4.7.1

Individual tournament settings now export statistics to Excel, including
published places, configured tiebreakers and per-round scores. The Challenge
column has unchecked boxes for manual marking in the downloaded file.
Export is available to administrators after completion too. No new migrations
are required. See [Excel export](#excel-export) for details.

## Release 4.6.1

Published team cards are larger in Studio. Operatives appear one per row with
vertical scrolling, and portrait cards have more room for readable text.
The viewer fits desktop and mobile screens. No new migrations are required.

## Release 4.6

The Equipment editor no longer shows the Restrictions controls. Existing saved
equipment data is preserved. Package and client asset versions are updated to 4.6;
the tournament ID safeguards from 4.5 are retained, with no new migrations.

## Release 4.5

The tournament profile, MMR and navigation now share the portal header. Winner
banners work in both themes, and tournament outcomes use explicit participant
identities to prevent user/participant ID collisions. Studio adds full formatting
to operative keywords, fixes selection-list spacing and removes the inner white
border from ploy title bands while preserving their background.

Migration **035** adds tournament identity guards after the winner repair in 034.
Tournament winners are read only from `winnerParticipantId`; database checks reject
out-of-match/cross-tournament identities and incorrect game-to-participant mappings.
Public ID namespaces are additive; existing numeric URLs and API fields remain.
See [ID contract, compatibility and upgrade limits](docs/id-namespaces.md).
Administrators can now use **Recalculate standings** in an individual tournament
to rebuild results, points, tiebreakers and places. Replacing published places and
podium awards requires confirmation. See [standings recalculation](docs/standings-recalculation.md).

Release 4.5 applies migration **034** automatically on startup. It repairs
individual tournament winners and match points when a user's ID was mistaken
for the opposing tournament participant's ID. Published result statistics and
opponents' tiebreakers are recalculated; canonical games, Elo, manually published
places and awards stay intact. Each repair records its before/after values in
the tournament audit log. Organizers should review published places for affected
events and downstream pairings for affected elimination brackets.

## Previous Companion releases

All services share light/dark themes, RU/EN language controls and consistent
navigation. Studio adds team logos, saved weapon profiles, richer rule editing,
base sizes on operative cards and smaller uploaded images. Published teams
include author links and PDF, TTS and ROSZ exports; portrait cropping is isolated
per card in the library. Existing projects retain their content when opened.

Studio uses PostgreSQL as the primary store for signed-in accounts. Edits save
after an 800 ms pause, and opening Studio loads the saved account draft. Browser
storage is an optional recovery cache; a full browser store does not block saves.
Concurrent edits are preserved as a separate private database draft without
overwriting the original team or its publication. No new migrations are needed.

All services use paths on `ktcompanion.ru`. One host-only session cookie
works across all sections; new DNS records and subdomain certificates are not
needed. Existing calculator HTML links and tournament hash links redirect to the
new addresses.

Studio team selection lives in **My drafts**. **Create team** offers an empty
team or a separate copy of a template. Login and registration open in a dialog
over Studio and share the tournament account; guest edits and the requested
action resume after login. Owners can delete their teams with
confirmation; deletion also removes the publication. Migration 033 runs on
startup and records deleted project identities without retaining their content,
so delayed saves cannot recreate them. See the integration guide for rollback
requirements after deletion has been used.

The result-confirmation rules from 4.0.1 are retained:

In team TTS games, results reported by a player can only be confirmed or rejected
by their actual opponent. An opposing captain can review that result only when
playing as the opponent. Captain-reported results still require the opposing
captain; player-reported IRL results are saved immediately. Administrative result
controls remain available. This patch adds no database migrations.

Companion services use a shared tournament account.
Studio supports guest editing and account-owned drafts/publications. Migration
032 adds only Studio storage; all tournament features from 3.1.4 are retained.
Configure `COMPANION_ORIGIN` and the root hostname's proxy as described below.

### Previous tournament releases

See [CHANGELOG.md](CHANGELOG.md) for the release history and upgrade notes.
**Edit round tables** changes a generated team round's killzones, table numbers,
layouts and images while preserving pairings, captain choices, games and results.
The separate **Undo round** action requires confirmation and restores the latest
round's pairs and tables as an editable, resumable draft. Submitted results block
Undo; captain choices restart after regeneration.

Team pairing screens now include a live event log of captain choices, dice rolls,
mission bans, table assignments, game creation, result actions and undo/reset.
Entries identify the actor and selected player/Kill Team, preserve history across
undo, and keep unrevealed choices private. This patch adds no database migrations.

The Google Search Console ownership verification file added in 3.1.1 remains at
`/googlef86243166b01dc47.html`. After deployment, complete verification in Search
Console and inspect the Security Issues report. Keep the file deployed to retain
verification.

Version 3.1.0 added reserved rosters, tournament live updates, lighter tournament
payloads and images, round editing for all site administrators, and native browser
navigation. Games against opponents without accounts now use normal Elo against
1000 MMR. Administrators can recalculate individual rating history from a completed
game without changing its result.

Migrations 030 and 031 apply on startup. They add roster reservations and update
untouched rating documentation; they do not import local demo data or reset ratings.
After upgrading, use **Recalculate rating** on a completed ranked game to repair
historical guest-game awards and dependent later ratings. A regular rating replay
also uses the corrected rule. Existing achievements and awards remain intact.
See [tournament workflow and live-update notes](docs/tournament-live-updates.md).

## Run

PostgreSQL is required. Without `DATABASE_URL` the server refuses to start.

```powershell
docker compose up -d
npm install
npm start
```

Open `http://127.0.0.1:3000`. All services use paths under this address.
Leave `COMPANION_ORIGIN` empty locally, or set it to the same origin and port.

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```env
DB_PASSWORD=your_password
DB_PORT=5432
DATABASE_URL=postgres://tgtv:your_password@localhost:5432/tgtv_tournament
PORT=3000
COMPANION_ORIGIN=https://ktcompanion.ru
SITE_URL=https://ktcompanion.ru
```

Set `DB_PORT` to something else if port 5432 is already taken on your machine,
and keep `DATABASE_URL` in sync with it.

For managed PostgreSQL services that require SSL, set `PGSSL=true`.

`SITE_URL` is optional locally, but production should set it to the public
HTTPS origin so canonical URLs, `robots.txt`, and `sitemap.xml` are stable.
Point the existing root hostname's Nginx proxy at the Node application; see
[the Nginx example](deploy/nginx-companion.conf.example). A Git update alone
does not replace an old static site served by that hostname.

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

`public/live-refresh.js` loads before `public/app.js` in both HTML shells. It
provides polling, interaction guards, and updates that retain unchanged DOM
nodes. The following bundles are fetched on demand and must also be deployed:

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

### Live updates

Only the visible live screen polls. During a tournament, Matches refreshes
every 5 seconds, Standings every 15 seconds, and Statistics every 45 seconds,
for both individual and team events, including gaps before/between rounds.
The same intervals apply to the administrator's corresponding tournament tabs.
Standalone WTC pairings refresh every 5 seconds during choices and every 10
seconds while games are running. Completed/cancelled events stop polling.
My Games and administrator active games refresh every 15 seconds; an open game
or a game awaiting confirmation refreshes every 10 seconds. Other screens and
tournament editing tabs do not poll. Notifications retain their 30-second cycle.

Polling pauses in hidden tabs and checks immediately on return. Unchanged data
does not redraw the view. Text selection, focused fields, open combo menus and
dialogs defer applying updates; the newest response is applied after interaction
ends. Result-entry forms never get replaced by polling. Pairing drafts, search
input, unchanged DOM nodes, and an explicitly selected round are retained.
Navigation and writes invalidate old responses so they cannot restore stale data.

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
4 MiB. Tournament creation and editing accept up to 5 MiB; Studio draft uploads
accept 100 MiB for image albums. Other application routes retain a 2 MiB limit.
See [Companion integration](docs/companion-integration.md) for the Studio proxy allowance.

In the Nginx `server` block serving `ktcompanion.ru` over
HTTPS, set the following (remove or update any smaller override in its
API `location` block):

```nginx
client_max_body_size 100m;
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

## Excel export

Individual tournament **Settings** include **Export statistics to Excel** (also
available after completion). The `.xlsx` contains published places, or current
standings before publication, factions, TP, configured tiebreakers and one group
of score columns per generated round. `Prim` is the primary-op bonus; pending
results stay blank and byes carry 3 TP. Published manual placement is retained.
The **Challenge** column contains unchecked in-cell Excel checkboxes for manual
marking in the downloaded file. These marks are not saved to the site. Viewers
without support for Excel's in-cell checkboxes show editable FALSE/TRUE values.

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

## Achievements

The **Achievements** page has **Achievements** and **Hall Of Fame** tabs. The
first shows the latest additions first; Hall Of Fame contains winner titles
sorted by tournament edition (descending, including Roman numerals), then by
date added. Administrators choose the category and personal/team type on creation.
Administrators
can create an achievement with a name, description and either one emoji or a
PNG/JPEG/WebP image (up to 1 MiB), open its page, and award it to a registered player or team.
The creation dialog defaults to Emoji, supports paste and previews the selected
symbol. On Windows, Win + . opens the system emoji panel.
Player selection supports nickname search. Each recipient can receive a given
achievement once; the detail page lists recipients. Awards appear in player
profiles (including your own) and in the main tab of team profiles. Team awards
can include an optional selection of current or former team members; the names
are saved as a snapshot on the award and shown on its detail page.
Administrators can delete achievements from the detail page after confirmation.
Deletion hides the catalog entry and all profile awards while preserving the
stored history and preventing automatic medals from being recreated on re-publication.

Publishing an event's final standings completes the event and automatically
creates its first-, second- and third-place medals (🥇, 🥈, 🥉). Individual events
award player accounts; team events award the roster's parent team. A guest
without an account retains their placing but receives no profile award; their
medal is not reassigned to the next player. Event medals cannot be manually
awarded. Repeated team standings publication reconciles recipients without
duplicates. Existing completed events are not retroactively awarded on upgrade.

Migration `023_achievements` adds the catalog and award tables. Include both in
database backups. Images are served separately from catalog JSON.

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
