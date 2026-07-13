# Changelog

## Unreleased

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
