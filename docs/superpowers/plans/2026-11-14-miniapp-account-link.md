# Mini App Account Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Existing KT Companion users sign in and explicitly connect Telegram inside the Mini App, then open their games.

**Architecture:** Accounts verifies credentials and issues a purpose-bound, single-use proof. Tournaments validates Telegram initData and atomically consumes that proof and creates the link through narrow PostgreSQL contracts; no website session or cookie is needed. The existing Mini App bearer remains the sole persistent launch-session mechanism.

**Tech Stack:** Node.js >=22, CommonJS, PostgreSQL, vanilla JS/CSS, existing Companion UI kit and node:test in GitHub Actions. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-miniapp-account-link-design.md` (approved 2026-11-14).

## Global Constraints

- Five-minute challenge lifetime from creation; credential submission must not extend it. Random challenge/proof each >=256 bits, hashes only at rest.
- Password hashes remain in accounts; Telegram bot token remains in tournaments. Never create/expose a website session for linking.
- One website account per Telegram and one Telegram per account. No implicit replacement. Explicit confirmation required.
- Work without cookies/localStorage; keep secrets in memory and out of logs, URLs, cache, and analytics.
- Preserve active-account checks, current Telegram admin-only policy, website linking and bot behavior.
- RU/EN, light/dark, existing UI-kit tokens, keyboard accessibility, narrow screens and safe areas.
- Automated tests run ONLY in GitHub Actions per AGENTS.md. Local syntax/static/manual visual inspection is allowed. Red and green evidence must refer to the current commit, not an older run.
- Existing user authorization covers implementation and normal production rollout after verification; no further feature-choice gate. Use isolated implementers and independent review, with root coordinating CI and release.

## Review Focus

1. Lost confirmation response: re-bootstrap and accept only the expected account; do not strand a newly linked user or accept a different one (Task 2).
2. Link/unlink/password-change races: old proofs never resurrect a cancelled link, and old bearers fail after unlink (Task 1).
3. Multiple tabs and stale replies: no late credential response restores a cancelled form; a proof stays bound to its exact launch and account (Tasks 1, 2).
4. Third-party cookies/storage blocked, keyboard open, long translated account names: the flow remains usable (Task 2).
5. Accounts/tournaments real restricted roles and rolling release: no hidden superuser dependency, no old worker invalidation gap (Tasks 1, 3).

---

### Task 1: Secure cookie-independent linking backend

**Files:**
- Create `src/db/migrations/092_miniapp_account_link.js`, `src/telegram/miniapp-link.js`, `src/api/miniapp-account-link.js`, `src/domain/miniapp-link-security.js`.
- Modify `src/db/migrate.js`, `scripts/provision-service-roles.js`, `src/api/auth.js`, `src/api/routes-accounts.js`, `src/api/miniapp.js`, `src/api/telegram.js`, `src/telegram/bot.js`, `src/email/service.js`, `src/http/router.js`.
- Tests: create `test/integration/api-miniapp-link.test.js`, `test/integration/miniapp-link-roles.test.js`; extend existing auth/Telegram tests only where required.

**Interfaces:**
- Unlinked `POST /api/miniapp/session {initData}` retains `authenticated:false, reason:'not_linked', locale`; adds `link:{challenge,expiresAt,telegram:{id:string,username:string|null,displayName:string}}`.
- `POST /api/auth/telegram-link {challenge,name,password}` returns `{account:{id:number,name:string},telegram:{id:string,username:string|null,displayName:string},proof:string,expiresAt:string}`. No cookie or general bearer.
- `POST /api/miniapp/link/confirm {challenge,proof,initData,locale}` returns the same authenticated shape as `/session`, including user, locale, accessToken, expiresIn.
- `POST /api/miniapp/link/cancel {challenge,initData}` returns `{ok:true}` even for an already expired/cancelled matching flow; never affects another flow.
- `src/api/auth.js` exports `verifyCredentials(client, body)` reused by ordinary login and new accounts endpoint; website session behavior remains in ordinary login.
- `src/telegram/miniapp-link.js` exports `createChallenge(ctx,person):Promise<link>`, `confirm(ctx):Promise<HTTPResult>`, `cancel(ctx):Promise<HTTPResult>`.
- `src/api/miniapp-account-link.js` exports `login(ctx):Promise<HTTPResult>`.
- `src/domain/miniapp-link-security.js` exports JSON/body/origin validation and `checkRequest(client,req,body,kind)` for persisted preflight budgets outside the business transaction; shared module must not import Telegram config/token into accounts.
- Stable error messages for frontend mapping: `Invalid name or password`, `Telegram linking expired. Sign in again.`, `This account is already linked.`, `Too many linking attempts. Try again later.`, `Invalid origin`. Existing expired-initData and suspension messages remain supported.

- [x] Write integration tests first, asserting these public contracts with fake Telegram signatures and dedicated test users. Minimum red: unlinked session has a challenge; password step creates no link/cookie; explicit confirmation issues a usable bearer; wrong-password is 401.
- [x] Commit tests alone, notify root and STOP product-code edits until root supplies failing CI evidence. Root opens draft PR and records the intended assertion failures (not harness errors).
- [x] Implement the database table/contracts and route wiring. Table lives in accounts, no direct tournament-role access. Fully qualified SECURITY DEFINER functions use fixed safe search_path and revoke PUBLIC EXECUTE; provision only necessary grants. Accounts updates proof under user-then-flow locking; tournaments inspects to find user, locks, rechecks and consumes transactionally.
- [x] Implement challenge admission limits: IP 90 per 15 minutes; verified Telegram 10 per five minutes; max three live flows per Telegram. Credential preflight budgets: IP 90 per 15 minutes, challenge five per five minutes, normalized identifier ten per 15 minutes, before scrypt and committed outside failing transactions. Retain existing failed-auth IP limiter. Use bounded shared DB budgets with fixed policies, not caller-selected arbitrary table access; clean expired records in the same maintenance/admission path. Validate origin/JSON before spending, bound all inputs. Limit checks for confirm/cancel: IP 90 per 15 minutes.
- [x] Preserve existing username/verified-email/dummy-scrypt/active-account semantics. A successful credential step binds an unbound flow exactly once; retry requires a fresh flow. Fixed five-minute expiry and exact initData digest binding survive all steps. Invalid proofs cannot reveal account information. Clear user secrets from errors.
- [x] Enforce lifecycle invalidation on website/bot unlink, either linking path, password reset/change (including admin reset) and account deletion. Use consistent locking; reject conflicting identities with 409, retain unique constraints. Successful link invalidates pending flows for both identities and old website tokens, queues exactly one existing welcome, then issues the existing Mini App bearer. Existing bearer checks remain unchanged.
- [x] Extend tests for verified email, blocked account/admin policy, bad origin/missing Origin/JSON, tampered/expired initData, mismatched Telegram/digest/proof, proof replay, cancellation, lost-response re-bootstrap, expired flow, concurrent competing confirms/unlink/password changes, and rate budgets surviving failure rollback/new challenges. Verify no website session exists.
- [x] Add real-role integration checks: accounts verifies passwords but lacks bot secret; tournaments cannot select flow/password tables and can invoke only narrow grants. Exercise actual split services or their restricted-role handlers, not just superuser SQL. Include regression of ordinary login and website linking.
- [x] Self-review and commit implementation. Root runs CI at this SHA, diagnoses any failures, and dispatches independent task review. Fix all material findings before Task 2.

### Task 2: Inline login and explicit confirmation UI

**Files:**
- Modify `public/miniapp/app.js`, `public/miniapp/app.css`, `public/miniapp/i18n.js`, `public/miniapp/index.html` only if needed.
- Modify `src/telegram/messages.js` and its welcome tests to explain inline linking while keeping website fallback.
- Create `test/unit/miniapp-link-ui.test.js`; use existing VM/browser harness patterns without new dependencies. Keep visual runtime under ignored `work/` and screenshots under ignored `outputs/`.

**Interfaces:** Consumes Task 1's exact endpoint contracts. Login stages are `credentials`, `confirm`, `submitting`; existing authenticated state/navigation remains authoritative. Add a small separate `public/miniapp/link-flow.js` only if needed to keep async flow independently testable, exposing the minimal state/transport interface used by app.js; document its exported interface in the task report.

- [ ] Write behavior tests first: credential request uses `credentials:'omit'`; confirmation is explicit; cancel/sequence discards late replies; wrong password stays on form and clears input; lost confirmation response accepts only expected account from session; proof/password never enter storage or URLs. Add expected RU/EN strings to failing tests. Commit red and wait for root CI evidence before implementing.
- [ ] Replace the unlinked website-only prompt with spec's credential form, then confirmation showing escaped verified Companion and Telegram identities. Use autocomplete username/current-password, native form submit, show/hide password, progress/disabled controls, useful inline error announcements, and focus management. Clear raw password after submission and on exit; no password in rerender state.
- [ ] Add distinct accounts request path with omitted cookies and strict JSON. Store challenge/proof in memory only, enforce expiration, clear on cancel/success/identity change, reject stale async completions. Back invokes cancellation and fresh bootstrap. Confirmation cannot be cancelled or submitted twice while in flight; recover uncertain outcome via session check.
- [ ] After new linking, default to `#match` (My games), preserving supported explicit game/tournament launch destination. Existing already-linked default behavior remains. Browser fallback without initData remains available; do not render a fake Telegram link form.
- [ ] Add exact spec's RU copy and natural EN translations; map stable backend failures contextually. Reuse Companion tokens/components, safe insets, 44px minimum targets, responsive form widths and visible focus. Before link use validated Telegram locale, after link server bot preference.
- [ ] Cache-bust changed Mini App JavaScript references in index.html. Run the existing `npm run assets:sync` generator after CSS changes and include its generated URL revisions / `src/http/shared-assets.json`; these necessary generated edits may span other public files. Do not hand-edit shared hash values. This generator is not an automated test.
- [ ] Update welcome copy: existing account can connect inside Mini App, with website still available; do not remove functions/menus or send real bot messages.
- [ ] Root runs current-SHA CI. Manually inspect real page assets using deterministic local fixture responses at 320/390/430/768px, RU/EN and both themes, long names, keyboard-sized viewport, cookies/storage blocked, expired/conflict/network states. Record screenshots and limitations honestly; don't claim a real Telegram-device test from a browser fixture.
- [ ] Commit, self-review, independent task review, fix material issues.

### Task 3: Release and production verification

**Files:** `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/documentation/{ru,en}/changelog.md`, this plan; scoped operational scripts under ignored `work/`.

**Interfaces:** Tested candidate commit; standard GitHub PR/CI/tag deployment, existing NL systemd worker and shared DB. Determine next version from current main/production before release (baseline 1.5.20).

- [ ] Reconcile latest origin/main without dropping concurrent work; choose next unused version. Add matching RU/EN public release notes and update package version/lock.
- [ ] Run current exact-commit GitHub CI and whole-branch independent security/quality review. Tests are CI-only; root records run URLs, outcomes, review fixes, and final SHA. Verify frontend assets and git diff checks.
- [ ] Prepare exact-commit NL candidate and read-only preflight using existing restricted worker identity. Inspect existing standard release scripts; no credentials in logs. Snapshot release pointers and perform normal database backup. Preserve all existing user data and links.
- [ ] Prevent old-worker invalidation gap: stop old NL worker before the DB/API activation, keep it stopped through migration and restart only with the compatible candidate. If needed stage new feature behind default-off config during rollout; do not deploy a new confirmation endpoint while old unlink remains active. Use normal PR merge and release tag workflow, respecting its migration/rollback behavior.
- [ ] Verify both domains and version, new endpoint validation, unchanged old linking routes, service health, one poller only and no worker restart loop. Use read-only invalid/anonymous requests, not real password guesses/account mutations. Record any real Telegram client validation still requiring user action.
- [ ] Publish and verify DB-backed RU/EN changelog on both domains preserving older/editorial content. Update the announcement instructions if they still require website-only linking; capture new screens from actual shipped assets with clearly labelled fictional accounts.
- [ ] Mark plan done only after relevant CI, review, deploy and public changelog checks succeed. Final answer gives new user steps, release result and any concrete limitation.
