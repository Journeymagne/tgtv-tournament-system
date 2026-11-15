# Release 5.4.3 validation

This release fixes administration tabs and account-permission dialogs, identifies
the captain's team awaiting result confirmation in RU/EN, and restores readable
team-pairing results in the light theme. It also adds audited superadmin deletion
of Studio publications, foreign reviews and discussion messages.

The full automated suite was run on Node.js 26.8.1 for merging `release/5.4.3` into
`main`, following AGENTS.md. All **1022 tests passed**, with zero failures, cancellations or skips.
The command uses the package's full test selection and sequential execution;
the TAP reporter provides the saved result:

```text
node --test --test-reporter=tap --test-concurrency=1 "test/unit/**/*.test.js" "test/integration/**/*.test.js"
```

Validation used a separate copy under `C:\Users\Journeymagne\Documents\MMR KIT`
and a newly created temporary PostgreSQL database on loopback port 55444. Both
database variables pointed to that database, external email was disabled, and
the temporary database was removed after the run. Existing preview and user
databases were not used for the automated suite.

Additional integration cases cover identity, CSRF and superadmin-only publication
deletion; stale revisions, dependent-data cleanup and administrative audit;
deletion of visible and hidden foreign reviews without permission to edit them;
rating removal; and comment deletion preserving other authors' replies. Client
cases cover named confirmation teams on both sides, player and captain reports,
proxy user identities, RU/EN text and HTML escaping of team names.

Browser inspection covered desktop and mobile account controls, foreign review
and comment deletion controls, publication deletion through its confirmation
dialog, and absence of foreign editing controls. The deleted fixture publication
returned HTTP 404. The final browser check recorded **zero page errors** and no
horizontal overflow in the mobile permissions dialog. Pairing-result text was
visually inspected in light and dark themes and at mobile width.

The isolated preview at `http://127.0.0.1:3000` uses the dedicated local
`permissions_preview` database and a normal `LocalPreviewAdmin` session.
The tournament page returned HTTP 200 with version 5.4.3; `/api/me` confirmed
administrator and superadmin access. Ignored `work/` helpers provide administrator
autologin when opening or refreshing the URL. Production authentication is unchanged.

Application, lockfile, server-rendered pages and client asset versions are 5.4.3.
The checked source files matched the validation copy; JavaScript syntax and
`git diff --check` passed. No new dependencies, migrations or environment variables
are required. Release packaging uses the tagged Git tree, excluding local `.env`,
databases, sessions, logs, preview helpers and `node_modules`.
