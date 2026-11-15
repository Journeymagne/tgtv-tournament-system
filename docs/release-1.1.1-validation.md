# KT Companion 1.1.1 validation

This release adds optional multiple factions per player to solo Swiss and
single elimination, WTC, SWORD SHIELD CLASSIC and IRL Doubles. It is based on
the published IRL Doubles release at a429fb2. Concurrent local roster editing,
nickname and leaderboard-search work is excluded from this release.

Application and Combat Lab packages, both lockfiles and Companion asset
versions are 1.1.1. Package comparisons confirmed that dependency graphs are
unchanged. Combat Lab implementation and build inputs are unchanged.

Migration 053 follows the published 052_doubles_irl migration. It sets existing
events to one faction and backfills registration arrays from legacy faction
fields. Startup applies it automatically. No new environment variables are
required.

## Merge validation

As part of merging release/1.1.1 into main, all **1046 tests passed**, with zero
failures, cancellations or skips:

```text
node --env-file=work/release-test.env --test --test-reporter=tap --test-concurrency=1 "test/unit/**/*.test.js" "test/integration/**/*.test.js"
```

Validation ran in the MMR KIT release worktree against the new dedicated local
PostgreSQL database tgtv_factions_release_111_test on 127.0.0.1:5432. Both database
variables pointed only to that database. Preview databases and user data were
excluded. The ignored final log is work/release-111-tests.tap.log.

The initial run exposed test harnesses missing the newly shared faction-label
helpers, the legacy upgrade fixture missing the new default column, and an
email test requiring the literal loopback address. These were corrected before
the final full run. The upgrade check also verifies that an existing faction
is backfilled and an empty participant remains empty.

Focused coverage includes optional slots, faction limits and duplicates,
registered result choices, historical privacy and registration statistics.
Existing regression coverage also checks Doubles scoring and permissions.
JavaScript syntax and git diff whitespace checks passed.

## Local browser and API verification

The separate tgtv_factions_release_111_preview database contains disposable
fixtures. The preview on loopback port 3005 uses an ordinary LocalPreviewAdmin
session with an ignored local autologin launcher. Static HTML and /api/me
returned 200, with user.isAdmin true.

The final browser showed creation choices 1, 2 and 3, and result options limited
to each player's own registration. WTC and Classic in TTS and IRL, plus Doubles,
saved a registered second faction; unregistered choices returned 400. Doubles
retained two roster slots and accepted one faction for both players with a
limit of three. Its editor showed two required faction fields and four optional
fields. Desktop and mobile browser checks had no page errors or horizontal
overflow. Ignored evidence is in work/release-111-*.png and
work/release-111-browser-api.json.

Earlier feature verification covered solo registration and third-faction
results, one-faction registration in three-player teams, invalid and duplicate
lists, before-start privacy, limit-reduction and after-start locks, ordinary
player confirmation and IRL direct submission.

## Packaging

Environment files, credentials, sessions, logs, preview helpers, database data,
dependencies and screenshots stay in ignored runtime files. Pushing the release
does not deploy the running production server.
