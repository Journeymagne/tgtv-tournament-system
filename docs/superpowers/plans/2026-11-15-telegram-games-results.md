# Telegram Games and In-chat Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A responsive Telegram game menu and complete button-driven score submission/review in the bot, with the same results and authorization as the website.

**Architecture:** Bounded game summaries replace the current duplicate full-game loading. A persisted, versioned draft engine uses the shared game-result service; the bot renders it and delivers ordered send/edit operations through the existing outbox. Telegram transport stays in NL, application/database in RU.

**Tech Stack:** Existing Node.js >=22/CommonJS, PostgreSQL, Telegram Bot API, node:test in GitHub Actions only; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-telegram-games-results-design.md` (approved with rollout).

## Global Constraints

- User explicitly authorized implementation AND production rollout: no repeated method/deploy approval. Existing linked worktree `telegram-public`, branch `feat/telegram-game-menu-results`, baseline main13d7452; reconcile main again before release.
- No automated local tests (AGENTS.md). Tests-only commits run in GitHub CI; root supplies actual red/green evidence. Static syntax checks/manual read-only diagnostics are allowed.
- Six games/page, Active and All views; include permitted captain games, no administrator-wide personal list. Full list must not hydrate all games or load activeItems.
- Draft fixed lifetime30minutes; bind current link ID, user, private chat, game, step version, original result/context version. Explicit final confirmation only. No duplicate Elo/results, stale callback advancement, implicit account replacement or authorization widening.
- Shared score, tie, faction/mission, participant/captain and tournament-status policies. Global rating advisory lock before all business row locks in any result mutation.
- RU/EN from bot preference; existing Companion terminology. Inline buttons only, bounded64byte callback data; no new text-input dependency or mandatory Mini App navigation.
- Durable outbox after commit; send/edit only; bounded retries/fairness and Telegram429 handling. Interactive work must not wait behind full notification expansion. Preserve existing notification permission/actuality checks and one poller.
- Never mutate real games/accounts or send test messages without another explicit request. Measure production with read-only queries and safe metadata only.
- Normal PR/CI/tag release, verified backup, compatible RU/NL activation, and DB-backed public RU/EN release notes on both domains.

## Review Focus

1. Old buttons after Back/edit/new draft, double tap, another device, or relink must not apply a choice to a different field/account (Task1/2).
2. Simultaneous website result, cancellation, participant/mission changes, captain changes or tournament closure must not be overwritten (Task1).
3. Stored/committed result plus lost Telegram response must not repeat Elo or lose the ability to see the saved state (Task1/2).
4. A pending old edit, deleted message,429, or slow notification expansion must not replace the latest UI or stall all users (Task2).
5. Several hundred historical games, proxy players, captain-only permissions, all tie stages, and optional unset fields must remain usable and bounded (Task1/2).

---

### Task 1: Bounded game data and shared, transactional draft engine

**Files:**
- Create `src/telegram/game-menu-data.js`, `src/telegram/game-drafts.js`, `src/telegram/game-draft-steps.js` (pure step/value/view logic).
- Extract existing `gameDetail`, revision and `changeResult` from `src/api/miniapp.js` into `src/api/game-results.js`; existing Mini App routes preserve HTTP wrappers and response shape.
- Create next migration `src/db/migrations/095_telegram_game_drafts.js`; register in `src/db/migrate.js`; adapt `scripts/provision-service-roles.js` only where existing schema grants need it. Reconcile migration number before release.
- Create `test/integration/telegram-game-drafts.test.js`, `test/unit/telegram-game-draft-steps.test.js`; restricted-role fixture integration may be separate `test/integration/telegram-game-drafts-roles.test.js` if needed.

**Interfaces:**
- `game-menu-data.listGames(client,userId,{filter:'active'|'all',cursor?:number,direction?:'next'|'previous'}) -> {games:GameSummary[],filter,previousCursor:number|null,nextCursor:number|null}`. Keyset ID pagination, max6items; at most3 bounded queries. GameSummary includes only IDs, player display names, status, source type, small score summary, tournament name/slug/round; no images/full tournament JSON. Personal/captain authorization filter applies every page.
- `game-results.gameDetail(ctx) -> {game}` and `game-results.changeResult(ctx) -> {game}` use existing ctx `{client,user,params:{id,action},body}`. Plain results; Mini App wraps HTTP no-store. Preserve same revisions and shared rules.
- `game-drafts.startDraft(client,{user,link,gameId,mode:'submit'|'confirm'|'reject'}) -> DraftView`.
- `game-drafts.readDraft(client,{user,link,token}) -> DraftView`.
- `game-drafts.transitionDraft(client,{user,link,token,version,event}) -> DraftView`; event types `choose` (zero-based choice index), `back`, `cancel`, `edit` (field index), `extras`, `submit`. The report documents exact final event schema for Task2.
- `DraftView` has `{token,version,expiresAt,mode,screen,game,step,choices,editableFields,summary}`; screens `choice|summary|extras|review|saved|cancelled`. `game` is a small canonical context, not full getOne payload. Choices and field descriptors are data/translation keys, not HTML. Saved view includes actual current game status/result/confirmation outcome. Explicitly document actual shape in report; Task2 consumes it without duplicating business logic.
- Export `game-drafts.requiresRatingLock(event,mode)` or a clear equivalent predicate so the bot can acquire rating lock BEFORE existing Telegram/user/draft row locks for final submissions/reviews. Transition itself must also enforce correct direct-call ordering and recheck all state under lock. Do not infer permission from callback data.

- [ ] Tests first: named assertions for bounded/authorized paging including history/captains, no mutation before explicit submit, fixed draft expiry, stale version rejected, same website result after final confirmation. Missing implementation must fail named assertions, not module loading. Commit tests and pause product edits for root's CI RED.
- [ ] Extract shared result service without behavior change to Mini App. Prove existing Mini App tests still pass in CI; keep original transaction/lock and revision semantics.
- [ ] Implement minimal scoped draft table (link FK cascade, game FK cascade where compatible, fixed expiry, token, mode/version and small JSON state; one current draft per link/chat). New draft replaces old token, not saved game. Use restricted tournaments role and no password/session access.
- [ ] Implement keyset summaries with six rows and bounded lookahead; preserve captain/personal eligibility and expose completed/cancelled in All. Large-history regression must assert query/row bound instead of a flaky timing limit.
- [ ] Implement pure step engine: scores0–6 and primary for both players; faction choice only when required; optional Tac Op/killzone/critOp/validlayout through Extras; locked mission preserved; back/cancel/edit retain chosen values without treating unset scores as0.
- [ ] Implement tie flow via existing scoring functions: ordinary optional ties, mandatory elimination resolution, APL0–99 tens/ones buttons when needed, roll-off only when prior criteria tie, existing team rules. Use current canonical dictionaries and validLayout, not a new rules copy.
- [ ] Implement submit/review through shared service, fresh active/link/permission checks, result revision AND actor/mission/context fingerprint revalidation, atomic saved receipt, and idempotent duplicate final clicks. Known conflicts roll back partial business effects yet permit a localized UI response; unexpected errors propagate for retry.
- [ ] Exercise foreign/expired/relinked/suspended identities, stale versions, input bounds, all game formats, proxy/captain roles, participant/mission changes, website race, deletion and final-result replay in real PostgreSQL/restricted roles. Do not mock away authorization or row locking.
- [ ] Commit implementation, document interfaces/query bounds/lock order and static checks in report. Root CI GREEN + independent task review; fix material findings before Task2.

### Task 2: Fast bot menu, wizard, and durable interactive delivery

**Files:**
- Create `src/telegram/game-menu.js` (callback validation/orchestration), `src/telegram/game-messages.js` (RU/EN rendering), focused `src/telegram/interactive-delivery.js` if needed to keep worker small.
- Modify `src/telegram/bot.js`, `worker.js`, `data.js`, `client.js`, `messages.js` only for integration/transport.
- Create next migration `096_telegram_interactive_delivery.js`, register, and grants as needed. May add a small current-chat-screen table and explicit outbox send/edit columns; no arbitrary Telegram-method execution.
- Tests: `test/integration/telegram-game-menu.test.js`, `test/unit/telegram-game-messages.test.js`, `test/unit/telegram-interactive-delivery.test.js`, extend actual transport/worker tests as needed.

**Interfaces:**
- Consume Task1 exact final reports/signatures.
- `game-menu.handles(action):boolean`, `game-menu.isResultMutation(action):boolean`, `game-menu.handle({client,update,person,link,user,action}):Promise<void>` (queues durable response, never calls Telegram while DB transaction open). Raw callback namespace `g:`; existing `m:games` and `/games` forward into it.
- `game-messages.renderMenu(page,locale)`, `renderGame(game,locale)`, `renderDraft(view,locale)` return existing Telegram payload shape `{text,parse_mode?,reply_markup}`; callbacks <=64bytes and text<=4096, dynamic names escaped. Large choice dictionaries paged inside same message.
- General `queueReply` behavior remains send; new `queueScreen(client,{link,chatId,targetMessageId,payload,generation,dedupKey})` records allowed send/edit and latest generation. Actual final helper name/schema is recorded for release/review.
- Early callback ACK is outside business transaction, bounded timeout, says only received. Result mutation dispatch acquires rating advisory lock before generic bot user-row locking. Command errors must not poison poll-offset progress forever.

- [ ] Tests first: one compact game-menu response instead of all game cards; callback stays inside bot; renderer and real handler walk full chosen-score flow; update ordering/success-after-commit; early ACK while data delayed; stale edit and repeated delivery. Commit RED and wait for root CI before implementation.
- [ ] Wire game menu and callbacks; show Active/All and forward/back pages, card status and correct permitted submit/review actions, existing Mini App fallback and pre-game captain pairing link. Preserve old commands/welcome/settings/unlink; no admin-only regression.
- [ ] Render complete Task1 flow with numeric grids, primary choices, progress, Back/Cancel/Edit/Extras, faction and optional fields, ties, final check, actual success state. RU/EN follow current bot preference. No mandatory text-input or web jump.
- [ ] Add safe game callback validation and bounded per-user interactive request admission suitable for a complete wizard. Avoid silently stopping a normal8+step flow under old30new-messages/min counting. Invalid or exhausted requests return useful localized errors without creating unlimited queue rows; keep Telegram send/edit rate protection.
- [ ] Deliver durable send/edit with latest-screen generation checks, retries, message-not-modified classification, inaccessible/deleted-message fallback and recorded new target. Never replay game writes when delivery fails. Serialize same-chat edits so older async sends cannot replace a later view; suppress obsolete jobs before remote calls and revalidate current link/permissions.
- [ ] Separate heavy event expansion from interactive delivery with bounded independent loops and graceful shutdown; prioritize bounded interactive work while allowing notification progress. Preserve per-chat in-flight guard, notification actuality checks,429 retry and restricted-role execution. No unbounded workers/promises or repeated full-game hydration on each numeric tap.
- [ ] Add meaningful integration coverage for wrong/stale/duplicate buttons, old message after newer draft, user identity/status changes, concurrent website writes, common errors, no duplicate result under dropped delivery, slow fan-out, throttling/fairness, deleted messages, shutdown and restricted roles.
- [ ] Static checks/self-review/commit; root current-SHA CI GREEN and independent review. Root manual screenshots of rendered message fixtures and read-only performance diagnostics, no real sends/results.

### Task 3: Verified release and performance outcome

**Files:** package/lock versions, main CHANGELOG and `docs/documentation/{ru,en}/changelog.md`; ignored operational scripts/output evidence and this plan.

**Interfaces:** Exact reviewed/tested tree, current RU/NL deployment SHA and dependency graph, normal GitHub PR/tag release. Do not reuse the previous1.5.21 helper's hardcoded baseline/version without rechecking1.5.24/live state.

- [ ] Reconcile current main and release tags, preserve unrelated changes; choose next unused version and migration numbers; add RU/EN user-visible release notes.
- [ ] Confirm exact-tree current CI including all affected root tests and whole-branch independent review. Source generation only if affected assets require it; no local automated suite.
- [ ] Prepare exact-SHA independent NL candidate and verify complete source manifest/dependency compatibility. Current dependencies may differ from old1.5.20, so compare to ACTUAL current NL baseline; install only via established process if needed.
- [ ] Verified DB backup; normal PR merge and tag-driven RU deploy; stop oldNLworker before schema/API activation; restricted-role preflight then atomically start compatible NLworker. Preserve all real games/results and one poller. No automatic DB restore on migration failure.
- [ ] Verify both domains, versions, old Mini App service behavior and new bot worker readiness/no restart loop. Publish and verify DB-backed changelog both languages/domains.
- [ ] Repeat safe read-only bounded-menu measurements from NL with same task owner; compare old5.267s first reply and ~4s data path with new bounded data path. Inspect actual existing/new timing telemetry without logging private payloads. Do not equate ACK speed with menu delivery. Report what cannot be verified without real owner interaction; no invented phone test.
- [ ] Capture reviewable RU/EN example message screens and short steps, clearly fixture data; update completed plan/evidence and final status only after checks succeed.
