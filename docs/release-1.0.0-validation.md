# KT Companion 1.0.0 validation

KT Companion starts a new version sequence at 1.0.0. Previous release history is
retained. This release includes all pending application changes: the book-and-blade
branding, active individual Swiss pairing repair and participant removal,
consistent table columns, two-column team rosters, and Back navigation recovery.

The full automated suite was run on Node.js 26.8.1 as part of merging
`release/1.0.0` into `main`, following AGENTS.md. All **1030 tests passed**, with zero
failures, cancellations or skips:

```text
node --test --test-reporter=tap --test-concurrency=1 "test/unit/**/*.test.js" "test/integration/**/*.test.js"
```

Validation used a separate working copy under
`C:\Users\Journeymagne\Documents\MMR KIT\KT Companion Release 1.0.0` and a newly
created isolated PostgreSQL database on loopback port 55444. Both database
variables pointed to that test database. Existing preview and user databases
were not used for automated tests; external email was disabled or mocked.

Integration coverage includes removal of Swiss proxies after the start,
repairing remaining pairings while retaining historical matches and games,
revision conflicts, player coverage, authorization, protected submitted results,
and unchanged ratings. Navigation coverage includes stalled browser Back and
immediate restoration of My Games before account refresh finishes.

Branding was visually inspected on desktop and mobile, in light and dark themes,
including the shared header, home and sign-in screen. Favicon requests returned
HTTP 200. Browser inspection recorded no console errors or horizontal overflow.
The local preview at `http://127.0.0.1:3004/` returned HTTP 200 and served resources
versioned 1.0.0; `/api/me` confirmed the reusable `LocalPreviewAdmin` account with
administrator access. Ignored launcher files provide autologin on opening or
refreshing the local URL; production authentication is unchanged.

All 600 application and existing documentation files matched the validation copy
by SHA-256 before adding this report. JavaScript syntax and `git diff --check`
passed. Application, lockfile, client and server-rendered asset versions are
1.0.0. No new dependencies, database migrations or environment variables are
required. The release archive is built from the tagged Git tree, excluding
environment credentials, local databases, sessions, logs, preview helpers and
node_modules.
