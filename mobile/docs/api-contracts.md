# Mobile API contracts

Implementation: `src/api/client.ts`, `src/api/types.ts`. Baseline: repository commit
`5a25a10`, existing `src/api/routes-accounts.js`, `routes-tournaments.js`,
`routes-notifications.js`. No new `/api/mobile` routes are assumed and no server
permission checks were changed.

## Transport and sessions

`EXPO_PUBLIC_API_URL` selects **one** origin: `https://ktcompanion.ru` (default)
or `https://killteamcompanion.com`. Development builds additionally accept localhost,
Android emulator `10.0.2.2`, or a `192.168.*.*` local backend. The backend must
actually be local before local admin preview/autologin is used. Release builds
reject HTTP and arbitrary hosts. Switching domain is not transparent failover:
the server's host-only `sid` cookie is not shared between `.ru` and `.com`.

Native `fetch` uses `credentials: include`, allowing the platform cookie store to
process `Set-Cookie: sid=...; HttpOnly; SameSite=Lax; Path=/; Secure` and server
renewals. JavaScript does not extract, log, or persist cookies or passwords.
App startup reads `/api/me`; logout revokes the session on the server. An offline
logout request cannot be advertised as server revocation. API methods never
automatically retry writes. A 20-second timeout (30 for export), network failure,
invalid response after a write, or 5xx raises `ApiError.writeOutcomeUnknown`:
re-read the resource before allowing a repeated action. `status`, `code`, and
`retryAfter` allow localized 401/403/409/429/error displays.

**Release gate:** test actual cookie login → `/api/me` → application restart →
renewal → logout on both native platforms. Native cookie persistence is not
established by browser previews or TypeScript compilation. This initial integration
uses the site's session flow; browser authorization-code/PKCE and device-session
management from the concept remain a separate backend enhancement, not an
already implemented capability.

This change adds the optional `game.resultRevision` / `expectedResultRevision`
contract to standard game reads and player result writes. The server computes a
fingerprint from persisted result state and compares it **after locking** the
tournament/team match/game in the same transaction as the mutation. Mobile sends
the revision of the result the user actually reviewed. This backend change must
be deployed before mobile result editing is enabled; old server responses without
`resultRevision` are readable but must not silently bypass mobile concurrency
protection. Existing website clients can omit the field and keep their current
behavior. Organizer legacy result endpoints are not covered by this player guard.

The server does not enable cross-origin browser CORS. Expo web at another origin
cannot authenticate against production by copying native settings. Use a local,
same-origin development proxy connected to a **local** database for integration
previews; isolated component previews must remain visibly separate from real data.
Do not add wildcard CORS or weaken SameSite. Native clients do not need CORS.
No Telegram initData/token is substituted for application identity.

## Reads and writes

| Client method | HTTP route | Body / response |
| --- | --- | --- |
| `login(name,password)` | POST `/api/login` | `{name,password}` → session summary; name also accepts verified email |
| `me()` | GET `/api/me` | `{user,hasAdmin,games,teamPairings,challenges}`; anonymous `user:null` |
| `logout()` | POST `/api/logout` | `{}` → `{ok:true}`, expires cookie |
| `register(body)` | POST `/api/register` | name/password/confirmPassword/telegramContact, optional registerNickname,email,locale; server validates email when enabled |
| `recovery(email)` | POST `/api/auth/password/forgot` | `{email}` → generic 202 `{ok:true}`; does not reveal account existence |
| `updateProfile(body)` | PATCH `/api/me` | name, registerNickname, telegramContact, bcpEmail, currentPassword/newPassword → session summary |
| `tournaments(query)` | GET `/api/tournaments` | paginated `{tournaments,pagination}`; `scope=mine` requires sign-in |
| `tournament(slug)` | GET `/api/tournaments/:slug` | `{tournament,participants,tables,rounds,standings,...}` |
| `games(query)` | GET `/api/games` | completed games; page/venue/playerId/playerQuery/team filters |
| `game(id)` | GET `/api/games/:id` | `{game}`, including tournament/game permissions |
| `gameByMatch(matchId)` | GET `/api/games/tournament-match/:matchId` | `{game}`; resolves match namespace to game namespace |
| `submitResult(gameId,body)` | POST `/api/games/:id/result` | `{scores,killzone?,tiebreakers?}` → `{game}` |
| `confirmResult` / `rejectResult` | POST `/api/games/:id/confirm-result` or `/reject-result` | `{}` → `{game}` |
| `join(id,body)` / `withdraw(id)` | POST `/api/tournaments/:id/join` or `/withdraw` | faction/factions/factionRules for join; server eligibility/capacity/status checks |
| `teams()` / `team(slug)` | GET `/api/teams`, `/api/teams/:slug` | `{teams}` / `{team,currentMembers,formerMembers,rosters,recentGames,stats}` |
| `teamMembers(id)` | GET `/api/teams/:id/members` | authenticated member selector |
| `registerRoster(id,body)` | POST `/api/tournaments/:id/rosters` | teamId,name,captainUserId,members `[{userId,faction/factions}]` |
| `pairing(matchId)` | GET `/api/team-matches/:matchId` | redacted server pairing view; never reconstruct hidden opponent choices |
| `pairingAction` | POST `/api/tournaments/:id/team-matches/:matchId/:action` | action-specific body and current `revision`; see below |
| `notifications()` | GET `/api/notifications` | `{generatedAt,lastSeenAt,unreadCount,items}` |
| `setNotificationRead(body)` | POST `/api/notifications/read` | `{id}` for one, or `{through:generatedAt}` for all; no client-clock substitution |
| `telegramStatus()` | GET `/api/telegram/status` | read linked bot locale/settings; does not modify bot settings |
| `adminTournaments()` | GET `/api/admin/tournaments` | paginated permitted tournament list |
| `adminTournament(id)` | GET `/api/admin/tournaments/:id` | tournament detail + staff; permissions enforced server-side |
| `createTournament` / `updateTournament` | POST `/api/admin/tournaments`, PATCH `/api/admin/tournaments/:id` | existing tournament form payload; update includes `expectedUpdatedAt` |
| `participantPayment` / `rosterPayment` | PATCH `/api/admin/tournaments/:id/participants/:pid/payment` or `/rosters/:rid/payment` | `{paid:boolean}`; bookkeeping only |
| `roundPreview` | GET `/api/admin/tournaments/:id/rounds/next/preview` | preview before round mutation |
| `startTournament` / `nextRound` | POST `/api/admin/tournaments/:id/start` or `/rounds/next` | current preview/setup, missions, tables, endsAt as applicable |
| `addTable` / `updateTable` | POST `/api/admin/tournaments/:id/tables`, PATCH `.../tables/:tid` | tableNumber,killzone,deployment |
| `staff` / `assignJudge` / `revokeJudge` | GET `.../:id/staff`, POST `.../:id/judges`, DELETE `.../:id/judges/:uid` | assign `{userId,expiresAt?}`; obey `canManageJudges`/`canRevoke` |
| `download(path)` | GET `/api/admin/tournaments/:id/export.xlsx` | authenticated binary XLSX → `{bytes:Uint8Array,contentType}`; save/share in native app, not separate browser cookies |

`api.request<T>(path,{method,body,signal})` supports remaining audited routes without
inventing a mobile-specific proxy. It only targets `/api/` on the configured origin.

## Response details that matter

- Solo tournament matches are **`rounds[].matches`**, not a top-level `matches`.
  Permissions are **`tournament.viewer`**; `canAdmin` also covers assigned judges,
  not just global `user.isAdmin`. Team tournaments additionally contain `rosters`
  and `teamMatches`.
- Standings rows reference `participantId` (or team `rosterId`). Names are joined
  from the returned participants/rosters. Hidden factions must stay hidden.
- `game.players[].id` is the canonical **result key**, which can represent a proxy;
  `players[].userId` is the account link. Use result keys in `scores`, never assume
  participant ID = account ID = result key. `game.playerIds` is insufficient for
  proxy games. Solo tournament context is `game.tournamentMatch`.
- Score input per result key: `{crit,kill,tac,primary:'crit'|'kill'|'tac',faction?,tacOp?}`.
  The backend validates ranges, approved faction and tiebreakers and calculates
  `ceil(primary/2)`. The server is authoritative even when the UI previews totals.
- Solo tournament submissions can finalize immediately. Team IRL player submission
  can also finalize immediately, while captain/TTS flows may require review. Follow
  the returned game status and `resultPermissions`, not one hardcoded policy.
- Captain actions are `initiative`, `manual`, `roll`, `undo`, `ban`, `shield`,
  `sword`, `environment`. Send fresh `revision` and, where required, `step` or
  `rollRound`. Shield/sword accept `memberId` (roster-member namespace), ban uses
  `mission`, environment uses `tableId`/`mission` according to the current server
  stage. A 409 always requires refresh and user review.
- Organizer reset/pairing endpoints have revision/identity confirmation fields.
  Do not use a generic destructive request without the route-specific confirmation.
- `confirmResult(id, expectedResultRevision)` and `rejectResult(id, expectedResultRevision)`
  send the revision of the displayed result. `submitResult` accepts it in the body.
  A fresh read used to detect conflicts must not replace the revision without
  returning the user to review the newly changed data.
- Native APNs/FCM registration endpoints do not currently exist. In-app notifications
  and the existing linked Telegram channel are available; background native push
  must not be represented as working before backend/platform provisioning.

## Verification status

Contracts inspected against handlers and view builders, not only route names.
No production writes, messages, new accounts or database mutations were made.
No automated tests were run locally (repository AGENTS.md). Native session smoke,
production version alignment, and CI integration checks remain release gates.

Native CI uses JDK 17 and the Xcode 27 GitHub runner, based on the current
[Expo SDK 58 build toolchain](https://docs.expo.dev/build-reference/infrastructure/)
and [GitHub runner labels](https://github.com/actions/runner-images). Android
`assembleRelease` embeds JavaScript and uses generated development signing for
sideloading; this is not a Play Store signing identity. iOS produces a Release
simulator `.app`, not an installable signed iPhone IPA. Neither build result by
itself proves physical-device acceptance.
