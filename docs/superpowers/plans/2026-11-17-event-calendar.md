# Event Calendar Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Add a persistent public Kill Team calendar to the existing tournament UI, combining desktop concept 5 with mobile concept 6.

**Architecture:** A tournaments-schema table, focused validation/repository/API modules and a lazy-loaded frontend module rendered inside the existing shell. Link announcements to tournaments atomically through the existing creation endpoint.

**Tech Stack:** Node.js, PostgreSQL, vanilla browser JavaScript, existing UI-kit CSS and RU/EN dictionaries.

**Spec:** docs/superpowers/specs/2026-11-17-event-calendar-design.md

## Global constraints

- Keep existing shared navigation, header, authentication, themes and UI-kit controls.
- All announcements are Kill Team; no game-system selector.
- Only administrators mutate calendar records and create tournaments from them.
- Do not run automated tests locally; author coverage for CI. Local visual/page/API availability checks are allowed.
- Preview helpers and session material remain ignored under work/.
- Do not deploy production without an explicit deployment request.

## Review focus

- Invalid dates, decimal fees, out-of-range capacities and unknown tournament types must be rejected.
- Concurrent or repeated creation from one announcement must produce at most one tournament.
- Anonymous browsing must not reveal draft tournaments or grant mutation access.
- Month boundaries and local dates must not shift across timezones; async requests must not overwrite a newer route/month.
- Small screens, empty dates/filters and both themes must retain usable native controls and readable event details.

### Task 1: Persistence and calendar API

- [ ] Author domain and integration coverage for validation, public listing, administrator CRUD and visibility; do not run locally.
- [ ] Add migration 110 for tournaments.calendar_events with foreign keys, checks, indexes and existing service-role grants.
- [ ] Implement normalizeCalendarEvent(body), monthRange(value), repository CRUD and public/admin API routes.

### Task 2: Atomic tournament handoff

- [ ] Author coverage for linked creation, permissions, concurrent/repeated creation and tournament deletion unlinking.
- [ ] Lock an event before tournament creation and persist the link in the same transaction.
- [ ] Extend the existing admin creation panel to fetch/prefill calendar source data and submit calendarEventId. Reuse normal UI.

### Task 3: Responsive application page

- [ ] Author client route/UI contract coverage for the new calendar view, with no system selector or alternate shell.
- [ ] Add public #/calendar route and sidebar entry, load calendar module/CSS only when needed.
- [ ] Implement desktop month/list/details and mobile day-list/dialog, filters and admin editing using existing component classes.
- [ ] Add RU/EN copy; synchronize generated shared-asset version markers.

### Task 4: Verification and handoff

- [ ] Inspect the complete change with a fresh reviewer and address actionable findings.
- [ ] Verify local database identity and normal LocalPreviewAdmin session; restart only the task-owned preview.
- [ ] Inspect desktop/mobile and light/dark pages, availability, CRUD and creation handoff without running automated suites.
- [ ] Report exact validation limits and provide the authenticated local application URL.
