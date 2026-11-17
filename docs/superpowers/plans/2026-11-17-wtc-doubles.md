# WTC Doubles Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. User has approved the design and requested immediate implementation plus a local eight-pair preview.

**Goal:** Add WTC Doubles with TTS guided pairing, IRL manual entry and a ready local administrator preview.

**Architecture:** Extend existing team tournament infrastructure with an isolated two-player pairing state machine. Reuse normal games, rounds, snapshots, permissions and scoring conversion; distinguish WTC Doubles from existing Doubles throughout.

**Tech Stack:** Node.js, PostgreSQL, vanilla browser JavaScript, existing node:test CI harness.

**Spec:** `docs/superpowers/specs/2026-11-17-wtc-doubles-design.md` (approved 2026-11-17).

## Global Constraints

- Exactly two players and two personal games; four missions per round.
- TTS: two shared tables and guided pairing. IRL: two tables per match and manual entry.
- Team GP thresholds: 0–17 loss, 18–22 draw, 23–40 win; TP 0/1/2.
- Fixed ordering: team TP, individual wins, mean SOS, total VP, raw Tac Op.
- Preserve existing formats and unrelated working changes. No local automated tests. No production changes or push without authorization.
- Preview uses only verified local app/database and normal administrator session, with runtime/session material under ignored `work/`.

## Review Focus

- Tables chosen before opponents must follow the selecting side's own players.
- Changing venue must derive valid captain pairing settings and preserve preparation guards.
- Partial matches and withdrawn opponents must not distort official standings or mean SOS.
- Undo/reset must clear dependent selections and protect existing results/later rounds.
- Manual form and guided actions must reject stale writes and duplicate game creation.

### Task 1: Domain and validation

Files: `src/domain/wtc-doubles.js` (new), `src/domain/team-tournaments.js`, `src/domain/tournaments/constants.js`, `src/domain/tournaments/input.js`, `test/unit/wtc-doubles.test.js` (new).

Interfaces: `wtcDoublesNextAction(match)` and `applyWtcDoublesSelection(match, body, membersA, membersB)` implement deterministic guided choices stored in `match.environment.wtcDoubles`; return next environment/pairings and completed assignments. Existing `teamSizeFor`, `teamPointsForMatch`, `teamStandings`, `normalizeRoundMissions` recognize `wtc_doubles`.

- [x] Write CI regression cases for both initiative sides/rights, table-first mapping, mission availability, GP boundaries and standings/SOS.
- [x] Implement pure state machine, two-player helpers, fixed standings and create/edit/publish/faction validation.
- [x] Review code and syntax; automated execution deferred to CI per user instruction.

### Task 2: Persistence and API

Files: next numbered migration, `src/db/repositories/team-matches.js`, `src/api/team-tournaments.js`, relevant tournament routes and shared validation surfaces.

Interfaces: reuse `/roll`, `/ban`, `/environment` actions; guided `environment` body `{revision,step,kind,...}` has kinds `right`, `pairings`, `tables`, `missions`; server enforces `nextAction.side`. State machine returns final assignments consumed by `createPersonalGames`.

- [x] Add regression cases for permissions, stale writes, venue requirements and persisted scoring.
- [x] Add constraints and immutable match snapshots; adapt round pools, bans, personal games, reset/undo and completion scoring.
- [x] Review affected three-player assumptions and existing route compatibility.

### Task 3: User interface and documentation

Files: `public/app.js`, `public/admin.js`, `public/i18n/{ru,en}.js`, `public/pairing-instructions.js`, documentation, shared asset manifest as required.

Interfaces: render guided actions from API `nextAction`; submit exact bodies from Task 2. Show WTC Doubles in all labels, two-player registration/round controls, GP and five ranking criteria.

- [x] Add relevant browser harness regression coverage without running it locally.
- [x] Implement creation/editing, pairing right/pairs/table/missions forms, instructions, scoring/standings and export labels in both languages.
- [x] Review responsive page and normal administrator controls in the local preview.

### Task 4: Preview and final review

Files: ignored `work/wtc-doubles/*` runtime helpers and fixtures.

- [x] Verify local PostgreSQL identity; start a separate loopback preview with reusable administrator autologin.
- [x] Create a TTS WTC Doubles tournament with eight two-player rosters and first round ready for guided pairing; also provide an IRL example if useful.
- [x] Inspect static page, `/api/me`, administrator controls and page/API flows; record evidence without claiming CI execution.
- [x] Obtain an independent final code review, fix substantive findings, and deliver the ready tournament URL.

