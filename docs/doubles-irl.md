# IRL Doubles

Rules reference: [Doubles tournament regulations](https://docs.google.com/document/d/1c6Kt6ToU_AoAjHNUOwEfgoH36fhbMRrpoXuzN0hTpds/edit?tab=t.0).
The agreed implementation uses Classic's final manual form and four missions
per round (first choice from four, second choice from the remaining three).

Doubles is an IRL Swiss team format with two roster members and two individual
games per matchup. It defaults to four rounds. It uses the existing roster
registration, reserve, replacement, captain and deletion interfaces with two
slots. Existing WTC and Sword Shield Classic events retain three slots.

Each matchup receives a separate line of two physical tables. Table number and
deployment 1–6 are required; Killzones are optional and may repeat. The organizer
selects exactly four distinct missions for every round. Lines and mission pools
are snapshotted; later rounds cannot rewrite earlier assignments.

Captains roll off at the venue. The winner chooses either player pairings or
table assignments; the loser takes the remaining choice. The loser chooses a
mission from four for either table, then the winner chooses one of the remaining
three for the other table. Either captain can save both final pairings through
the shared manual pairing form. The form enforces unique players, tables and
missions and uses the pairing revision to reject stale submissions.

Individual results award 2/1/0 TP for wins/draws/losses. Once both games finish,
the team with more combined VP receives one additional TP; equal combined VP
awards no bonus. There is no second set of points for the team win and no GP.
For example, 20:4 and 1:18 produce 2:3 TP. Partial or pending matchups do not
contribute TP, VP or an opponent to standings.

Standings compare total TP, SOS, then total VP. SOS sums the current total TP of
every opponent from completed matchups, including withdrawn opponents and each
played repeat. Fully equal rows use seed and roster ID for stable ordering.
Corrections recalculate the bonus and standings. Later generated rounds protect
earlier results. An administrator can correct the final round of a published
event; publication and podium awards are reconciled.

IRL self-submissions save immediately. A captain reporting the teammate's game
requires the opposing captain's review, following existing permissions.
Replacing a member preserves historical player snapshots and results.

Migration 052 enables the format and records match roster size and scoring
version. Doubles requires IRL, Swiss, size two and manual captain pairing.
Automatic byes and forfeits are deliberately unavailable until their scoring is
defined. Every round requires an even number of active rosters; removing a
roster with unfinished matches is rejected before any data changes.

Focused regression cases are in test/unit/doubles.test.js. Under AGENTS.md,
automated suites run only when merging into main. Local verification uses the
dedicated PostgreSQL preview database and browser/API smoke checks.

Local verification on 2026-10-12 covered migration startup, roster replacement,
reserves and deletion, four rounds, captain permissions and result confirmation,
duplicate and stale pairing rejection, 20:4 + 1:18 = 2:3 TP, VP correction,
SOS, publication and correction of published final-round results. The browser
check covered tournament creation settings, four mission selectors, two tables
per line, two roster slots and saving two pairings after swapping players.
Russian desktop (1440px) and mobile (390px) previews had no horizontal overflow
or browser console errors. JavaScript syntax and git diff whitespace checks
passed. Automated suites were reserved for the main merge under AGENTS.md;
all 1041 tests subsequently passed during the 1.1.0 release preparation. See
[release validation](release-1.1.0-doubles-validation.md).
