# KT Companion 1.1.0 — IRL Doubles

This release contains the Doubles changes from this chat, based on main at
8181108 (1.0.3). The earlier 1.1.0 release and its validation history remain
in the repository; this document records the new Doubles release separately.

Application and Combat Lab package versions and both lockfiles are 1.1.0.
Companion client assets use a unique 1.1.0-doubles query marker to refresh
caches from the earlier 1.1.0 release. Dependency graphs are unchanged. Combat Lab
source and build inputs are unchanged; version updates do not require a rebuild.

Migration 052 adds IRL Doubles, two-player match snapshots and scoring version.
It preserves existing WTC and Classic results. There are no new required
environment variables. Deployment applies the migration during normal startup.

## Local verification

The implementation was checked against a dedicated local PostgreSQL database
on loopback port 55432, separate from user data. The preview uses the normal
LocalPreviewAdmin session and autologin from ignored runtime helpers.

API checks covered two-slot rosters and full replacement, reserve handling,
deletion, four Swiss rounds, four missions and two tables per line, stale and
duplicate pairing rejection, captain permissions and opponent confirmation.
20:4 plus 1:18 produced 2:3 TP; correcting VP changed the bonus and standings.
SOS, final publication and a published final-round correction were checked.

Browser checks covered creation defaults, two-slot roster editing, round setup,
and saving two pairings after swapping players. Russian desktop (1440px) and
mobile (390px) previews had no horizontal overflow or console errors. Static
HTML and /api/me returned 200 with administrator access.

Before merging into main, the complete automated suite passed on a separate
local database named tgtv_doubles_release_110_test on loopback port 55432.
Both DATABASE_URL and TEST_DATABASE_URL pointed only to that test database;
the preview database and user data were not used by the suite. External email
was disabled. All **1041 tests passed**, with zero failures or skips:

```text
node --test --test-reporter=tap --test-concurrency=1 "test/unit/**/*.test.js" "test/integration/**/*.test.js"
```

Focused regression cases are in test/unit/doubles.test.js; existing client
harnesses load the shared team-format helpers. Russian and English dictionaries
pass protected terminology checks, including Doubles and SOS. The ignored log
is work/release-110-doubles-tests.tap.log. JavaScript syntax and git diff
whitespace checks passed. Package comparisons confirmed unchanged dependency
graphs in both packages and lockfiles.

## Packaging

Credentials, environment files, database contents, session cookies, dependencies,
preview launchers, logs and screenshots remain outside the commit under ignored
runtime paths. Pushing the release does not deploy the running production server.
