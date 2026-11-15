# Captain pairing and results

- The tournament Matches tab shows read-only match previews in both public and
  administrator views. Each preview includes all three games, revealed player
  factions, assigned missions/tables, confirmation status, VP/GP and total GP.
  Pairing actions stay on the dedicated match page, reached with Open pairing.
  Previews poll every two seconds while the tournament is prepared or running;
  only changed previews are rebuilt, preserving the selected round. Unconfirmed
  results remain excluded from GP.

- Both captains see saved pairing actions immediately after their own submission;
  the opponent's screen polls every two seconds. In-flight polls cannot overwrite
  the response to a newer action. Unchanged responses do not rebuild the form.
- Each captain can roll D6 on the site or enter their own integer result from
  another service (1–6). A tie starts another roll-off. The server determines the
  acting side; non-admins cannot supply the opponent's result.
- Either captain can undo the last saved pairing action, including the other
  captain's choice. Migration 022 stores private snapshots and a revision counter.
  Undo uses the revision to reject stale requests. History never enters public
  pairing responses. Earlier matches use their saved choices and audit records
  to return to the preceding logical pairing step.
- Undoing the final pairing step removes generated personal games. Submitted or
  confirmed results require an explicit warning and confirmation first; individual
  and team ratings are recalculated. Audit records retain the previous state.
  A match cannot be undone after a later round has been generated or the tournament
  has closed; later rounds must first be rolled back by an administrator.
- Both captains can open and report all three personal games. When reporting a
  teammate's game, the result remains pending in both TTS and IRL until the opposing
  captain confirms or rejects it. Neither ordinary player can review that submission.
- Anyone reporting their own game acts as a player, including a roster captain.
  In TTS, either the actual opponent or the opposing roster captain can confirm or
  reject it; one review is sufficient. In IRL, the result saves immediately.
  Existing pending results marked as captain submissions follow the same rule when
  the author actually plays in that game. No resubmission is needed.
- Authors, their own captain and other teammates cannot review their own side's
  submissions. Administrators retain their existing override, including editing
  completed results.

Validation covers manual dice and ties, every pairing boundary and undo, stale
revisions, hidden choices/history, captain access to all three games, confirmation
permissions, rejection/resubmission, result removal and rating rollback. Browser
checks use two separate captain sessions against the disposable test database.
