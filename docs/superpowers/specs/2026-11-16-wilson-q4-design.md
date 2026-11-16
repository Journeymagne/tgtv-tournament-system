# Q4 season and Wilson faction achievements

Implement the user's 2026-11-16 requirements; preview locally before any production deployment.

- Add `2026-q4-dataslate`, displayed as `2026 Q4`, starting `2026-11-09T00:00:00+04:00`; close Q3 at that boundary. From this boundary onward, use the played/result timestamp for season membership even when a tournament carries an earlier season. Preserve historical tournament season membership before the boundary.
- Calculate the lower Wilson bound with z=1.96 on a 0–100 scale. Keep full precision for ordering and thresholds; round only presentation. Draws remain in the denominator, as in the existing win rate. Preserve existing exclusion of faction mirror matches.
- Show Wilson in faction best-player tables and order by descending Wilson by default. Show five players and only the five latest matches in the faction detail. Keep other explicit sort choices functional.
- Award all qualifying personal faction achievements for all-time Wilson scores: Experienced / Опытный >=50, Connoisseur / Знаток >=60, Master / Мастер >=70. No minimum games. They are current qualifications, revoked when the actual score drops. Compute them from published completed games on read, like existing automatic training achievements, so edits, deletion and publication changes cannot leave stale awards. No database writes on GET.
- Both faction best-player tables and achievements use all-time Wilson scores and all-time player records; the table is explicitly labeled all time. Overall faction totals, matchups and recent games use the selected season. Existing manually awarded achievements remain unchanged.
- Russian and English labels. No additional mastery XP or achievements in this change.
- Local test administrator autologin must work in the user's browser through an ignored local launcher; both app and database must be local.
- Do not run automated tests locally. Write regression coverage for CI, and perform visual and page/API preview checks only.

Approach: shared reference helpers keep browser and API calculations identical. Derived automatic achievements avoid synchronizing mutable award rows across every game and tournament mutation. Persistent award rows were rejected because these qualifications must reflect current results, rather than preserve the history of earning a badge.
