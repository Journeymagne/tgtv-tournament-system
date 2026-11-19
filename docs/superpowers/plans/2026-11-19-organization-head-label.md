# Organization head label

> Execution: inline, using superpowers:executing-plans; one final code review.

**Goal:** Show «Руководитель организации» / “Organization head” for the current organization owner, as clarified by the user on 19 November 2026.

**Architecture:** Derive `hasOwnedOrganizations` from `tournament_providers.owner_user_id` in the existing user-list query. Include organization owners in the existing special-user filter before pagination. Pass the flag through the administrator API and use it in the role summary. Keep tournament ownership and all permission checks intact.

**Stack:** Node.js, PostgreSQL, vanilla JavaScript, RU/EN dictionaries.

## Constraints

- No database migration or new assignable global permission.
- Preserve the earlier removal of the misleading tournament-owner badge.
- Existing `AGENTS.md` prohibits running automated tests locally; update coverage for CI, use syntax and asset checks locally.
- Preserve historical release notes and earlier UI changes in the parent workspace.

## Steps

- [x] Extend existing role-summary coverage and provider-access integration coverage.
- [x] Add the derived organization ownership flag to `src/db/repositories/users.js`, `src/api/admin.js`, and `public/admin.js`.
- [x] Rename the organization owner's title and related current UI/error copy in RU/EN.
- [x] Synchronize asset versions, inspect rendered role summaries, and check syntax/diffs.
- [x] Obtain a fresh code review and commit on the existing isolated branch.

## Review focus

- Organization owner without personal tournaments or global creation rights still appears in the special-user list.
- Owning a tournament or merely organizing an organization's events does not produce the organization-head badge.
- Transferred ownership immediately moves the badge from the previous head to the new head.
- Archiving retains the owner's leadership and restoration rights.
- Filtering and pagination totals include the same users as the displayed rows.

## Verification record

- Independent code review: no actionable findings; SQL schema privileges and transfer/archive fixture assumptions checked.
- Browser inspection: current role helper and dictionary output rendered at 390 and 1125 px in RU/EN and dark/light themes; no horizontal overflow.
- JavaScript syntax, shared asset consistency, and whitespace checks passed.
- Automated tests updated for CI and not executed locally, as required by `AGENTS.md`.
