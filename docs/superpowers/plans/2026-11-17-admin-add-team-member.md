# Administrator adds a team member

**Goal:** Let an administrator add an existing player directly to an active player team, without invitation acceptance.

**Architecture:** Reuse membership storage, administrator route authorization, the management tab and searchable player selector. Keep member and leader invitation actions available. Use a transaction and team lock for membership changes, revoke obsolete pending invitations, and audit the administrator's action.

**Constraints:** Do not run automated tests locally (AGENTS.md). Do not deploy or change production authentication. Archived teams must be restored before adding players. Former memberships remain historical records. Existing tournament rosters are unchanged.

## Implementation

- [x] Add integration coverage for administrator authorization, direct membership, duplicates, invalid inputs, archived teams, former members and pending invitations/concurrent acceptance.
- [x] Add `POST /api/admin/teams/:id/members`, creating a regular membership, revoking pending invitations and recording an audit event. Acquire team locks before invitation locks in invitation responses to avoid deadlocks with direct addition.
- [x] Add an administrator-only searchable form to the existing management panel, with submit locking, error feedback, refreshed composition and Russian/English labels.
- [x] Add client coverage for visibility, candidate filtering, request payload, refresh and retry behavior.
- [x] Review the diff and check JavaScript syntax and whitespace. Automated execution remains for CI after publication; do not claim an earlier run validates these changes.

**Verification:** `node --check` succeeded for all eight changed/new JavaScript files; `git diff --check` succeeded. Automated tests were written but not executed, following AGENTS.md. These uncommitted changes have no CI result yet.

**Review:** Independent code review identified that remote search could reintroduce existing members into the selector. Added optional exclusions to the shared remote selector, applied the current team's member IDs, and added coverage that invokes the actual remote-search callback. Syntax and whitespace checks succeeded again after this fix. No other review findings.
