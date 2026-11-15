# Tournament Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish tournaments only through an organizer action and display the approved results with downloadable PNG.

**Architecture:** Retain the transactional standings-publication endpoint. Share readiness rules between API and browser through a pure UMD module, and share a results model between accessible HTML and dependency-free canvas export. Reuse existing personal standings and official published places.

**Tech Stack:** Node.js, PostgreSQL, plain browser JavaScript/CSS, Canvas, node:test, Playwright for visual inspection.

**Spec:** `docs/superpowers/specs/2026-11-16-tournament-results-design.md`

## Global Constraints

- Do not run automated tests locally; write regressions first and validate through CI on the exact branch commit.
- Preserve existing corrections of completed Doubles results and internal republication.
- Use the existing UI-kit tokens and controls, support Russian/English and both themes.
- Do not deploy production or change production authentication.

## Review Focus

- Empty, missing, draft, or not-yet-generated rounds cannot enable completion.
- Delegated judges, unrelated organizers, and participants cannot close the event.
- Published ordering and tied personal first places survive display/export without mutation.
- Long names, HTML-like names, small events, and missing identities remain readable and safe.
- Download failure restores the button; completed historical events and corrections keep working.

### Task 1: Readiness and explicit organizer completion

**Files:** `public/tournament-results.js`, `src/api/tournaments.js`, `src/api/team-tournaments.js`, `src/domain/access.js`, relevant unit/integration tests.

**Interfaces:** `TGTVTournamentResults.isReady(data)` consumes tournament/rounds/matches. `canFinishTournament(user,tournament)` controls server and viewer permissions. Existing `POST /api/admin/tournaments/:id/standings/publish` remains the only completion action.

- [ ] Write regressions for readiness, last-result staying live, owner-only completion, duplicate/premature requests, and persisted publication.
- [ ] Implement readiness and authorization guards without changing match-to-round completion.
- [ ] Validate the new cases and existing correction flows in CI; no local test command.

### Task 2: Approved results model, page and PNG

**Files:** `public/tournament-results.js`, `public/tournament-results.css`, `public/app.js`, `public/admin.js`, `public/index.html`, `public/i18n/{ru,en}.js`, client unit tests.

**Interfaces:** `buildModel(data)` produces top-ten published entries and personal winners. `render(data,{t,...})` produces escaped markup. `download(data,{t,...})` renders the same model to PNG. `wireTournamentResultsControls` binds public/admin completion/export.

- [ ] Write behavioral model/render/export regressions for canonical ranks, tied winners, unsafe/long names, smaller events, and error recovery.
- [ ] Add the responsive UI-kit result layout, completed overview/results tab, ready banner and organizer button.
- [ ] Wire confirmation, submission busy state, results navigation and PNG download. Add both locale dictionaries.
- [ ] Regenerate shared asset hashes with `node scripts/sync-shared-assets.js`.

### Task 3: Review and delivery

**Files:** Test fixes if required; ignored `work/` evidence.

- [ ] Inspect actual result markup and export in Playwright at desktop/mobile widths and both themes; inspect exported PNG.
- [ ] Review the diff for access, stale state, official ordering, overflow and lifecycle regressions.
- [ ] Commit only this feature, push its branch, create a draft PR, and inspect current-commit CI. Diagnose failures from job logs and resolve.
- [ ] Report the delivered behavior, PR and actual verification result; do not merge or deploy without a request.
