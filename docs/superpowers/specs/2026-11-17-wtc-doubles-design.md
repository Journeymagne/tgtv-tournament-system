# WTC Doubles

Status: approved by the user on 2026-11-17, including two shared TTS tables. Implemented for local preview; automated validation awaits CI.

## Source and agreed direction

Rules: [Регламент Coinflip Vol.3](https://docs.google.com/document/d/1LMEYmL94pZfKuZ_MCpx-TXRb4zXYDGTbTrIWUKK2VRA/edit), read on 2026-11-17, sections 1.5–1.8 and 2.

The user requests a new team tournament type named **WTC Doubles** and explicitly chooses step-by-step captain pairing in TTS and the existing Doubles-style manual form in IRL. This is a new format, identified as `wtc_doubles`; existing `doubles`, `shield_sword` and `sword_shield_classic` keep their rules and historical results.

Alternatives discussed: step-by-step pairing everywhere, or manual entry everywhere. The user selected a venue-dependent combination: online pairing is enforced by the application; in-person pairing is agreed at the table and entered together.

## Tournament and registration

- Swiss tournament, exactly two players per roster, two personal games per team match. Default to four rounds; the organizer can change the number before starting.
- Each player registers one faction and plays that faction throughout the event; faction rotation and playing the teammate's faction are unavailable. Preserve existing organizer replacement and historical-player snapshot behavior.
- TTS requires step-by-step captain pairing; IRL requires manual pairing. Derive and validate the setting from the venue so unsupported combinations cannot be saved via the API.
- Builder's proposed default: TTS uses two shared virtual tables per round, following the existing WTC model; IRL uses a distinct line of two physical tables per team match. Deployment belongs to the table. Existing map images, table numbers, optional IRL Killzones and immutable round snapshots apply.
- Organizer selects exactly four distinct supported missions per round in either venue. Do not hardcode this event's missions: the source says its Approved Ops 2026 mission pools will be announced later. Use the existing supported mission catalogue; adding a future catalogue is outside this change.
- Builder's proposed boundary: like current Doubles, require an even number of active rosters and do not invent automatic bye or technical team-result scoring, which this source does not define. Reject roster withdrawal when it would require an undefined result. Individual organizer corrections remain available.

## TTS pairing

Use existing captain permissions and organizer intervention, match locking, revision checks, pairing history, audit and undo protections. No Shield or Sword selection exists in this format.

1. Both captains roll D6 using the existing online/manual roll entry; ties require a reroll. The winner has initiative.
2. The captain without initiative bans one mission from the four-mission pool.
3. The captain with initiative bans a different mission. Two missions remain.
4. The captain with initiative chooses the right to determine player pairings or assign tables to their own players. The other captain receives the other right and always assigns missions.
5. The captain with the pairing right determines the two personal opponents. Each roster member appears exactly once. If tables were already assigned to players, those assignments follow their players into the final pairings.
6. The captain with the table right assigns the two tables to their own players; each table appears once. Either assignment may determine the remaining assignment automatically.
7. The captain without initiative assigns the two unbanned missions to the games; each mission appears once. The remaining mission may be filled automatically.
8. Create exactly two personal games only after every assignment is complete.

Steps 5 and 6 execute in the order of rights: the captain with initiative exercises their chosen right first, then the other captain exercises the other right, then assigns missions. Thus choosing tables first must not require opponents to be known yet.

The API enforces the acting side, current step/revision, current roster membership, table ownership and mission availability. Reject duplicate or stale submissions without creating extra games or advancing another step. Undo returns to the previous actual action and clears dependent choices. Existing protections against invalidating later rounds and unconfirmed result deletion apply.

## IRL pairing

Show a WTC Doubles-specific instruction explaining initiative, loser-first and winner-second bans, the winner's right choice, and the loser's final mission assignment. Captains do these steps at the venue. The manual form saves both final games together, using each player and table once and two distinct missions from the four-mission pool. The two unselected missions represent the bans; do not require separately recording initiative or bans in IRL. Either captain or the organizer can save, subject to the current revision and normal permissions.

## Scoring and standings

For each completed personal game:

`GP_A = 10 + clamp(VP_A - VP_B, -10, 10)`; `GP_B = 20 - GP_A`.

Each game contributes 20 GP; the team match contributes 40. At completion, award team TP from the sum of that side's GP:

| Team GP | Result | Team TP |
| --- | --- | --- |
| 0–17 | Loss | 0 |
| 18–22 | Draw | 1 |
| 23–40 | Win | 2 |

Do not add existing Doubles' personal 2/1/0 TP or combined-VP bonus to official team standings. Keep the existing separate personal standings view and its 3/1/0 TP.

Official team standings use this fixed descending order:

1. Team TP from completed team matches.
2. Total personal game wins.
3. SOS: arithmetic mean of the current total team TP of opponents from completed matches; retain withdrawn opponents and count repeated played encounters individually. No opponents means zero. Compare full precision; round for display only.
4. Sum of final personal VP, including the existing primary bonus.
5. Sum of raw Tac Op points, excluding primary bonus.

Fully equal rows retain stable seed/ID ordering. Builder's proposed consistency rule: unfinished team matches show provisional personal results/GP on the match but contribute no official team standings metrics or SOS opponent until both games complete. Correcting a result recomputes GP, TP, every affected SOS and standings; reopening excludes that match again. Preserve later-round protections and existing publication/podium reconciliation rules when corrections are allowed. Keep the existing ranked/unranked policy and rating pipeline, using the completed team outcome; review code paths for assumptions about three players or 60 GP.

Examples: personal results 20:4 and 1:18 produce 20:0 and 0:20 GP, therefore 20:20 team GP and 1:1 TP. GP totals 17:23 produce 0:2 TP; 18:22 and 22:18 produce 1:1; 23:17 produces 2:0.

## Implementation surface and compatibility

Extend tournament constants and create/edit/publish validation; a new forward-only database migration admitting the type and enforcing two-player/venue settings; team-size and scoring helpers; team-match persistence and round snapshots; captain actions and next-action descriptions; tournament creation/editing, registration, round tables/missions, pairing, results, standings, export and public format labels. Update Russian and English labels, pairing instructions and format documentation.

Keep pairing type, size, venue behavior and scoring version on each new match. Never reinterpret or migrate old Doubles/WTC/Classic results. Reuse normal authentication and existing permission boundaries. Existing unrelated uncommitted changes are present in this checkout: preserve them, and isolate implementation using the repository/app worktree workflow as appropriate.

The exact new phases/action names and whether the right choice is stored in a dedicated column or structured match state are implementation choices. Choose explicit validated states; do not send a two-player match through three-player Shield/Sword helpers. Generalize shared helpers only where behavior stays compatible.

No production deployment, publishing, or release version bump is requested. If a later production deploy is authorized, publish matching Russian/English changelog entries to both seed files and database-served documentation as required by AGENTS.md.

## Acceptance and validation

Add meaningful regression coverage for create/edit/publish and schema constraints; both initiative winners and both right choices; table-first assignment before opponents exist; ban order and available missions; permission/stale submission/duplicate assignment rejection; undo/reset and later-round protections; IRL manual entry; two-game creation and snapshots; 17/18/22/23 GP boundaries and clamping; personal wins/SOS/VP/Tac ordering; withdrawn opponents, result correction and reopening; existing formats retaining scores, sizes and pairing flows. Include browser rendering cases for both languages and two-player layouts where existing test harnesses support them.

Per the user's standing instruction, do not run automated tests locally. Validation runs in GitHub Actions for the actual implementation commit when it is pushed through an authorized workflow; do not cite older CI as validation. Local static review and page/API availability checks are allowed. If starting a local preview, first verify both app and database are local, configure reusable administrator autologin using ignored `work/` runtime files and verify the supplied URL plus `/api/me` with `user.isAdmin === true` and visible administrator controls.
