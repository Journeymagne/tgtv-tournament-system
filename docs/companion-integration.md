# KT Companion

One tournament server serves five hostnames. The home page selects a service;
each service has its own page, internal navigation and a top-right home link.
There is no cross-service tab bar or sidebar.

| URL | Section | Access |
| --- | --- | --- |
| `ktcompanion.ru` | Companion home | Public |
| `initiative.ktcompanion.ru` | Initiative calculator | Public |
| `tracker.ktcompanion.ru` | Activation tracker | Public |
| `rating.ktcompanion.ru` | Tournament system | Existing tournament account |
| `studio.ktcompanion.ru` | KT Studio editor and published library | Public; saving and publishing require the tournament account |

Existing `/tournaments/:slug` and `/teams/:slug` pages keep their public access
on the rating hostname. Legacy calculator HTML URLs, `/tournament/`, `/studio/`
and `/index.html` redirect to the corresponding service root.
Old root hash links (`/#/mygames`, `/#team-match/...`, etc.) forward to the
tournament section without losing their query or hash. `/index.html` also remains
an alias for the tournament application.

## Running and deployment

The existing `npm start` command, PostgreSQL connection, session store and user
accounts serve all four sections. No second server, account database or frontend
build is needed. Migration `032_studio_projects` creates account-owned drafts and
published snapshots in the existing database on startup. It does not alter
tournament data or copy drafts from a standalone Studio installation.

Set `COMPANION_ORIGIN=https://ktcompanion.ru` and
`SITE_URL=https://rating.ktcompanion.ru`. Point all five DNS names to the same
server and provide HTTPS certificates covering all five. The reverse proxy must
preserve `Host` and send every path to Node, including `/` and static assets:
Node chooses the service entry page from the hostname. See
[`deploy/nginx-companion.conf.example`](../deploy/nginx-companion.conf.example).
The deployment script does not provision DNS, certificates or proxy rules.

The `kt_sid` session cookie uses `Domain=ktcompanion.ru`, HttpOnly, SameSite=Lax
and Secure in production. Login, renewal and logout use the same cookie on all
services. Existing accounts remain unchanged; users sign in once again when
switching from old host-only `sid` cookies, which are ignored in subdomain mode.
Only trusted services should use this parent domain. API calls remain on each
service's own origin; no CORS or authentication tokens in URLs are needed.
Return-after-login URLs accept only the five exact configured origins.

Locally, use `COMPANION_ORIGIN=http://ktcompanion.localhost:3000`,
`SITE_URL=http://rating.ktcompanion.localhost:3000` and `COOKIE_SECURE=false`.
Chrome resolves the parent and subdomains to loopback without hosts-file edits.
Use the actual `PORT` in both URLs. If `COMPANION_ORIGIN` is unset, the server
keeps legacy paths under one hostname and host-only `sid` cookies for existing
development and integration tests. `/companion-sites.js` supplies the URLs to
all pages and is not cached.

Studio projects may include image albums, so `/api/studio/drafts/` accepts up to
100 MiB of JSON. Raise the reverse proxy body allowance to `100m` for that path,
or for its existing API proxy block. The application still enforces the existing
2 MiB default and 5 MiB tournament limits on other routes. The deployment script
does not modify the host's reverse proxy configuration.

## Studio identity and saving

`GET /api/session` supplies only the current account's id, name and admin flag to
the account controls. Studio session, private draft and write routes use the
existing tournament authentication middleware. Library listing and published
team viewing are public. Private drafts use `users.id` as their owner, never an
owner supplied in the project. Writes require a session-bound CSRF token and a
matching service Origin when present. The fixed `X-Studio-Account` header rejects requests
from an editor whose account changed in another tab, even during reconnect.

The editor retains local saves after every edit and uploads edits every minute.
Local storage and the IndexedDB album database are namespaced by account. Logging
out preserves that account's offline work without exposing it to the next user.
Concurrent edits produce a conflict; publishing keeps a separate snapshot so
later private edits do not change the library until republished.

Guests can create, import and edit teams without logging in. Guest recovery
copies are isolated by browser tab; no anonymous draft is uploaded. The
Save team / Publish buttons and project JSON download request login. The selected
action resumes after login or registration. A single-use token in the return URL
matches a tab-local transfer record on the Studio origin after the round trip
through the rating login page, and large projects are restored from the
guest IndexedDB store. The transferred project gets a new id to avoid overwriting
an existing account draft with the same id. Signing in from another tab alone
does not adopt guest projects. PDF, TTS and roster exports remain available to
guests.

Anonymous drafts from standalone Studio are not automatically assigned to the
first person who logs in. Export a project as JSON in the old Studio and import
it in the new one under the intended account if it should be transferred.

## Imported sources

- Home page, initiative calculator, activation tracker and their assets:
  [legendaryvasily/tts_companion](https://github.com/legendaryvasily/tts_companion),
  commit `a70d843b5e623b56240a4887752b1c3ba9f1e944`.
  Files are vendored under `public/companion/`, with entry pages in `public/`.
  Changes include service-specific URLs, home links, Russian home copy,
  responsive four-card layout and corrected calculator script paths.
- Studio: the local `custom teams/kill-team-studio/dist` working copy as of
  2026-09-21, including its existing drafts/library work. Vendored into
  `public/studio/`; shared account bootstrap and namespaced browser storage added.
  The server implementation is adapted to the tournament router, PostgreSQL pool
  and migration system. The standalone source repository is unchanged.
- Bundled third-party library/font notices remain in `public/studio/vendor/`.

## Verification

Run the existing `npm test` against an explicitly isolated `TEST_DATABASE_URL`.
`test/integration/api-studio.test.js` exercises public pages/library, common sessions,
account isolation, stale editors, CSRF, logout, concurrent draft revisions and
published snapshots over HTTP with PostgreSQL.
`test/unit/companion-sites.test.js` checks host routing, legacy redirects,
domain-cookie creation/clearing and the login-return allowlist. Browser checks
cover all service roots, mobile calculator results, shared login/logout and
guest draft recovery after cross-subdomain registration.
