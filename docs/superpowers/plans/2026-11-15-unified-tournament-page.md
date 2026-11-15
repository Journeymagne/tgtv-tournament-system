# Unified Tournament Page Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user approved independent inline execution of the design.

**Goal:** Open and edit every tournament on its canonical public page with consistent presentation and role-specific controls.

**Architecture:** Keep the shared tournament renderer and existing administrative components. Authorized viewers load administrative detail on the canonical route; administrative mutations refresh that route. Legacy administrative detail routes resolve to the canonical page.

**Tech Stack:** Plain browser JavaScript, CSS, existing Node.js regression tests and GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-15-unified-tournament-page-design.md`

## Global Constraints

- No new dependencies or changes to server authorization.
- Do not run automated tests locally, per AGENTS.md; write regression coverage for CI.
- Local preview requires a local database and reusable administrator autologin in ignored `work/` files.
- Preserve unrelated workspace changes.

## Review Focus

- Guests and ordinary users never receive administrative detail or controls.
- Assigned managers retain editing without global administrator privileges.
- Switching tournaments during requests never displays the previous tournament.
- Autosave, round actions and live refresh retain the canonical route and active tab.
- Old administrative links, browser Back and mobile navigation remain usable.

### Task 1: Unify presentation

**Files:** `public/app.js`, `public/styles.css`, `test/unit/client-tournament-preview.test.js`, `test/unit/client-tournament-presentation.test.js`.

**Interfaces:** `tournamentCompactHeaderMarkup(data, options)` always shows the same facts; `tournamentInfoTabDefinitions(data, options)` extends the public tabs with authorized management tabs.

- [x] Add regression assertions for shared header content and public tab order in management mode.
- [x] Remove role-specific compact header and tab layout overrides; retain management tab content and responsive wrapping.
- [x] Inspect syntax and patch formatting; defer automated execution to CI.

### Task 2: Edit on the canonical page

**Files:** `public/app.js`, `public/admin.js`, `test/unit/client-tournament-edit.test.js`, `test/unit/client-tournament-live.test.js`.

**Interfaces:** `openTournamentEditor(id)` opens settings on `/tournaments/:slug`; canonical route data loading selects administrative detail only for authorized viewers. Existing admin mutation render calls stay on the current canonical tournament.

- [x] Add regression cases for on-page settings, authorization, load failures, stale navigation, legacy links and management live refresh.
- [x] Integrate administrative data and controls into the existing canonical renderer; avoid duplicate event registration.
- [x] Make legacy administration entry points and post-mutation rendering resolve to that renderer without returning through the admin list.
- [x] Preserve active tab, selected tournament, normal viewer actions and browser navigation; invalidate obsolete requests.
- [x] Inspect syntax and patch formatting; defer automated execution to CI.

### Task 3: Review and preview

**Files:** ignored `work/` runtime helpers and review artifacts; relevant source/test files for fixes.

**Interfaces:** A loopback-only preview with a local PostgreSQL database and a normal administrator session.

- [x] Review the whole change against the approved spec and review focus, using a fresh reviewer.
- [x] Inspect existing local runtime and reuse a safe local database; configure ignored autologin helper if a preview can be started.
- [x] Visually check desktop/mobile tournament view, Edit/settings, management controls, ordinary access and page/API availability.
- [x] Report exact validation and any unavailable CI or preview checks; do not claim tests passed without a run for this change.

### Task 4: Review pending results directly from every tournament match list

**Files:** `public/app.js`, `public/admin.js`, `src/api/tournaments.js`, relevant client and tournament API regression files.

**Interfaces:** Team previews expose only authorized pending-result review and reuse `wireTeamGameResultButtons(root)` with the full pairing workspace. Solo administration opens the existing `renderTournamentResultReview(data, match)`; its confirm/reject API recognizes existing tournament management rights.

- [x] Author coverage for all formats, non-managers, non-pending games, direct review navigation and stale requests; preserve player self-review restrictions.
- [x] Add team preview review buttons and shared handlers; add solo review buttons and management authorization to existing result endpoints.
- [x] Inspect syntax and obtain static review; do not run automated tests locally.
- [x] Inspect local administrator/judge/ordinary-user views and direct review in Chrome; confirm local page and `/api/me` readiness.
