# Recalculate individual tournament standings

Open an individual tournament in the administrator interface and select
**Recalculate standings** above the tournament tabs. The action is available while
the tournament is in progress and after completion. It does not close an ongoing
tournament or generate another round.

Completed games are the source of the repair. Their original game-participant
links resolve user/guest score keys into tournament participants, including deleted
accounts. Legacy unlinked matches use their stored result and explicit participant
identity. Unknown identities or invalid game links stop the operation with the
match number instead of guessing a winner.

The operation repairs match winners, score snapshots and match points, then rebuilds
W/L/D, total VP, VP difference, Strength of Schedule, Buchholz and head-to-head using
the tournament's tiebreaker order. Withdrawn/removed opponents still contribute their
earned points to SoS/Buchholz without reappearing in the table.

For already published standings, confirmation explicitly allows replacing manual
places with computed places and reconciling podium awards. All published statistics
are replaced together, including opponents' tiebreakers. This repairs stale snapshots
even when the winner itself was already corrected by a previous migration. Custom
row notes are preserved.

`POST /api/admin/tournaments/:id/standings/recalculate` requires an administrator.
Published results additionally require `{ "replacePublished": true }`. All writes
are one transaction under the tournament lock; `standings_recalculated` audit events
record the actor, changed matches and previous/new published results. Repeating the
action with unchanged source games leaves match values unchanged.

The action does not change source games, individual ratings, round pairings or
elimination advancement. If repairing a historical winner would contradict a later
elimination pairing, the request stops so that the bracket can be reviewed separately.
Team tournaments use a different result model and do not expose this individual
standings repair action. No database migration is required.
