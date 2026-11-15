# Individual standings inside team tournaments

The user requests a Personal standings tab inside the team tournament standings, showing every player's individual TP, Total GP and Diff GP as if playing a solo event. This extends the approved statistics/sorting work in PR 19.

## Behavior

Within the existing Standings section, offer Team standings (default) and Personal standings. Both public and administrative tournament views use the same component. Personal columns are place, player, roster, games, TP, Total GP, Diff GP and W-D-L. Every column is sortable through the existing table enhancer, with independent state, reset, search and preserved navigation/live state.

Completed personal games count immediately, even before the enclosing team match completes. A win gives 3 TP, a draw 1, a loss 0 in every team format, including Doubles; GP uses the existing gamePointsForTotals conversion: 10 + clamp(own VP - opposing VP, -10, 10), with the opposing score completing a total of 20 GP. Total GP sums personal GP and Diff GP sums own minus opposing GP, including for Classic and Doubles. Pending/open/reopened games do not count. Mirrors count as actual tournament games. Team byes give each member present at the bye 3 TP, one win, 20 GP and +20 Diff GP, matching solo TP and the existing 20-GP-per-player team bye award. Team-only forfeits do not manufacture unplayed personal results; completed personal games remain counted.

Include registered current/historical participants, including zero-game and withdrawn players. Aggregate account holders by user ID, preserving recorded results through substitutions; keep guests/proxies distinct by roster/member/result key/recorded identity. Historical roster intervals determine who receives an earlier bye. Rows expose public identity and roster labels only, preserving existing faction visibility and contact/history redaction.

Default personal order is TP descending, Total GP descending, Diff GP descending, then a deterministic identity order. Equal TP/GP/Diff GP share competition rank. Sorting the table does not change those ranks, official team places, published results, pairing or Elo.

## Approach

Use a pure server-side domain calculator over recorded team-game participants and complete roster history; return additive individualStandings in the existing team tournament payload. This provides one canonical calculation for all viewers without another endpoint or database migration. Reusing the current table enhancer provides consistent sorting and accessibility. Client-only calculations would duplicate identity/bye rules and depend on the viewer's redacted history.

## Validation

Write domain, API and client behavioral regressions before implementation. Cover 3/1/0, GP/Diff GP, zero games, all formats, partial team matches, pending/reopened games, byes/history intervals, replaced/proxy identities, shared ranks, immutable team standings and sortable tabs. Automated tests run only in CI on the exact final commit. No production deployment or local preview is requested.
