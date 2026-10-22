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
| Фрешблад | 600 |
| Середняк | 2400 |
| Знаток киллтима | 5400 |
| Потнич | 9600 |
| Судья | 15000 |

The first **two** correct answers to each question each earn `difficulty × 10`
XP. A question is reinforced after two correct answers. Later correct answers
earn no more XP; mistakes never remove XP. With the full 300-question curriculum,
reinforcing every question gives 15,000 XP. The 200 reviewed additions are included.
Questions under review remain part of the curriculum but are not drawn in sessions.
Deleted questions leave the curriculum; thresholds use 0 / 4 / 16 / 36 / 64 / 100%
of its current maximum. Existing checked answers are never rescored after an edit.

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

The seed contains 300 Russian questions, 75 per difficulty, with explanations
and links to rule sources. Sessions contain 20 distinct random questions from
one difficulty or the whole bank; answer order is shuffled once and saved.
The bank, sources and training sessions are available without signing in.
`guest-progress.js` saves guest sessions, answers and progress in localStorage,
separately from account progress. Web Locks serialize writes across tabs; stale
revisions are rejected. Compatible bank updates preserve guest progress and history. If
browser storage is unavailable, the UI indicates that progress is limited to
the current tab. Signing in starts the account workflow without importing
untrusted browser results or awarding server achievements for them.

## Account progress

Startup migration `056_training_progress` creates `training_profiles` and
`training_sessions`, both owned by `users.id` with cascading account deletion.
There is one active session per account. Each checked answer, cursor movement,
completed session and early replacement is saved in a transaction.
The server chooses questions and calculates correctness; the client submits
only the chosen option, question id, content version, session id and expected profile revision.

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

## Slop reports and moderation

Migration **062_training_moderation** seeds a durable PostgreSQL question catalogue
from the JSON bank, creates its revision counter and appends an editorial event
log. Later moderator edits live in the database and survive process restarts.
Changing the seed JSON alone does not overwrite the live catalogue. Migration
062 queues kt-083 and kt-086 from the user's screenshots for review.

An authenticated Companion player can select **Слоп** during a question, in its
answer review or in the bank. An optional comment accompanies the report. The
report transaction changes the question to review immediately; no moderator
approval is needed for withdrawal. Guests can train, but must sign in to report.

The **Модерация** tab is visible only to administrators; its API independently
requires administrator rights. Administrators can filter by review/active/deleted,
search by ID or wording, edit the question, four options, correct option, difficulty,
topic, explanation and source, and leave comments on the whole question.
Save changes keeps the question out of the pool; Return to pool saves and publishes
it; Delete archives it outside both the pool and the curriculum. The deleted
filter retains the editorial history and allows restoration. Comments are private
to administrators. The public bank includes status and content for historical
rendering, but session generators draw only active questions.

Every report/edit transaction locks the bank before any account profile. Starts
and answers take a shared lock in the same order. Thus an answer after a report
commits cannot score the withdrawn question. Reports carry an idempotency UUID;
replaying an acknowledged report after restoration does not withdraw it again.
Moderation writes require the question revision to prevent lost edits between
administrators, and all writes use the existing account/CSRF/Origin checks.

Session items carry a full question snapshot and content version. Migration 062
pins existing account history. Changes replace unanswered withdrawn questions
with unused active questions of the session's difficulty, including guest sessions
after bank refresh. A changed content version is refreshed before grading. When
no replacement exists, the slot is skipped without a wrong answer or XP penalty.
New sessions still require 20 distinct available questions. Checked snapshots and
stored correctness remain unchanged, including after deletion. Guests refresh
the catalogue online before writes so an old browser pool cannot keep scoring
withdrawn questions. A revision query avoids re-downloading unchanged content.

| Method and path | Purpose |
| --- | --- |
| POST /api/training/questions/:id/report | Report and withdraw; signed-in player |
| GET /api/training/moderation | Administrator queue and status filters |
| GET /api/training/moderation/:id | Editable content and editorial history |
| POST /api/training/moderation/:id | save, restore, delete or comment; administrator |

The split tournament service reads the public question projection for the evolving
achievement; migration 062 and service-role provisioning grant this read-only
access without exposing report comments. No production database is used for local
preview checks. Automated coverage is in api-training-moderation.test.js and runs
in GitHub Actions; AGENTS.md prohibits local automated test runs.
