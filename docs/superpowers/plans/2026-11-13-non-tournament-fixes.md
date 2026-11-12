# Non-tournament fixes implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track steps with checkboxes.

**Goal:** Correct all eight reviewed scenarios without changing tournament logic.

**Architecture:** Three independent domain tasks use the existing browser modules,
Node.js services and PostgreSQL transactions. Tests are prepared first; the
controller gates production changes on a failing exact-commit CI run and then
integrates domain fixes, generated assets and independent review.

**Tech Stack:** CommonJS Node.js, node:test, PostgreSQL, browser JavaScript.

**Spec:** ../specs/2026-11-13-non-tournament-fixes-design.md

## Global constraints

- All automated tests run in GitHub Actions CI only.
- Do not change tournament behavior, production authentication or database access boundaries.
- No new dependencies; preserve account isolation, draft tombstones and revision checks.
- Changes are on codex/non-tournament-fixes, based on release/1.5.1 at a49510e.
- Domain agents do not commit, push, run tests, regenerate shared assets or edit each other's files.

## Review focus

- Restart recovery with two independently dirty tabs and with tombstones must preserve pending edits.
- Renderer inputs at the width boundary, with explicit font sizes and legacy data, terminate.
- Late requests after logout or account switch cannot restore private notification content.
- Concurrent delivery from multiple sources uses deterministic recipient lock ordering.
- Review reconciliation retains form contents and does not silently move a rating to a new version.

### Task 1: Studio persistence, rendering and review reconciliation (findings 1, 2, 6)

**Files:** public/studio/{cloud,account,community,model,card-renderer,reviews}.js;
test/unit/studio-cloud.test.js; related renderer/review tests; new narrowly scoped
browser harness tests if existing tests cannot exercise the real flows.

**Interfaces:** Preserve KTCloud's callers and account-scoped storage. Extend the
storage adapter only as needed for durable recovery. Preserve review API contracts.

- [ ] Add failing regressions: failed local upload → another clean tab refresh →
  restart; independent pending snapshots; deleted draft; oversized stats and
  bounded direct renderer execution; review v2→v3 reconciliation for existing and
  new forms with retained text/scores and explicit version confirmation.
- [ ] Controller observes expected failures in CI before production edits.
- [ ] Implement durable recovery that a clean tab cannot erase, validate/bound
  operative rendering, and reconcile publication metadata while retaining drafts.
- [ ] Controller verifies green CI and dispatches independent task review.

### Task 2: Notification identity, watermark and shared widget (findings 3, 4, 5)

**Files:** src/api/faq.js; src/notifications/worker.js;
src/db/repositories/notifications.js; public/companion-{shell,notifications}.js;
test/integration/{api-faq,api-notifications}.test.js; shared widget browser tests.

**Interfaces:** Keep public notification endpoints/payload shape. Add an identity
event at the shared shell boundary if needed. Delivery and read-through must use
the same transaction-scoped recipient lock with deterministic batch ordering.

- [ ] Add failing regressions: read returned FAQ decision → revise → accept → new
  unread notification; concurrent delivery/read-through with real connections;
  logout, guest login and account switch with delayed old inbox replies.
- [ ] Controller observes expected failures in CI before production edits.
- [ ] Assign new per-decision identities, serialize watermark/delivery, and bind
  inbox state and pending responses to the current session identity.
- [ ] Controller verifies green CI and dispatches independent task review.

### Task 3: Training response freshness and registration conflict (findings 7, 8)

**Files:** public/training/app.js; src/api/auth.js;
test/integration/api-auth.test.js; new training browser behavior test as needed.

**Interfaces:** Keep training API payloads and registration response contracts.
Check freshness at the state-commit boundary after every bank await, without
breaking initial account/guest setup. Map only username uniqueness conflicts.

- [ ] Add failing regressions: refresh waits on bank while answer succeeds, then
  old reply completes; older catalogue/identity cannot replace current state;
  two connections register the same normalized name and return success/409.
- [ ] Controller observes expected failures in CI before production edits.
- [ ] Implement post-await freshness checks and registration conflict mapping.
- [ ] Controller verifies green CI and dispatches independent task review.

### Integration and completion

- [ ] Commit tests/spec/plan; push task branch and dispatch full CI; inspect failed
  jobs and confirm all eight regressions fail for intended reasons.
- [ ] Integrate domain fixes, run the shared asset generator (not tests), inspect
  diff and commit; dispatch full CI on the new exact SHA.
- [ ] Resolve task review findings and obtain a whole-branch review with Superpowers.
- [ ] Address substantive review feedback with additional CI RED→GREEN as needed.
- [ ] Require successful CI for the final exact SHA, open/update draft PR against
  release/1.5.1, and report remaining limitations. Do not merge automatically.
