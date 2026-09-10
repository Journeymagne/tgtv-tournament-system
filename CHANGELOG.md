# Changelog

## 2.3.2 — 2026-09-10

- Added permanent team deletion for leaders and administrators when the team has no tournament matches. Scheduled matches and active tournament rosters block deletion; player accounts and personal games are preserved.
- Split team profiles into Team, Management, and History tabs. Management is available to leaders and administrators; switching tabs preserves unsaved form values.
- Added shared live nickname search to player selection in team invitations, leadership transfers, rosters, captains, pairings, and result forms, using the same case-insensitive matching as User administration.
- Preserve player IDs, roster eligibility, and pairing drafts when using search; support keyboard selection and distinguish players with identical nicknames.
- Show invitation success or failure next to the send button, include the recipient's nickname on success, and prevent duplicate submissions while sending.
- Increased vertical spacing between management forms, current and former members, and the team description and statistics.
- Added Russian and English labels and messages for the new team controls, with keyboard navigation and accessible tab and search states.

## 2.3 — 2026-09-08

- Added tournament logos and editable roster names, with defaults based on the team name and roster number.
- Hide player factions until registration closes, while preserving access for administrators and the people managing their own entries.
- Show the current team name in tournament history after a team is renamed.
- Administrators can remove rosters after tournament start without erasing played results or ratings. Unfinished matches become forfeits, withdrawn rosters do not enter later rounds, odd fields receive byes, and published places are updated after removals.
- Improved PDF rules uploads and errors; tournament editing accepts combined PDF and logo payloads up to 5 MiB.
- Serve avatars and PDF rules as cacheable files, compress responses, load administration and documentation assets on demand, and use WebP logos to reduce downloads.
- Team tournament rosters can be deleted outright before the start, releasing the roster name and its players so a team that withdrew can register again.
- Every button that deletes or removes something now opens an in-app confirmation dialog; permanent deletions are labelled irreversible and open with Cancel focused.
- Fixed the server-rendered tournament pages serving a stale asset version: `src/http/seo.js` kept its own copy of the marker and had drifted behind `public/index.html`.
- Fixed migration `020_team_roster_withdrawal` failing when the suite replays every migration against a live database.
- Sessions now slide: an authenticated request extends `expires_at` back out to the full session lifetime and re-issues the cookie, so an active user is no longer signed out on a fixed date fourteen days after signing in. The extension is skipped while a session is less than a day old, keeping it to one write per session per day.
- Renamed the Matchmaking navigation tab to My Games, along with the team pairing screen's link back to it.
- Tournament and team descriptions now keep their line breaks: they are stored as Markdown instead of being collapsed onto a single line, and the tournament and team edit forms use a Markdown editor with a formatting toolbar and a live preview.
- Added a Russian localization of the client interface, with a language toggle beside the theme toggle that remembers the visitor's choice and defaults to the browser language, plus a protected-terminology glossary with automated checks so Kill Team rules terms are never translated.
- Updated Dragon Masters logo to a transparent 256x256 asset and placed Dragon Masters last in challenge tracks.
- Added Dragon Masters as a selectable Kill Team, challenge team, and stats team with logo.
- Added admin tools to view active games, force-confirm submitted results, and delete active/pending games.
- Added admin password reset from player profiles with a generated temporary password.
- Rebuilt the backend into focused modules: HTTP layer, domain rules, and SQL repositories.
- Replaced whole-database read-modify-write with transactional per-row SQL, fixing lost updates when two players acted at the same time.
- Moved to versioned database migrations recorded in `schema_migrations`.
- Removed the JSON storage fallback; PostgreSQL is now required. Use `scripts/import-json-db.js` to migrate existing JSON data.
- Unified Kill Team names into one canonical registry and migrated stored results and challenge credits.
- Stopped returning Telegram contacts and register nicknames to anonymous callers on the leaderboard.
- Added security headers, the `Secure` cookie flag in production, and rate limiting on sign-in and registration.
- Player search now returns an empty list instead of a 404 when nothing matches.
- Administrators can no longer record a result for a cancelled game.
- Added unit and integration test suites; run them with `npm test`.

## v0.65

- Added share links for pending challenges so recipients can accept from a direct link.
- Removed the Role column from the leaderboard.

## v0.6-battlesuits-hotfix

- Accept XV26 Stealth Battlesuits and Stealth Suits variants when saving Approved Ops results.
- Return a 404 response with an English message when player search has no matches.

## v0.6

- Added game history filters by player text search with suggestions and Kill Team.
- Added statistics filters and sortable Kill Team winrate tables.

## v0.51

- Added configurable server port through `PORT` with a default of `3000`.
- Documented staging port setup in README and `.env.example`.

## v0.5

- Added Tomb World to Killzone options.
- Added Stats season selection for Kill Team Winrates and Teams.
- Added the 2026 Q2 Dataslate season.
- Added Classified and Non-Classified labels to Kill Team profile pages.
- Reduced challenge progress payloads and removed blocking loads before page navigation.
- Optimized static image assets and enabled browser caching for non-HTML files.
- Removed serverless deployment-specific function/configuration code.
- Added password visibility toggles and password confirmation for registration/setup.
- Added Classified and All Kill Team tabs to All Kill Team Challenge.
- Added Spectre Squad to both challenge tracks and kept it last.
- Made Navy Breachers and XV26 Stealth Suits wildcards in both challenge tracks.
- Allowed administrators to manually credit any Kill Team in a challenge track.

## v0.2

- Added player profiles with avatars, contacts, recent matches, win rate, and challenge progress.
- Added matchmaking improvements: profile challenges, one active matchup per pair, active game links, and pending game cleanup.
- Added Approved Ops result workflow with Kill Team, Tac Op, Crit Op, Killzone, layout, tie-breakers, confirmation, and admin result editing.
- Added All Kill Team Challenge progress with team logos, wildcards, and admin credit/subtract tools.
- Added Stats pages for Kill Team winrates, Tac Ops winrates, and team detail pages.
- Added feedback form with admin inbox, resolve/reopen, and delete actions.
- Improved mobile navigation with an off-canvas sidebar.
- Added Postgres support with local JSON fallback.
