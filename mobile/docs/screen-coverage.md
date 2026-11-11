# Native screen coverage

Implementation snapshot: 11 November 2026. React Native screens render native controls on Android/iOS; Expo web is a visual-review target, not evidence of a signed native binary or device testing. No production API write was executed during implementation. Backend permissions remain authoritative.

## Player and captain

| Route | Implemented behavior | Boundary |
|---|---|---|
| login / welcome | Existing account name or verified email login, shared account session | Native OS cookie behavior requires signed device verification |
| onboarding | Registration using existing API; password confirmation, email, Telegram contact | Email confirmation follows existing emailed website URL |
| recovery | Existing password recovery API | Password reset link currently opens the existing website flow |
| games | Personal tournament games, active/history filter, captain pairings, foreground refresh | Does not show casual challenges as tournament games |
| game / review / complete | Actual server status, players, scores, table/mission, result confirmation/rejection | Safe mutation requires deployed `resultRevision` backend support |
| score | Crit/Kill/Tac, primary bonus preview, faction/Tac Op, mission/layout, tiebreakers/APL/roll-off; server validation | Native encrypted drafts restore explicitly, never autosubmit; web review uses memory only |
| tournaments | Public/my events, pagination, search within fetched page | Server-wide search not added |
| tournament | Event details, registration, withdrawal, team pairings, links to management | PDF rules attachment remains a website/download task |
| registration | One or multiple searchable canonical faction selections; note; confirmation | Exact allowed faction count validated again on server |
| roster-registration | Team members, roster captain, canonical server membership IDs, factions, registration | Existing rosters load into the same form and save via PATCH; roster details expose edit/withdraw according to server permissions |
| participants | Solo participants or team rosters; respects server-hidden factions | No reconstruction of hidden information |
| standings | Solo/team ranks, points/wins/VP; joins names by correct participant/roster namespace | Server calculates ordering |
| schedule | Published rounds, matches/BYE, table and game links | Client does not generate pairings |
| table | Real assigned tables, killzone/deployment, uploaded map image | Full Map Studio authoring and TTS map export are separate products and not embedded |
| team | Team list/detail, membership, invitation acceptance/decline, create/invite, name/description editing, removal, leadership, archive, leave/delete | Server blocks changes involving locked rosters; image/logo upload and archival restore UI not implemented |
| pairing | Server phases, roll/classic initiative, mission bans, own Shield/opponent Sword, hidden selections, table/mission steps, manual 2×2/3×3, undo | Uses server revision; legacy pairing version 1 uses the existing server TTS/IRL step sequence; server still validates revisions and selections |
| notifications | Seven actual inbox event payloads localized; read one/all, supported native destination or explicit safe website destination | Native FCM/APNs push delivery is not provisioned by these screens |
| profile / account | User/MMR, account details, password change, sign-out with local draft cleanup | Email changes, avatar upload, session inventory and account deletion not implemented here |
| settings | Persisted theme/language selection | Does not overwrite Telegram bot settings |

## Additional tournament-system menus

| Route | Implemented behavior |
|---|---|
| rankings | Player/team rankings, venue, search and pagination |
| statistics | Completed tournament-game faction/Tac Op win rate and average VP, venue filter; source is existing full statistics API |
| history | Paginated game history filtered to tournament games; game detail links |
| player | Public profile, MMR, record, recent games and teams |
| achievements / achievement | Award/title list, image/emoji, recipient profiles |
| documentation | RU/EN document index and native text rendering of existing Markdown content; headings/lists retained, rich HTML not executed |
| roster / tournament-stats | Native roster detail/history, edit/rename/withdraw and per-event faction/Tac Op statistics via TournamentExtras |

## Organizer

The separate `OrganizerScreens.tsx` implements the dashboard, event create/edit, registration/payment management, rounds, tables, result correction, staff, participant management, pair adjustments and audit views. Check its route registry and the API contract document for exact actions. The existence of an organizer screen does not imply that every desktop administration action has parity.

## Remaining parity and release work

- Logo/avatar/PDF/map image upload, tournament PDF rules viewing inside the app, map catalog authoring/TTS export are not implemented natively in this change.
- Website achievement editing/award management, documentation editing, feedback, platform-wide superadmin users/quotas, account email/security lifecycle and full analytics filters are not all reproduced.
- Free-play challenges and non-tournament service menus (tracker, training, dice, Combat Lab, Studio) are outside this tournament client, with existing website links where an inbox event points there.
- There is no verified native push registration/delivery, complete offline read cache, live store distribution, or macOS/iOS signing run in this workspace. Those must not be described as completed solely from HTML/web screenshots.
- Actual device checks: keyboard/rotation/split-screen, safe areas, TalkBack/VoiceOver, dynamic type, native cookies, background/restore, and APNs/FCM require signed builds and device/emulator access.
- No local automated product tests were run by the player-screen implementation task, per AGENTS.md. Type checking/building and browser visual inspection are separate verification steps. Backend concurrency changes require CI integration coverage before production deployment.

