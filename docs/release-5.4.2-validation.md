# Release 5.4.2 validation

The release includes strict FAQ team filtering and counters, comment editing and
deletion with avatars and revision guards, restored conduct headers and centred
submission queues. FAQ interface localisation shares Companion's RU/EN setting;
authored source text stays in its original language. Theme and language use shared
preferences across service pages and tabs.

Migration **050_faq_comment_edits** adds comment revisions and edit timestamps.
It preserves existing discussions and applies through the normal startup runner.
It is already applied in the isolated local FAQ preview database.

Browser inspection covered all six services plus the home page with light/EN
and dark/RU settings, reload persistence, synchronization of open tabs and
restoring shared preferences from a second local service address. FAQ inspection
covered filters and empty results, editor values and unsaved text across language
changes, discussion controls, moderation, Info and Code of Conduct. Desktop and
mobile layouts were inspected; the final browser checks recorded no page errors.

The local preview is served at `http://127.0.0.1:3004`, using the dedicated
`faq_preview` PostgreSQL database on loopback port 55444. Page/API availability
and the normal LocalPreviewAdmin session were verified. Preview helpers,
credentials, fixture accounts and screenshots stay in ignored runtime `work/`.

Application, lockfile, server-rendered pages and client asset versions are 5.4.2.
The diff was reviewed for whitespace errors and release version consistency.
Automated test suites were not run for this standalone commit/push, following
AGENTS.md. Additional integration and unit cases are checked in for the next
merge into `main`. Production deployment is separate from this Git push.
