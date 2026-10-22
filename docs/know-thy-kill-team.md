# Know Thy Kill Team

`/knowthykt` adds the rules trainer to the Companion home menu. `/training`, `/training/`,
`/training/index.html` and `/know-thy-kill-team` redirect to the canonical page.
The `knowthykt` process uses its own PostgreSQL schema and the shared Companion
`sid` session. The compatible monolith also serves it. No frontend build is required.

## Personal journey and evolving achievement

The trainer opens on `#journey`: an interactive six-rank route, the current
achievement, XP to the next rank and practice recommendations. `#training`
retains difficulty selection, and `#progress` retains detailed statistics.

| Rank | XP |
| --- | ---: |
| Нубик | 0 |
| Фрешблад | 200 |
| Середняк | 800 |
| Знаток киллтима | 1800 |
| Потнич | 3200 |
| Судья | 5000 |

The first **two** correct answers to each question each earn `difficulty × 10`
XP. A question is reinforced after two correct answers. Later correct answers
earn no more XP; mistakes never remove XP. With the current 100-question bank,
all questions reinforced twice gives 5,000 XP. Only current bank question IDs
count. The 200 review candidates remain outside the active bank and progression.

`public/training/progression.js` is the shared browser/server calculation,
called by the server through `src/domain/training-progression.js`.
It derives credit from existing `training_profiles.stats`, including earlier
answers, without rewriting history, a new migration or additional awards rows.
Question bank changes must review progression thresholds as well as bank version.

The shared `journey-ui.js` / `journey-shared.css` achievement shows the current
rank, evolving emblem and progress bar on the journey, session results, player
profiles and the achievements catalogue. The catalogue uses the signed-in
player's progress; a guest sees the starting achievement. Team achievements and
Hall of Fame remain separate.

`GET /api/training/progress` includes `state.journey`. Public
`GET /api/achievements?userId=…` adds `trainingAchievement` with aggregate XP,
rank, next rank and solved/reinforced counts. It never exposes answer details,
session history, CSRF tokens or individual answer timestamps. The separate
computed achievement cannot be manually awarded, edited or deleted through
the existing achievement-ID endpoints.

An open profile refreshes its achievement panel through the existing live
refresh controller every 20 seconds and on focus/visibility changes, without
replacing profile forms. The trainer retains its existing account/revision
checks and refresh behavior.

The trainer retains 100 Russian questions, 25 per difficulty, with explanations
and links to rule sources. Sessions contain 20 distinct random questions from
one difficulty or the whole bank; answer order is shuffled once and saved.
The bank, sources and training sessions are available without signing in.
`guest-progress.js` saves guest sessions, answers and progress in localStorage,
separately from account progress. Web Locks serialize writes across tabs; stale
revisions are rejected. A bank version change resets the guest snapshot. If
browser storage is unavailable, the UI indicates that progress is limited to
the current tab. Signing in starts the account workflow without importing
untrusted browser results or awarding server achievements for them.

## Account progress

Startup migration `056_training_progress` creates `training_profiles` and
`training_sessions`, both owned by `users.id` with cascading account deletion.
There is one active session per account. Each checked answer, cursor movement,
completed session and early replacement is saved in a transaction.
The server chooses questions and calculates correctness; the client submits
only the chosen option, question id, session id and expected revision.

Reads and writes lock the same account profile. Stale writes receive HTTP 409
and the client fetches the current state. Retrying the same start, answer or
advance does not duplicate results. Another device receives changes on focus,
returning online, page restore, or a 20-second foreground refresh.
An unconfirmed network request leaves the answer selectable for retry. There
is no offline upload queue and no **account** progress stored in localStorage.

All authenticated requests include `X-Training-Account`, checked against the
current session. Writes also require a session-bound CSRF token and validate
Origin when present. Access is scoped by authenticated user in every query;
no client-selected user id can read or change another player's progress.
The common shell reloads the trainer when login or account identity changes.

The progress page shows lifetime totals and the latest 100 finished or abandoned
sessions. All sessions remain in PostgreSQL. Active-session cursor and answer
order persist across devices. Progress from the old standalone browser-only
trainer is not automatically imported into an account.

## HTTP endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/training/questions` | Public versioned question bank |
| `GET /api/training/progress` | Account state and CSRF token |
| `POST /api/training/sessions` | Start or explicitly replace the active session |
| `POST /api/training/sessions/:id/answers` | Check and save the current answer |
| `POST /api/training/sessions/:id/advance` | Advance after review or complete the session |

API responses are not cached. Mutation request bodies are limited to 4 KiB.

## Presentation and content maintenance

`public/training/index.html` loads the shared Companion shell, theme tokens,
base components and language controls. Local CSS supplies quiz-specific layout
and states using those same colors and typography. The authored question bank
remains Russian when switching shared interface language.

The bank is `src/training-data/questions.json`; provenance is recorded in
`foundation-sources.md` and `advanced-sources.md` beside it. It is the verified
2026-10-15 snapshot of Kill Team 2024, not a live rules feed. Special mission
packs and killzones are named in the questions. This is a selected training
course rather than all faction rules.

Keep question ids stable. Corrections to meaning, options or answer indexes
must bump `BANK_VERSION` in `src/domain/training.js` and include a migration
or compatibility policy for existing sessions. The API rejects new answers
to a session from a different bank version; the player can start a new one.
Historical answer indices depend on their original question text.

## Local verification

Use an isolated local PostgreSQL database and the normal application account
flow. Follow `AGENTS.md` for administrator autologin when handing over a preview.
Any local launcher and session credentials belong in ignored `work/` files.
Never copy the preview autologin helper into production.

The 2026-10-16 integration was checked through local page/API interactions:
separate sign-ins for the same player resumed one saved session; another player
had independent progress; a lost connection allowed retry; repeated requests
did not duplicate answers; stale revisions, invalid CSRF and cross-account
session access were rejected. Shared light/dark themes and narrow layouts were
inspected. Automated test suites were not run, as required by `AGENTS.md` for
routine edits outside a merge into `main`.

The journey update was checked with a separate local preview player: completing
a session unlocked Freshblood and updated an already-open profile; retrying an
answer did not duplicate XP; third correct answers were capped; mistakes kept
XP; previous answers contributed to the computed rank. Read-only calculation
review confirmed the 5,000 XP cap and terminal Judge state. Desktop/mobile
layouts, light/dark themes, rank selection and account isolation were inspected.
