# Team individual standings implementation plan

> **For agentic workers:** use Superpowers execution and independent code review. Tests run only in CI by user instruction.

**Goal:** Show sortable solo-style individual standings within team tournament Standings.

**Architecture:** A pure domain calculator consumes complete roster history and canonical team match/game snapshots. Existing team payload exposes individualStandings; the desktop uses a nested tab and its existing table enhancement.

**Tech Stack:** Node.js, PostgreSQL, vanilla JavaScript, node:test, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-11-15-team-individual-standings-design.md

## Global Constraints

- No local automated tests; exact-head CI only.
- Preserve official team places, finalResults, pairing and Elo.
- Keep existing viewer faction/contact/history privacy.
- Personal TP is always 3/1/0, including Doubles.
- No database migration or production deployment.

## Review Focus

- A substituted player's historical scores and bye stay with that recorded person.
- Guest/proxy numeric keys cannot merge distinct people or account holders.
- A confirmed personal game counts while its team match is still active.
- Public viewers receive the same standings without additional hidden faction/contact exposure.
- Nested tab/sort state survives navigation and refresh; all numeric columns sort numerically.

### Task 1: Domain calculation and API payload

Files: new src/domain/team-individual-standings.js; src/api/team-tournaments.js; new test/unit/team-individual-standings.test.js and focused integration coverage.

Interface: buildTeamIndividualStandings(rosters, matches) returns an array of { key, rank, userId, name, isProxy, rosterIds, rosterNames, gamesPlayed, byes, wins, draws, losses, matchPoints, totalGp, gpDiff }. Existing tournament payload adds individualStandings. Roster members include joinedAt/endedAt history; game participants use saved identities. API keeps current rosters/history redaction unchanged.

- [ ] Write behavioral domain and API regressions.
- [ ] Implement the calculator with 3/1/0, recorded scores converted to GP/Diff GP, historical identities, byes and stable shared ranks.
- [ ] Load full roster history for computation while returning the current viewer-redacted payload.
- [ ] Check syntax and inspect the diff; execute tests only in CI.

### Task 2: Nested standings tab and sorting

Files: public/app.js, public/i18n/{ru,en}.js, public/styles.css as needed; new client standings regressions.

Consumes: data.individualStandings rows from Task 1. Produces: teamTournamentStandingsContent(data), personal table and nested tab wiring. Keep existing teamStandingsTable intact for existing callers/tests. Add independent per-tournament nested tab state and enhancer view key.

- [ ] Write client rendering/state/sorting regressions.
- [ ] Add Team standings/Personal standings nested tabs and the personal table (#, player, roster, games, TP, Total GP, Diff GP, W-D-L).
- [ ] Wire state preservation and every-column sorting through TGTVTournamentTables.
- [ ] Add RU/EN text and empty-state explanation of the scoring rules.
- [ ] Check syntax; no local automated tests.

### Task 3: Integration, review and CI

- [ ] Review both tasks together, fix material findings and pin them with regressions.
- [ ] Update matching static/SEO application cache versions and synchronize shared assets.
- [ ] Commit and push the authorized PR 19 branch.
- [ ] Check exact-head GitHub CI, inspect failure logs and fix until checks pass.
- [ ] Report the tab, calculation rules, PR and validation.
