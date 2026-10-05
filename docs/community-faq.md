# TTS COMMUNITY FAQ

The integrated Companion service opens at `/faq` (also `/community-faq` and
`/faq/index.html`). It uses the Companion header, account session and light/dark
theme and is available from the Companion home service selector.

## Sources

The initial archive contains 131 FAQ cards: 34 Community FAQ entries and 97
official GW Q/A pairs from 32 team documents. Code of Conduct is a separate
document assembled from 17 editable text records, outside the FAQ catalogue.
The main FAQ principle and ruling legend live under **Инфо** at `/faq/info` as
an editable document, excluded from FAQ cards, search, bookmarks and totals.
Existing links to that former card open its text in **Инфо**. Migration
**049_faq_info** moves existing content without replacing its text, preserves
pending corrections and records the move in the publication history. The local
reference corpus was captured on 2026-09-25 and contains 48 team PDFs; documents
without Q/A do not create invented FAQ entries. Official answers retain English,
the original PDF URL, physical page, source date and commentary section. This is
a dated corpus, not a live synchronization with Warhammer Community.

Community entries come from **TTS Community FAQ Kill Team 2026 v1.7**:
https://docs.google.com/document/d/12_kkWQiYa3cwUkZDG7UdnOf5i5P_WT5P3Db0SZItIwA/edit?tab=t.0

Each FAQ heading becomes a separate card. Code of Conduct opens as one complete
text under its own tab and shareable route `/faq/conduct`, with the source's
introduction, lists, headings and an outline. It has no FAQ filters, Q/A labels
or card counter; catalogue search and totals exclude it. Existing links to
individual conduct records open the corresponding paragraph in this document.
FAQ Moderators use **Изменить кодекс** to edit its text and images or add a
section, with the existing permission checks and revision history. RAW,
Правка, Спор and Произвол are preserved; team spelling is mapped to canonical
Companion names. There are 23 original community illustrations, plus rendered
official pages for answers that reference diagrams or movement templates.

Portable content lives in `src/faq-data/seed.json`; local images live in
`public/faq/source-images/`. To regenerate, export a native Google Docs tab
resource including paragraphs and inline objects to ignored `work/` and run:

```powershell
node scripts/import-faq-sources.js work/faq/community-source.json '<source-index.json>'
```

The source index used for this build is
`X:/Vibecoding/custom teams/references/kill-team-wording/source-index.json`.
It points to page-delimited text and PDFs beneath
`C:/Users/Journeymagne/Documents/Kill Team References/Warhammer Community/2026-09-25`.
The import script needs Node 22+, network access for supplied Google image URLs,
and `pdftoppm` for diagram pages. Imported records are inserted once by migration
048. Regenerating the JSON does not overwrite edited database entries.

## Accounts and moderation

Migration **048_community_faq** adds FAQ entries, submissions, questions, change
history and `users.is_faq_moderator`. It is registered in normal startup migrations.
No additional npm dependency is required; server rendering uses existing
`markdown-it` with raw HTML disabled.

Guests can browse. Signed-in Companion accounts can ask questions and submit
new FAQ requests or corrections. Authors see only their submissions, with the
moderator's decision; returned requests can be edited and resubmitted.
Selecting kill teams shows only cards explicitly tagged with those teams;
general rulings do not enter a faction selection. Source counters reflect the
current filters. A team with no matching cards shows an empty result.
FAQ uses the same `users` and `sessions` records and host-only `sid` cookie as
Tournament System, Studio and the other Companion services. Common login
returns to the selected FAQ page or entry. Account and role changes refresh
open FAQ tabs. Authenticated FAQ requests include `X-FAQ-Account` with the
current `/api/session` user id; a mismatch is rejected before private reads or
writes, so an old editor cannot submit under a newly signed-in account.

FAQ Moderators can publish, edit, answer questions and accept, reject or return
submissions. This role grants no tournament or global administrator access.
Existing platform administrators can also moderate. The platform owner assigns
or revokes the dedicated role in **Модерация → Роли**. Role changes are audited.

Players can edit and delete their own discussion comments. FAQ Moderators can
delete any comment and edit or remove moderator replies; they cannot rewrite
another player's text. Deleting a question hides its attached reply as well;
deleting only the reply preserves the question. Companion avatars appear beside
authors and moderators, with an initial as the fallback. Migration
**050_faq_comment_edits** adds comment revisions and edit timestamps, preserving
existing discussions. Revision checks reject stale edits and deletions.

Accepting a correction and updating its linked community card happens in one
transaction. Corrections to official GW cards publish a separate community
clarification. The original GW entry is retained. Revision checks prevent
overwriting another editor's changes; publication changes retain snapshots.

The text toolbar supports bold, italic, headings, lists, quotes, tables and links,
with a live rendered preview. Images are uploaded as PNG/JPEG/WebP, resized
locally and checked by the server; captions and up to six attachments are stored.
Raw HTML is escaped. FAQ writes require JSON and reject cross-origin requests.

## Local preview

FAQ uses Companion's shared RU/EN setting. Its interface, filters, counts,
editor, discussion controls and moderation are localised. Labels are translated
in place without replacing forms or changing stored classification values.
Dates follow the selected locale; source documents and authored questions,
answers, captions and comments retain their original language. The FAQ dictionary
is scoped to this service in `public/faq/i18n.js`.

The working copy is under
`C:/Users/Journeymagne/Documents/MMR KIT/KT Companion Community FAQ`.
The ready-to-use Companion home is `http://127.0.0.1:3004/`;
its FAQ section is `http://127.0.0.1:3004/faq`.
Its dedicated PostgreSQL database is `faq_preview` on loopback port 55444.
The Compose file, administrator autologin helper, session material, logs and
example submissions stay in ignored `work/`. They are not production features.
The page opens with the normal LocalPreviewAdmin session. PreviewPlayer and
PreviewFAQModerator are isolated local accounts for checking permissions.

Launch from that working copy with `node work/launch-faq-preview.cjs`.
Logs are `work/server-3004.out.log` and `work/server-3004.err.log`.
Do not launch duplicate instances; stop only the PID recorded by this launcher.

Verification covers local page/API availability, administrator autologin, desktop
and mobile layouts, search, rich-text preview and the submission/moderation
workflow. Repository test suites are not run for a routine local preview, per
AGENTS.md. Production deployment is separate from this preview.
