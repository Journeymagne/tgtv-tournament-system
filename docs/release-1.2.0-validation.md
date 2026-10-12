# KT Companion 1.2.0 validation

This release collects all unpublished working-copy changes on top of 1.1.1:
private BCP profile email, leaderboard search, captain and faction editing,
current member nicknames, shared Companion/Combat Lab navigation and profile
game-card layout fixes.

## Packaging and database

Application and Combat Lab packages, both lockfiles and client asset markers
use 1.2.0. The dependency graphs are unchanged. No new environment variables
are required. Migration 054_user_bcp_email follows migration 053 and adds a
nullable users.bcp_email column with a 254-character limit. Startup applies
the migration automatically.

Environment files, sessions, preview helpers, dependencies, database contents,
screenshots and logs remain in ignored runtime directories.

## Release checks

- JavaScript syntax checks passed for all 19 changed or new JavaScript files.
- Git whitespace checks passed; package and lockfile versions agree.
- `npm run build:combat` compiled successfully in the canonical MMR KIT local
  working copy. The production build targets /combat. Existing toolchain
  deprecation and Browserslist warnings do not prevent the build.
- Automated suites were not run: AGENTS.md permits them only as part of
  merging changes into main, and this release is a standalone commit and push.

## Browser and API verification

Verification used a local-only preview on 127.0.0.1:3006 and the dedicated
PostgreSQL database bcp_profile_preview. The configured production-copy
database was not used. A normal LocalPreviewAdmin session supplied local
autologin. Static HTML and /api/me returned 200, user.isAdmin was true, and
the admin session survived page refresh.

The verify-ktcalc skill was applied to the actual integrated production build.
Its old standalone launcher assumes the former ktcalc package name and dev
start command; the documented browser steps were adapted to the current
/combat routes and explicit Calculate button without changing React state
or calling calculator engine functions.

Shooting evidence:

| Readout | Before | After pressing Attacks + and Calculate |
| --- | --- | --- |
| Situation 1 attacks | 4 | 5 |
| Situation 1 average damage | 3.29 | 5.04 |
| Situation 2 average damage | 3.29 | 3.29 |

The shared account and navigation worked on calculator, fight, simulation,
help and weapon-rules routes. The service title opened the calculator and
the logo opened Companion home. The mobile header fit a 390px viewport.
RU/EN and light/dark controls worked; preferences persisted into the
tournament profile. No browser page errors occurred.

The release preview also confirmed the BCP profile form, nickname search in
the leaderboard and absence of bcpEmail in public leaderboard responses.
Earlier BCP verification on the same isolated database covered save, reload,
normalization, clearing, invalid values, unrelated profile updates, separate
sign-in email and privacy in another player's profile. Desktop and mobile
profile layouts were visually inspected in both languages and themes.

Ignored release evidence in the canonical runtime:
services/combat-lab/verify-artifacts/release-120/shoot-before.png,
shoot-after.png, shoot-result.json, combat-mobile-ru-dark.png,
profile-mobile-ru-dark.png and release-result.json. Earlier profile evidence
is under work/bcp-profile-*.png. Release preview logs are under
work/server-3006.out.log and work/server-3006.err.log.

The release verification browser and its temporary server are stopped after
verification. Existing previews and database data are retained. Publishing
the Git commit and tag does not itself restart the production server.
