# KT Companion

One tournament server serves one hostname. The home page selects a service;
each service has its own page, internal navigation and a top-right home link.
There is no cross-service tab bar or sidebar.

| URL | Section | Access |
| --- | --- | --- |
| `ktcompanion.ru` | Companion home | Public |
| `ktcompanion.ru/tournament` | Tournament system | Existing tournament account |
| `ktcompanion.ru/initiative` | Initiative calculator | Public |
| `ktcompanion.ru/tracker` | Activation tracker | Public |
| `ktcompanion.ru/studio` | KT Studio editor and published library | Public; saving and publishing require the tournament account |

Existing `/tournaments/:slug` and `/teams/:slug` pages keep their public access
on the same hostname. Legacy calculator HTML URLs, `/tournament/`, `/studio/`
and `/index.html` redirect to the corresponding service path without a trailing slash.
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
`SITE_URL=https://ktcompanion.ru`. Keep the existing DNS record and HTTPS
certificate for `ktcompanion.ru`. Replace its old static-site Nginx configuration
with a reverse proxy to the existing tournament Node process. The proxy must
preserve `Host` and send every path to Node, including `/`, `/api/` and assets:
Node chooses the service entry page from the URL path. A single `location /`
is sufficient because all sections run in the same application. See
[`deploy/nginx-companion.conf.example`](../deploy/nginx-companion.conf.example).
The deployment script does not change proxy rules. Update the external environment
file used by that script (normally `/app/tgtv-ts.env`), deploy the new code and
restart the app with those settings. Check `nginx -t` before reloading Nginx.
Verify `/`, all four service URLs and `/api/session` over public HTTPS. Updating
Git alone leaves the old root website in place until its proxy is switched.

Keep `rating.ktcompanion.ru` as a redirect for existing links, using its existing
certificate: `/` redirects to `https://ktcompanion.ru/tournament`, and other paths
redirect to the same path on `https://ktcompanion.ru`. The example includes an
optional redirect block. No new service subdomains are needed.

The `sid` session cookie is host-only, with `Path=/`, HttpOnly, SameSite=Lax and
Secure in production. Login, renewal and logout use the same cookie across all
service paths. Existing accounts remain unchanged; moving from the rating
hostname or the old shared `kt_sid` cookie requires one new login. Existing `sid`
sessions on the canonical hostname remain valid. All API calls and login return
URLs use the same origin; no CORS or authentication tokens in URLs are needed.

Locally, open `http://127.0.0.1:3000` and use `COOKIE_SECURE=false`. Leave
`COMPANION_ORIGIN` and `SITE_URL` empty or set both to that origin, with the actual
`PORT`. Service paths work with either configuration. `/companion-sites.js`
supplies the URLs to all pages and is not cached.

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
matching site Origin when present. The fixed `X-Studio-Account` header rejects requests
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
matches a tab-local transfer record after the round trip through the tournament
login page on the same origin, and large projects are restored from the
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
`test/unit/companion-sites.test.js` checks path routing, legacy redirects,
host-only cookie creation/clearing and the login-return allowlist. Browser checks
cover all service roots, mobile calculator results, shared login/logout and
guest draft recovery after registration.
