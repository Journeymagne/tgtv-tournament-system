# Studio reviews

Published teams have a Reviews tab and a rating summary on each library tile.
Reviews require an authenticated, active account, text (1–5000 characters) and
integer scores from 1 to 5 for Theme, Balance and Lore. The publication owner
cannot review their own team. A user has one non-deleted review per publication,
including a review hidden by moderation. Questions without ratings are available
in the adjacent [Discussion tab](studio-discussion.md).

Library tiles show two sets of category averages and an equally weighted overall
score: the current author-defined version and all versions. They are computed without
intermediate rounding, fetched in one batch for library tiles, and displayed
to one decimal. No ratings means null averages, not zero. Each user contributes
one rating per version label. Edits within that version replace a vote;
deletion and moderation immediately change the summary. There is no rating cache.

Reviews keep a publication revision and a version label. The displayed version
label, set by the team author, groups ratings; republishing the same label does
not reset its scores. Labels are trimmed, case-sensitive, with 1.0 as the empty
label fallback. Reusing an earlier label also reuses its ratings.
The reviewer can explicitly reassess the current version while editing the same
review. Previous version scores remain in an expandable history and count in
the all-version average (one user/version vote, equal weight). The current-version
average includes only matching labels. Counts distinguish reviews from version
ratings. A new version without votes displays no ratings rather than old scores.
A copied team has a different publication and starts without reviews.
Deleting a project removes reviews, reports, audit records and related review
notifications. Deleting a reviewer cascades their reviews and excludes their
scores; remaining notification entries are redacted on retrieval.

## Interface

- Guests can read. The Studio sign-in dialog opens in place, preserving the team
  and unsaved review text in memory when a session expires.
- Each rating is a keyboard-accessible radio group without a default score.
- Reviews can be edited or deleted by their author. Conflicts preserve the form
  and offer to load the current revision before saving again.
- Superadmins can also delete other users' reviews, including hidden reviews.
  Deletion is audited and excludes all version ratings from the library averages;
  it does not grant permission to edit another author's text or scores.
- Superadmins can delete a published team from its library tile or viewer after
  confirmation. The server checks the project revision and deletes the owner's
  draft, publication, TTS exports, reviews and discussions through the existing
  project cleanup. The action is recorded in the administrative audit log.
  Ordinary administrators do not receive this deletion permission.
- Public text is escaped, keeps line breaks and is not interpreted as HTML.
  Long reviews can be expanded. URLs remain plain text.
- Review lists use cursor pagination (20 entries), with a direct fetch for links
  to reviews outside the first page. There is no background polling or WebSocket.
- Review settings control notifications in the existing Companion inbox.
  Only new reviews notify the team author; notifications do not contain review
  text. Their links open `/studio#/library/{id}/reviews?review={reviewId}`.

## Administration

Site administrators see moderation controls in the Reviews tab: all reviews
(including hidden), a paginated site-wide report queue, hide/restore, history,
and close/reopen discussion. Closing blocks new reviews and edits but allows
authors to delete visible reviews. Reasons are required for moderation actions.
Hidden reviews cannot be edited or replaced to evade moderation.

Users can report spam, abuse or another issue, with up to 500 characters of
explanation. One open report per reviewer/message is enforced by a unique index.
Reporting does not hide content automatically. Moderators either hide the review
or dismiss the report with a reason. Audit retains prior review snapshots; the
interface displays the latest 100 events. Full history stays in PostgreSQL.

## Database and API

Migration **039_studio_reviews** runs during startup. Back up PostgreSQL before
deployment. It adds `published_revision` to `studio_projects` (existing published
teams start at 1) and creates `studio_reviews`, `studio_review_audit`,
`studio_review_reports`, `studio_discussion_state`, `studio_review_preferences`.
No remote service or environment variable is required.

Migration **040_studio_review_versions** adds `studio_review_ratings`, keyed by
review ID and version label. It backfills prior scores from review audit snapshots
and the latest review state. Removing/hiding a review excludes all of its version
ratings; restoring returns them. Deleting the review/project cascades stored
ratings. `ratingSummary.currentVersion` and `.overall` contain the two aggregates;
the parent `count` remains the number of visible reviews. Review responses include
`versionRatings`; writes include `versionLabel` to detect a version change while
the reviewer had the form open.

All routes use the established `/api/studio` namespace:

| Route | Methods |
|---|---|
| `/api/studio/library/:id/reviews` | GET, POST |
| `/api/studio/library/:id/reviews/:reviewId` | GET, PATCH, DELETE |
| `/api/studio/library/:id/reviews/:reviewId/reports` | POST |
| `/api/studio/review-preferences` | GET, PATCH |
| `/api/studio/admin/review-reports` | GET |
| `/api/studio/admin/review-reports/:reportId` | PATCH (dismiss) |
| `/api/studio/admin/library/:id/reviews` | GET |
| `/api/studio/admin/library/:id/reviews/:reviewId/history` | GET |
| `/api/studio/admin/library/:id/reviews/:reviewId/moderation` | POST |
| `/api/studio/admin/library/:id/discussion` | PATCH |

Writes require session identity, `X-Studio-Account`, Studio CSRF token and an
allowed origin. Admin endpoints additionally require site administrator rights;
tournament judges do not inherit review moderation permissions. Owner checks,
revision checks, publication availability and locks are checked server-side.

Creation includes a UUID `clientRequestId` to deduplicate retries. Edits/deletion
include the current `revision`. Writes serialize on publication and account
locks; a unique index protects the single-review rule. Writes are limited to
one per 10 seconds and 30/hour per account, reports to 10/hour, with Retry-After.
Rate history is stored in PostgreSQL, not per process.

## Local preview and verification

The ignored `work/reviews-preview-server.cjs` launcher is for the dedicated
loopback preview only. It checks the local database, creates/reuses
LocalPreviewAdmin and supplies a normal session. It is not part of production
authentication. Demo accounts, team and review exist only in the local preview.

Automated suites run on merges, following project instructions. Release checks
cover review authorization, ratings, version updates, moderation, notifications
and migration of existing publications. Local previews also verify syntax,
page/API availability and the browser interface.
