# Release 5.4.1 validation

Validated on 2026-10-05 before pushing the release.

- Full unit and integration suite: **1011 passed, 0 failed, 0 skipped**.
  The command matches the package test script:
  `node --test --test-concurrency=1 "test/unit/**/*.test.js" "test/integration/**/*.test.js"`.
  Both database environment variables pointed to `faq_release_541_test` on
  loopback port 55444 in the dedicated local FAQ PostgreSQL container.
- FAQ integration checks cover public reads, shared session identity, scoped
  moderation and role revocation, account mismatch rejection, private submissions,
  return/revise/publish decisions, revision conflict rollback, preserving GW answers,
  player questions, moderator replies, Markdown escaping and request validation.
- Migration checks cover an upgrade from schema 47, preserving passwords,
  ratings and sessions, repeat startup, and moving edited FAQ principles and open
  corrections to Info with an audit snapshot.
- The seed has 131 FAQ cards (34 community, 97 official), 17 conduct sections and
  one Info record. All 27 source illustration paths resolve to local files.
- Browser checks on Chrome at 1440×1000 and 390×844 confirm the six-service home,
  administrator autologin, shared FAQ identity, the requested subtitle, centred
  reading dialog, no horizontal overflow, direct Info/Conduct URLs, complete
  17-section conduct text and versioned 5.4.1 assets. No JavaScript page errors.
- Local `/`, `/faq`, `/faq/info`, `/faq/conduct`, `/api/me` and `/api/faq` return
  successful responses. The ready-to-use preview remains at `http://127.0.0.1:3004/`.

Local launchers, credentials, sessions, test logs and fixture data remain in ignored
runtime files. The release adds migrations 048 and 049 without new dependencies
or required environment variables.
