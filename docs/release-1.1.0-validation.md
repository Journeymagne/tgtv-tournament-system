# KT Companion 1.1.0 validation

This release includes all pending Companion profile and tournament season
changes, plus Companion Combat Lab as a separate service in
`services/combat-lab`. Application, root and service lockfiles, and Companion
client asset versions are 1.1.0. The main server does not load or build the lab;
its dependencies and startup remain independent.

## Companion

The full automated suite ran on Node.js 26.8.1 as part of merging
`release/1.1.0` into `main`, following AGENTS.md. All **1036 tests passed**, with
zero failures, cancellations or skips:

```text
node --test --test-reporter=tap --test-concurrency=1 "test/unit/**/*.test.js" "test/integration/**/*.test.js"
```

Validation used the release working copy under
`C:\Users\Journeymagne\Documents\MMR KIT\KT Companion Release 1.1.0` and a new,
dedicated PostgreSQL database on loopback port 55444. Both database variables
pointed exclusively to that test database. User databases and existing preview
databases were not used for tests; external email was disabled or mocked.
The ignored log is `work/release-110-tests.tap.log`.

The suite covers the new current-season selection, super-administrator season
changes, stale edits, existing game statistics and season authorization. Profile
and season browser verification from the preceding local changes is recorded
in the changelog and `docs/tournament-seasons.md`.

## Combat Lab

`npx tsc --noEmit` and `npm run build:demo` passed in the nested service. Its
production build was started on an owned local process and checked through the
actual browser; the static page and `/api/health` returned HTTP 200.

The original calculator completed a shooting calculation with average damage
3.29 for both manual profiles. In Vespid vs Plague Marines, adding Neutron Charge
immediately checked its checkbox. Recalculation changed average damage from
3.25 to 4.29 while the opponent's bonuses remained unchanged. Before/after
screenshots and the result transcript are under the ignored
`services/combat-lab/verify-artifacts/release-110-*` paths. Earlier local
verification also covered melee, shared controls, dark/light themes, mobile
layout, source-only rules, custom effects and disabled-state persistence.

The imported calculator engine remains the pinned jfreal/ktcalc implementation.
Packaging only removes trailing whitespace from two imported files in addition
to version/documentation updates. Source PDF files are not bundled; configure
`REFERENCE_DIR` for a local library. The JSON catalogue snapshot is bundled.

## Packaging

The source snapshot was checked for concurrent edits before staging. All pending
Companion files and the independent lab sources are included. Credentials,
`.env`, test databases, session material, logs, preview launchers, node_modules,
compiled builds, Python vendor dependencies and browser evidence are ignored.
`git diff --cached --check` passed. The main Companion service has no new
required dependencies, database migrations or environment variables.
