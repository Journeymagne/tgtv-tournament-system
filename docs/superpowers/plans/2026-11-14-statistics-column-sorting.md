# Statistics column sorting implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use Superpowers task execution and a fresh code review. Steps use checkbox tracking.

**Goal:** Correct statistics and make all listed comparative surfaces sortable without changing official places.

**Architecture:** Extend existing tournament table enhancement for loaded tables. Add allowlisted SQL ordering before pagination and sorting full candidate lists before top-N. Keep independent view state and explicit raw sort values.

**Tech Stack:** Node.js 22+, vanilla JavaScript, PostgreSQL, node:test, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-11-14-statistics-column-sorting-design.md

## Global Constraints

- Automated tests run only in CI; no local test commands.
- Official rank, published placement and pairing order are unchanged by view sorting.
- Sort complete filtered data before pagination or top-N.
- No production deployment, production authentication or database changes.
- Retain user files and existing worktrees.

## Review Focus

- A row outside the first page/top-N must become visible when its sort column leads.
- Guest/proxy identities with the same numeric result key must remain separate.
- Played faction must override registration faction, with legacy fallback.
- Missing values stay last in both directions; numeric values are compared numerically.
- Live updates and navigation retain independent sort choices without renumbering rank.

## Task 1: Backend ordering and eligible summaries

**Files:** src/db/repositories/users.js, player-teams.js, games.js; src/api/users.js, player-teams.js, games.js, kill-team-statistics.js; src/domain/kill-team-statistics.js; new focused server sort utility if needed; backend unit/integration tests.

**Interfaces:** GET /api/users supports sort=rank|name|rating and direction=asc|desc. GET /api/leaderboards/teams and /api/admin/teams supports sort=rank|name|leaderName|memberCount|rating|ratingTts|ratingIrl. GET /api/games?page supports sort=date|player|opponent|faction|score|vpDiff|elo and direction. Default order remains unchanged; unknown keys/directions safely fall back. Team leaderboard returns stable official rank independently from display order. GET /api/statistics/kill-team accepts playerSort/playerDirection and tacOpSort/tacOpDirection, validates keys and sorts all candidates before top 3; defaults preserve existing ranking. Mirror counts remain exposed but performance excludes mirrors, matching desktop. Published eligibility is consistent.

- [x] Write regression tests for cross-page/top-N ordering, stable rank, invalid keys, mirror eligibility.
- [x] Implement allowlisted SQL order before paging; preserve stable tie breakers and search.
- [x] Implement full candidate aggregation and sort-before-top-N/cache query correctness.
- [ ] Review changes; tests execute in final branch CI.

## Task 2: Desktop correctness and complete sorting coverage

**Files:** public/app.js, public/admin.js, public/tournament-tables.js, public/styles.css, public/i18n/en.js, public/i18n/ru.js, public/index.html; desktop unit tests.

**Interfaces:** Existing server contracts from Task 1; tournament table enhancement retains existing API and gains raw values if needed. Each data surface gets its own sort state. Static metric summaries are not sortable rows.

- [x] Write regressions for faction attribution, proxy identity, nulls, table state, nontruncated player rankings and immutable places.
- [x] Fix aggregation and mirror consistency without changing official rankings.
- [x] Add all-column sorting to global detail/leaderboard/admin tables; send server sorting parameters and reset page on sort changes.
- [x] Add equivalent order controls to faction cards, game histories, profile histories and tournament match/card lists.
- [x] Preserve state through navigation/live updates; include keyboard/aria direction indicators, reset and translations.
- [ ] Review changes; tests execute in final branch CI.

## Task 3: Mini App and tierlist

**Files:** public/miniapp/app.js, index.html, styles/i18n as needed; public/tierlist/tierlist.js, index.html, tierlist.css; focused tests.

**Interfaces:** Use existing standings fields and immutable rank. Tierlist requests Task 1 sorting parameters independently for players/Tac Ops; cache keys include sort state and renders metadata/direction controls.

- [ ] Write behavior tests for every Mini App column, rank stability and top-N selection.
- [x] Implement sortable standings and operation scores; equivalent controls for repeated match lists.
- [x] Implement sortable tierlist player/Tac Op columns, retaining full-candidate server selection before top 3.
- [x] Include accessible labels, localization and reset behavior.
- [ ] Review changes; tests execute in final branch CI.

## Task 4: Independent review and exact-commit CI

- [ ] Inspect the complete branch against every surface and review focus.
- [ ] Resolve material review findings and add reproducing tests.
- [ ] Commit, push feature branch and create a reviewable PR to main; no merge or deploy.
- [ ] Run GitHub Actions for the exact head commit and inspect failures until required jobs pass.
- [ ] Report final SHA, PR, checks and any material limitations.
