# Tournament calendar synchronization

Goal: dated tournaments create one calendar event, and changing the tournament start moves the existing linked event. Keep all work local; do not run automated tests locally.

Agreed behavior: automatic drafts are administrator-only, published events are public, and an undated tournament appears when its start is specified. Existing independent announcements remain independent and public, including when linked to a draft. Existing links must be reused.

Implementation choices: store the browser's IANA time zone on the calendar event so converting the tournament's UTC timestamp preserves the date/time entered in the form. API callers without a zone reuse the saved zone or UTC. Keep unknown location, fee and capacity unspecified instead of inventing values. Preserve announcement information when moving a linked event. Use the unique tournament_id constraint and the existing request transaction for atomicity.

- [x] Add integration scenarios for direct creation, unpublished visibility, moving across month boundaries, linked announcement preservation/no duplicates, no date, and repeated saves. Authored for CI without a local test run.
- [x] Add migration 113: automatic source and time zone, support unspecified metadata for generated announcements and temporarily undated linked events. Preserve manual announcement validation.
- [x] Add calendar repository synchronization called by tournament creation/date changes. Reuse links and preserve existing announcement fields. Publication changes visibility through the existing joined status, without rewriting an unchanged schedule.
- [x] Send the browser time zone with start edits; render unspecified automatic metadata explicitly in both locales. Keep current UI kit.
- [x] Check syntax/diff and local page/API availability, inspect desktop/mobile preview with automatic administrator login, request scoped review. No push or production deployment.

Verification: local migration applied; actual create form produced a linked event, a midnight Moscow date stayed on the intended day, date autosave moved the same event ID from December to November with no old-month duplicate, and editing its title retained null fee. A separate automatically generated draft was present for LocalPreviewAdmin and absent for an anonymous API request. Desktop/mobile screenshots and inspection report are under outputs/calendar-sync-2026-11-17. Focused review found two issues (unchanged timestamps from another timezone; incomplete metadata editing); both corrected and re-reviewed. Automated tests remain unrun as required by AGENTS.md; changes remain local.
