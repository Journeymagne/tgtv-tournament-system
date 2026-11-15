# KT Companion 1.0.1 validation

This release adds administrator reset of a single submitted or completed match
in the latest round of a running individual Swiss tournament. Resetting clears
its score and points, recalculates ratings, reopens the round and opens the
pairings editor. Removed players and proxies retain their historical names and
scores without returning to the current roster.

The full automated suite ran on Node.js 26.8.1 as part of merging
`release/1.0.1` into `main`, following AGENTS.md. All **1034 tests passed**, with
zero failures, cancellations or skips:

```text
node --test --test-reporter=tap --test-concurrency=1 "test/unit/**/*.test.js" "test/integration/**/*.test.js"
```

Validation used a separate working copy under
`C:\Users\Journeymagne\Documents\MMR KIT\KT Companion Release 1.0.1` and a newly
created isolated PostgreSQL database on loopback port 55444. Both database
variables pointed to that test database. Existing user and preview databases
were not used for automated tests; external email was disabled or mocked.

New integration coverage verifies reset against a removed proxy, clearing its
slot, reopening a completed round, retaining table and mission, preserving
other results and games, audit history, confirmation and revision checks,
replaying later Elo, authorization and rejection after a later generated round.
New unit coverage verifies historical names, frozen identities, exclusion from
the current roster and faction privacy.

Manual local browser and API checks also covered replacing the freed slot,
removing the redundant pairing, resetting a pending result, cross-tournament
scope and concurrent edits. Existing results remained intact. The interface
was inspected in both themes and in Russian and English. After the asset bump,
mobile browser checks at width 390 found no JavaScript errors, unresolved
translation keys or horizontal overflow; the reset confirmation remained usable.

The local preview at `http://127.0.0.1:3005/tournament` returned HTTP 200 with
resources versioned 1.0.1. `/api/me` confirmed the reusable `LocalPreviewAdmin`
account with administrator access. The ignored local launcher provides a normal
application session on opening or refreshing the URL; production authentication
is unchanged.

All 602 application, test and existing documentation files matched the validation
copy by SHA-256 before adding this report and the final validation note.
JavaScript syntax and `git diff --check` passed. Application, lockfile, client and
server-rendered asset versions are 1.0.1. No new dependencies, database migrations
or environment variables are required. The release archive is built from the
tagged Git tree, excluding credentials, local databases, sessions, logs, preview
helpers and node_modules.
