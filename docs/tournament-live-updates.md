# Tournament workflow corrections — September 2026

## Registration and administration

- Administrators can reserve an empty roster before tournament start, then fill
  it with a team, three players and a captain. Filling retains its ID, seed,
  name and payment flag. Reservations count toward capacity and must be filled
  or withdrawn before preparing/starting the first round.
- Every site administrator gets round controls on the public tournament page.
  The controls open the existing administration workflow; the server still
  requires the administrator role. Ownership is not required.
- **Edit round tables** changes only the killzones, layouts, table numbers and
  images of a generated team round. It keeps the same round, team/player pairings,
  captain choices, games and results, including pending results. Existing game
  table details update immediately; other rounds retain their own tables.
- **Undo round** is separate and requires confirmation. The latest prepared or
  started team round can return to the full round editor while it is the latest
  round and no game result has been submitted. Its team pairings, tables and
  images are retained in `round_draft`. Captain choices restart after regeneration.
  Closing the editor leaves a resumable draft. Pending and confirmed results
  block this operation, and an outstanding draft prevents undoing another round.
- My Games lists active captain pairings for every active roster member, even
  before personal games exist. Pairing controls remain captain/admin-only.

## Live views and performance

- In-progress tournament detail views check a small revision endpoint while
  visible: Matches every 5 seconds, Standings every 15, Statistics every 45.
  Full data is fetched only after a change. Tournament lists, roster profiles
  and editing tabs do not poll. Standalone pairings poll every 5 seconds during
  choices and every 10 during games; My Games polls every 15 seconds.
  The revision includes a database snapshot to detect changes committed after
  an earlier poll. It is global, so a change elsewhere may cause one extra fetch.
- Updates retain the selected tournament/round tab and scroll position. They
  defer rendering during text selection, registration, result entry, open dialogs,
  pending writes, focused controls and unsaved forms. Hidden tabs stop polling.
  Stale responses from a previous route or local edit
  are discarded. Settings saves reject a stale `expectedUpdatedAt`.
- Logo fields now contain versioned image URLs. Images load separately, with
  private browser caching and conditional requests. New team/tournament uploads
  become WebP with a maximum dimension of 640 pixels, preserving proportions.
  Existing stored images remain intact.
- `?compact=1` returns each tournament roster/match once; the client rebuilds
  references. Admin roster membership options load only when opening an editor;
  audit data is requested explicitly with `?audit=1`.
- On the local six-roster tournament, the public response decreased from
  82,948 to 49,470 bytes before HTTP compression. An unchanged revision response
  was 47 bytes. These are local payload measurements, not production timings.

## Pairing event log

The dedicated pairing screen shows a persistent event log with timestamps and
actor names. It covers dice rolls and ties, mission bans, shield/sword choices and
reveals, tables/missions, game creation, manual pair changes, Undo/reset, table
updates and result submission/review. Newest events appear first; polling retains
the reader's position in older events.

Events come from the existing tournament audit, independently of the undo stack.
New entries preserve actor names, chosen players/Kill Teams and table descriptions
as they were when the action happened. Older audit entries use their available
details without inferring earlier choices from the current match.

The server returns only public log fields. Private shield/sword attempts are
visible to the corresponding captain and administrators. Opponents and spectators
receive the selection event without its choice. Separate reveal entries contain
only the choices actually revealed; undo does not erase them or disclose earlier
private attempts. No database migration is needed.

## Images and navigation

- Changing a killzone/deployment keeps the uploaded image. Explicit replacement
  or removal still works; earlier round images remain unchanged.
- Navigation controls use anchors with real destinations. Ordinary clicks retain
  the app router, while middle/Ctrl/Cmd clicks retain native browser handling.

## Deployment and verification

Migration 030 allows reserved rosters and adds revision triggers. It contains no
demo users, teams, tournament data or password changes. Apply it through the
existing startup migration runner. No new service or dependency is required.

Integration coverage includes reserve capacity/fill, another administrator,
member versus captain permissions, round restoration and pending-result guards,
image persistence/caching, commit visibility and concurrent settings edits.
Client coverage includes update races, drafts, tab/scroll retention, logo resizing
and browser link gestures. The existing test suite runs against an isolated test
database.
