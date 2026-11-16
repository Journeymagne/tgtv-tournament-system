# Faction ranking qualification implementation plan

**Goal:** Require 10 all-time faction games for an official place, retaining visible provisional Wilson scores below that threshold.

**Spec:** `docs/superpowers/specs/2026-11-16-faction-ranking-qualification.md`.

**Constraints:** no local automated test execution; preserve all-time eligible-game scope and award thresholds; use normal local administrator autologin for preview; publish matching RU/EN changelog on release.

- [x] Add regression cases for 9/10 games, promotion/demotion, rank continuity, filtering before top-five and explicit sorts, and visible unranked provisional scores.
- [x] Add shared `FACTION_RANKING_MIN_GAMES = 10`; flag and rank aggregate candidates; split API lists during selection.
- [x] Add matching main-card and Tier List presentation, provisional labels and qualified place prefixes. Update affected fixtures and cache markers.
- [ ] Review and inspect desktop/mobile preview and `/api/me`; run CI via PR, diagnose any failed job logs.
- [ ] Release through the established verified-commit pipeline; verify production statistics, badges and bilingual public changelog.

Local inspection: both faction-card and Tier List tables show separate qualified/provisional rows; examples 2/2 and 5/8 keep scores 34.2 and 30.6 with no place. Normal LocalPreviewAdmin session, static HTTP 200, desktop/mobile layout and browser error log checked. Independent read-only review found no material issues; the existing identity fixture was made nonvacuous for provisional rows. Automated tests have not been run locally.
