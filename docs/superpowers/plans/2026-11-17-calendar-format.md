# Calendar Format Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the following tasks inline.

**Goal:** Match calendar event participant settings to tournament creation: Players/Teams, Swiss rounds and team size.

**Architecture:** Retain legacy solo/teams/pairs storage for compatibility, expose participantMode and add persisted swissRoundCount/teamSize. Derive the legacy type from the new mode and size. Existing announcements and tournament links remain intact.

**Tech stack:** Existing Node/PostgreSQL, vanilla client and Companion UI kit.

**Spec:** User's 2026-11-17 request and screenshots in this chat.

## Constraints

- Only local work; no push, PR or production deployment.
- Do not run automated tests locally; author coverage and use permitted preview inspection.
- Preserve unrelated ongoing WTC Doubles changes and migration 111.
- Teams support 2 or 3 players, matching existing tournament formats. Event capacity remains a player count and converts to roster count when creating a tournament.
- Use migration 112; leave migration 110 unchanged after application.

## Review focus

- Legacy pairs map to team size 2, teams to 3, solo to individual with no team size.
- Missing legacy rounds default to 3; linked events inherit existing tournament rounds during migration.
- Invalid modes, fractional/nonpositive rounds and unsupported team sizes reject cleanly.
- Changing back to Players clears/disables team size and preserves the player's registration limit.
- Calendar filters combine both team sizes under Teams, and tournament creation receives the saved round count.

### Tasks

- [ ] Author domain/repository integration coverage for mode, rounds, size and legacy compatibility without running locally.
- [ ] Add migration 112; extend calendar normalization, repository and tournament defaults.
- [ ] Replace three-way type selection with existing Players/Teams labels, rounds input and conditional team-size select. Update filters and cards.
- [ ] Inspect ordinary admin preview on desktop/mobile, persistence and tournament form handoff. Refresh only task-owned server and verify normal local administrator session.
