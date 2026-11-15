# Entity identity contract

Tournament outcomes use `tournament_matches.winner_participant_id` (API:
`winnerParticipantId`) as the only authoritative winner, including draws (`null`),
byes, standings, W/L, match points, head-to-head and bracket advancement.

Game results retain their existing `winnerId` and score keys for compatibility:
registered players use **user IDs**; guests use **negative participant IDs**.
`match.result.winnerId` is a legacy game-result snapshot, not a tournament ID.
Do not compare it to a positive participant ID or read it to choose a tournament
winner. `winnerParticipantIdFromResult` is the explicit write-boundary adapter:
game key -> participant.userId (or explicit negative guest key) -> participant.id.
It rejects unknown, ambiguous, malformed and unsafe numeric keys.

`scoresByParticipantId` is the tournament score snapshot. Old score dictionaries
are read only through the exact user/negative-guest key, never by trying a positive
participant ID. Migration 035 backfills resolvable snapshots using the original
`game_participants.result_key` where available; these survive account deletion.
An unresolved historical score remains unresolved instead of borrowing an opponent's.

## Storage guarantees

Migration 034 repairs the known winner collision and derived published statistics.
Migration 035 then adds:

- a null-safe CHECK that a non-null winner is one of the two match participants;
- distinct match participants and composite foreign keys ensuring both sides and
  the round belong to the match's tournament (also prevents moving referenced
  participants/rounds into another tournament);
- a write trigger checking the game's source type and source match ID, and
  validating the explicit game-key-to-participant mapping on completed results;
- participant score snapshots on new/changed completed results.

The trigger validates even raw SQL/repository writes: storing a colliding user ID
that happens to be the losing participant ID is rejected. The source game itself
keeps its original result and Elo fields. API conversion and scoring happen in
the existing transaction before saving the tournament result.

CHECKs and composite foreign keys are installed **NOT VALID** to avoid a historical
bad row blocking deployment. PostgreSQL enforces new writes immediately. Existing
out-of-pair winners and cross-tournament references still require review and repair
before `VALIDATE CONSTRAINT`; updating such rows can fail until repaired. New indexes
and score backfill take locks during startup, so schedule deployment appropriately
for a large database. No IDs, primary-key types, numeric URL routes, published manual
places, awards or elimination pairings are rewritten by 035.

Old unresolved/deleted-account history is not guessed. Migration 034 preserves
manual published places and awards; organizers still need to review those places
and any downstream elimination bracket affected by the original bug. Restore the
application and migration code together when rolling back: the DB guard intentionally
rejects an older application's incorrect winner writes.

## Additive public references

User, tournament participant, game and tournament match API views now add
`publicId`: `usr_124`, `tpt_124`, `game_124`, `match_124`. Match views also expose
`winnerParticipantPublicId` and `gamePublicId`; participant views expose
`userPublicId`. Existing `id`, relationship fields and numeric routes are unchanged.
The formatter supports exact bigint/string values, but the current schema remains
SERIAL/integer; changing the whole persistence layer to bigint is a separate task.

`parsePublicId(expectedEntity, value)` validates the namespace and returns an exact
decimal string. Current routes continue accepting their existing numeric inputs;
the new strings are an opt-in contract for future clients, not a replacement for
authorization, relational constraints or explicit ID conversion.

## Audit scope and regression coverage

Reviewed individual tournament completion/admin editing, previews, standings,
bracket/Swiss pairing, result migration, game details, Elo/replay, challenges,
team results and captain/player permission paths. Team scoring reads game user-keyed
scores and maps through a side to a roster; it does not compare user winners with
team/roster IDs. Game `sourceId` is interpreted only with `sourceType`.

Client permission/submitter lookups now respect an explicitly null `userId` instead
of falling back to a deleted player's result key. Legacy user-only player objects
without a `userId` field retain their existing `id` meaning. The form-only
`tournamentGameLike` adapter is local to tournament forms; its `id` remains a match
ID and must not be passed to a game endpoint.

Tests deliberately set `Corias.userId == Tony.participantId`, cover both player and
admin submissions, W/L, points, previews, head-to-head, withdrawals, guests, draws,
byes, deleted accounts, invalid SQL writes, wrong game links and migration history.
Public namespace tests ensure the same integer yields different entity references
and that parsing the wrong namespace fails. Legacy numeric APIs cannot provide
compile-time namespace safety throughout this JavaScript codebase; the centralized
adapter, storage constraints and collision fixtures are the enforcement mechanism.
