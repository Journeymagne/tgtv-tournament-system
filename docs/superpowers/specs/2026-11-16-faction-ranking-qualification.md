# Faction ranking qualification

User-approved rule: at least 10 completed eligible games on a faction, across all time, are required to enter that faction's player ranking. Before that, show the unchanged Wilson score as provisional, without a ranking place.

- Preserve existing source/publication, identity, mirror and all-time rules.
- Qualify at exactly 10 games. Qualified players get contiguous Wilson-based places starting at 1. Provisional records have `rank: null` and an explicit flag.
- The statistics API selects five qualified players from all candidates after filtering, and returns up to five provisional players in a separate `provisionalPlayers` array. Explicit sorting cannot bypass qualification.
- Both the main faction card and Tier Lists show qualified and provisional records in separate labeled tables. Provisional Wilson scores are visibly marked and have no place prefix.
- Recompute eligibility from current records, including after a game deletion or correction. Achievements keep their previously agreed score rules; this change only gates the leaderboard.
- Keep existing limits and seasonal faction totals. Use shared minimum-game configuration and Russian/English labels.
- Automated tests run in CI only. Verify page/API availability and layouts on the local administrator preview. Follow the existing authorized release workflow for this follow-up.

Approach: retain complete internal player candidates and split them when choosing each displayed list; assign official ranks only to qualified players. This preserves explicit sorting and avoids hiding provisional scores.
