# Tournament Logic Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementation was authorized by the user's follow-up; automated tests must run through CI only.

**Goal:** Устранить восемь дефектов результатов, Swiss-раундов и командных парингов, описанных в ревью F1–F8.

**Architecture:** Сохранить текущие API, canonical games, PostgreSQL-транзакции и границы сервисов. Исправить блокировки на входе в мутации рейтингов; использовать сохранённую идентичность результата; добавить проверки актуальности формы, целостности bye и командных переходов.

**Tech Stack:** CommonJS JavaScript, Node.js >=22, PostgreSQL, node:test, текущий GitHub Actions CI с PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-11-13-tournament-logic-review.md`, снимок `f1381fc7fcd4f1f3b13490c2a1c206aaa660c730`.

## Global Constraints

- `Do not run automated tests locally, including before merging into main, unless the user explicitly requests a local run.` Проверки red/green выполнять через CI для конкретного коммита. Нынешний статус CI неизвестен.
- Последующий запрос пользователя разрешил реализацию всех восьми исправлений и проверки через CI. Работать в отдельной ветке; слияние в release/main не запрошено.
- Продуктовые правила сохранить: Unranked отключает личный MMR; существующий командный MMR включает Unranked. Не менять подтверждение личных турниров, правила WTC/Classic/Doubles и разрешённые пустые слоты.
- Исторические `result_key`, `participantSnapshots`, результаты, счета и роли PostgreSQL сохраняются. Удалённый аккаунт нельзя восстанавливать присвоением старого `userId`.
- Не добавлять зависимости или миграции без необходимости. Для этих исправлений новая схема данных не требуется; `roundDraft` уже хранится как JSON.
- При отдельном запуске локального preview приложение и БД должны быть локальными, URL должен выполнять administrator autologin согласно `AGENTS.md`; session material только в ignored `work/`.

## Review Focus

1. Две мутации разных турниров и ручной replay должны коммититься без цикла блокировок и без повторного Elo — Task 1.
2. Удалённый аккаунт и заменённое турнирное место должны сохранять исторический ключ; старая форма не должна записывать результат новой игры — Task 2.
3. Нечётный раунд, включая старый JSON draft, должен сохранять единственный bye и исходные назначения — Task 3.
4. Снятый соперник участвует в исторических тайбрейках, но не в новой паре — Task 4.
5. Старые командные раунды и незавершённые выборы должны оставаться целостными при reset и замене — Tasks 5–6.

## Task 1: Единый протокол мутаций рейтингов — F3

**Files:** Create `src/db/rating-write-lock.js`, `test/integration/api-rating-concurrency.test.js`; modify `src/http/router.js`, `src/api/routes-tournaments.js`, `src/api/rating-replay.js` and the affected result/reset/delete entrypoints in `src/api/{tournaments,team-tournaments,games,admin}.js`.

**Interfaces:** Export `acquireRatingWriteLock(client): Promise<void>` using transaction-scoped `SELECT pg_advisory_xact_lock(847362960)`. Add route metadata `ratingMutation: true`. The router acquires it inside the transaction before authentication/session renewal, `authorization.authorize` and any handler row locks. Mini App game mutations carry the same metadata. Direct transaction entrypoints use the same acquisition before business locks. Keep `recalculateCompletedGameRatings(client, options)` callable within that protocol.

- [ ] Add deterministic integration cases `independent tournament results commit without rating deadlock` and `rating replay and completed result correction commit exactly once`. Use separate connections plus explicit barriers and PostgreSQL lock state; verify both responses succeed and stored results/ratings equal a serial execution of the same persisted replay order.
- [ ] Cover all entrypoints that complete, correct, reverse, remove or replay rated games: tournament submit/confirm/admin save/reset/delete; team game result/confirm/admin correction, pairing undo/reset and tournament delete; generic game submit/confirm and administrator save/confirm/delete/recalculate. Also check that a rollback releases the advisory lock and leaves no partial ratings.
- [ ] Obtain a CI failure for the regression-only change where practicable; record commit SHA and failed job/log. Do not run the cases locally.
- [ ] Implement acquisition at the outer transaction boundary and annotate the routes above. Audit transitive calls to `applyElo`, `reverseElo`, `applyTournamentElo`, `recalculateCompletedGameRatings` and `recalculateTeamRatings`. A late acquisition solely within replay is explicitly insufficient. Preserve existing row locks and request authorization.
- [ ] Check selected CI tests for the fix commit and shared guards. Reject a patch that fixes one caller but leaves another path acquiring the protocol after game/user locks. Keep commits scoped to this fix when execution is authorized.

## Task 2: Сохранённые идентификаторы и актуальность результата — F1, F2

**Files:** Create `src/api/tournament-result-context.js`; modify `src/api/tournaments.js` (`requireMatchParticipants`, `completeMatch`, submit/confirm/admin result paths), `src/api/tournament-game-details.js`, `public/app.js`; extend tournament result/identity coverage in `test/integration/api-tournaments.test.js`.

**Interfaces:** Export async `resolveTournamentResultSides(client, match, participants) -> { participantA, participantB }`. Start with existing match snapshots and overlay the game's recorded participants by `tournamentParticipantId`, preserving `resultKey`, nullable `userId`, proxy state and recorded player identity. Export `assertTournamentResultContext(body, match, sides): void`. A supplied `body.expectedGameId` must equal `match.gameId` or return 409; `body.scores` must contain exactly the two recorded result keys or return 400. Keep `expectedGameId` optional for existing API clients; the browser always sends it. An explicit score object containing zeros remains valid.

- [ ] Add `stale tournament result cannot score a replacement opponent`: open/capture A–B, edit to A–C/B–D through active-pairing API, submit captured payload. Assert 409 with `expectedGameId`, and 400 for an old-format payload missing the current opponent's key. No result/rating changes.
- [ ] Add `recreated game rejects a stale form even with identical participants`, and successful current-game submission coverage.
- [ ] Add `deleted player retains recorded score key on result correction`, deleting winner and loser in separate fixtures with distinct user/seat IDs. PATCH identical 21–14 scores through the canonical admin game endpoint; assert same winner, both scores, factions and saved keys, and null deleted `userId`. Repeat with replacement snapshots and explicit guest keys.
- [ ] Validate regressions in CI; implement the resolver and validation in every tournament result-write path, including `completeMatch`, so later code cannot derive a new key from the mutable seat. Reuse the recorded-identity pattern already present in replacement/recalculation code.
- [ ] Add `expectedGameId: match.gameId` to the tournament result form payload and require both score sides at the tournament API boundary before calling generic `calculateSubmittedResult`. `tournamentGameLike(match).id` is the match ID, so it must not be used as the canonical game ID. Do not change generic scoring defaults for unrelated callers as an incidental refactor.
- [ ] Check CI for the fix commit, including namespace-collision, proxy, replacement, guest, faction and ratings tests. Cover the second registered faction after either account is deleted, including a replaced seat. Reuse the same faction resolver in writes and canonical game forms; frozen snapshots take priority over the replacement's list. Review that historical identities confer no permissions on an unrelated account sharing an old numeric result key.

## Task 3: Целостный bye и восстановление draft — F4, F5

**Files:** Modify `src/api/tournaments.js` (`applyRoundSetupBody`, `roundDraftSetupBody`, `rollbackRoundDraft`, restored-round setup), `public/app.js` (`updateRoundSetupPlayerSelects`); extend `test/integration/api-tournaments.test.js`, `test/unit/client-tournament-flow.test.js`.

**Interfaces:** Keep public handlers and normal `matchups` payload stable. New drafts retain one slot per blueprint match (including an empty bye placeholder) and add `byeParticipantId`. Normalize existing compact drafts with one fewer matchup when an odd blueprint contains a bye. Use saved bye recipient for restored later rounds; if it is no longer eligible, return an explicit 409 instead of silently assigning another player.

- [ ] Add `bye participant cannot also occupy a regular round pairing`: five entrants and payload `[bye 5, 5–3, 2–4]` must fail without changing saved tournament state. A correct odd round must succeed.
- [ ] Add `odd Swiss rollback restores preview and exact setup`: default five-player first round, Undo, preview, regenerate. Assert identical recipient, pairings, table IDs, mission and deadline. Repeat in a later odd round and with a hand-built old compact draft lacking the new bye field.
- [ ] Obtain CI evidence for regressions. Update server uniqueness checking to reserve bye recipients before validating ordinary pairs. Keep placeholder positions during rollback; normalize legacy compact drafts on restoration. For complete old drafts without a saved recipient, infer it as the sole eligible participant missing from saved pairs before generating the blueprint. Reject ambiguous legacy data explicitly; cover a later-round legacy draft whose original nondefault bye differs from the regenerated default.
- [ ] Update UI's assigned-player set to include hidden `[data-round-bye-index]` values, disabling those IDs in ordinary pairing selects. Verify this behavior with a meaningful DOM/form fixture and preserve supported empty ordinary slots.
- [ ] Check the fix commit's selected CI tests. Review both `backet_random` and `by_tp`, even and odd fields, first and later rounds; ensure no participant receives more than one match/bye per generated round.

## Task 4: Одна историческая таблица для Swiss-посева — F6

**Files:** Modify `src/domain/tournaments/swiss.js:294-302`; extend `test/unit/pairing-mode.test.js`, `test/integration/api-tournaments.test.js`.

**Interfaces:** Keep `buildSwissNextRound(tournament, participants, matches, roundNumber, random, preferredByeId)` unchanged. Compute `buildStandings(participants, matches, tournament.tiebreakerOrder)` on the full list; then retain rows whose participant IDs are eligible. No new standings formula.

- [ ] Add `By TP retains removed opponents when ordering the next round` with exact F6 fixture: A1,E2,B3,F4,C5,D6, scores 12–10/12–8/12–8, remove E,F, criterion `vp_diff`; assert B–C and A–D, with no removed IDs.
- [ ] Add historical-opponent SoS and trimmed Buchholz fixtures, and one API removal → visible standings → next-round generation case. Assert that historical scores remain and removed players receive neither a match nor a bye.
- [ ] Check regression CI, apply the full-history-then-filter change, and verify the fix commit's CI. Retain existing minimum field validation, rematch avoidance, deterministic By TP behavior and preferred-bye policy.

## Task 5: Защитить старые командные раунды от reset — F7

**Files:** Modify `src/api/team-tournaments.js:1474-1481`; extend `test/integration/api-tournaments.test.js`.

**Interfaces:** Keep `resetMatchAdmin(context)` and its body stable. Move the existing later-round query/409 guard outside the Doubles-only branch. Use the same rule as `undoPairing`; do not automatically delete later rounds.

- [ ] Add WTC and Classic fixtures with two generated rounds. Reset the first with `confirmResultsReset:true`; assert 409 and byte-equivalent persisted match results, canonical game IDs, round statuses and audit count. Ratings remain unchanged.
- [ ] Add/retain a last-round reset success case with the existing explicit result-removal confirmation; retain Doubles protection. This tests the requested boundary rather than blocking every reset.
- [ ] Check regression CI; move the guard before any destructive work, then verify CI for that fix commit. Confirm unfinished earlier rounds can no longer be created by this route while later rounds exist.

## Task 6: Предотвратить устаревшие ссылки после замены состава — F8

**Files:** Modify `src/api/team-tournaments.js` (`updateRoster`, before ending member rows); extend `test/integration/api-team-roster-proxies.test.js`.

**Interfaces:** Add async internal `assertRosterReplacementSafe(client, tournament, roster, replacedMemberIds): Promise<void>`. Under the existing tournament lock, inspect non-resolved matches of this roster that have no personal games yet. Reject with 409 if IDs being ended occur in Shield/Sword fields or built pairings. Do not mutate selections, reset matches or rewrite historical game links automatically.

- [ ] Add `replacing a revealed Shield requires explicit pairing reset` and `replacing an environment pairing member requires explicit reset`. Assert atomic rejection: roster membership, selection IDs, revision and audit unchanged.
- [ ] Add positive paths: explicit reset to before the affected selection → replacement → complete pairing; replacement of an unreferenced member remains available; roster changes after existing game creation preserve original snapshots and apply to future games. Include slot swaps because they also replace member-row IDs.
- [ ] Check regression CI; insert the guard before all `ended_at` updates/member inserts. Reuse current team match mapping and active-member logic; keep captain checks and uniqueness errors unchanged.
- [ ] Check selected CI for the fix commit and independently review preservation of both hidden-choice privacy and existing game identities.

## Проверка и завершение будущей реализации

- [ ] Для каждой задачи получить результаты workflow `CI` именно её исправляющего SHA: `Select affected checks`, `Affected application tests`, required shared guards, итоговый `CI result`.
- [ ] При правке `src/http/router.js` или общего backend-контракта ожидаются все root service tests. Combat Lab проверяется только при затрагивании его условий отбора; изменение общих workflow также включает его. Проверять фактический план CI, не старый успешный run.
- [ ] При изменениях только этих документов CI может пропустить application tests: `scripts/ci-plan.js` исключает developer docs. Это не подтверждает ни дефекты, ни их исправление.
- [ ] Провести итоговое независимое ревью всего набора изменений против F1–F8 и пяти пунктов Review Focus. Зафиксировать оставшиеся ограничения, если любой сценарий не получил CI-подтверждения.

Рекомендуемый порядок будущей работы: Task 1 → Task 2 → Tasks 3–4 → Tasks 5–6. Большинство изменений сходится в двух API-модулях, поэтому реализацию удобнее вести последовательно, оставив независимым агентам ревью отдельных задач.
