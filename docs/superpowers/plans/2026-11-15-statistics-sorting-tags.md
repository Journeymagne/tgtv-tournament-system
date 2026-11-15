# Explicit statistics sorting tags

> Execute inline with Superpowers executing-plans; one independent review before merge. Automated tests run only in GitHub Actions.

**Goal:** Sorting is opt-in through `data-statistics-table`, following the user's approved inventory.

**Spec:** Keep sorting for the global Games list; global Kill Team/Tac Op statistics; faction cards and faction detail players, matchups and game history; event statistics and solo/team/personal standings; public player/team leaderboards; tierlist statistics; Mini App standings. Remove it from individual results/reviews, captain pairings, round fixtures, team-game slots, active/recent game navigation, short profile histories, roster match/history lists, administrative team management and Mini App operational/history lists.

**Architecture:** Tag each allowed table or logical statistics-list container explicitly. Table enhancement and every delegated sorting handler reject missing, empty or mismatched tags. Unapproved views ignore old sort state and retain natural player, pairing, slot and chronological order. Official ranks and GP calculations remain unchanged; server ordering still precedes pagination/top-N for allowed views.

**Constraints:** CI-only tests, preserve user files and existing worktrees. User authorized merge and production deployment after green CI. Release includes matching RU/EN source and DB-backed changelog notes, followed by both-domain checks.

- [ ] Write regressions for absent/mismatched tags, original player/pairing/slot order with old saved state, allowed surfaces and excluded views.
- [ ] Implement explicit tags and guards across desktop, Mini App and tierlist; remove unwanted controls and stale-state influence.
- [ ] Prepare next release metadata and additive bilingual notes; check syntax/assets, inspect diff and request independent review.
- [ ] Push branch/PR, resolve CI failures, merge exact tested tree, deploy and verify both domains/changelog and Telegram worker.
