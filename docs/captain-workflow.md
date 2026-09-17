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
- Both captains can open and report all three personal games, including games
  they do not play in. Captain submissions remain pending for both TTS and IRL
  tournaments until the opposing captain confirms or rejects each result.
  An ordinary player cannot confirm a captain submission, and a captain cannot
  confirm a teammate's submission. Administrators retain their existing override.
- Personal player submissions retain the existing IRL behaviour. TTS player
  submissions may be confirmed by the opponent or the opposing captain.
  Completed results remain editable through the administrator's existing controls.

Validation covers manual dice and ties, every pairing boundary and undo, stale
revisions, hidden choices/history, captain access to all three games, confirmation
permissions, rejection/resubmission, result removal and rating rollback. Browser
checks use two separate captain sessions against the disposable test database.
