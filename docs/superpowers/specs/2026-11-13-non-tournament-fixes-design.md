# Non-tournament review fixes

The user authorized fixing all eight findings from the additional review of
`a49510e0d65cfed29af2b760e2fda911e1ce167e`. This is corrective maintenance of
existing behavior, using the existing Node.js/PostgreSQL/browser architecture.

## Required behavior

1. Studio must retain locally persisted, unacknowledged edits across another
   tab's clean refresh and the editing tab's restart. Recovery must preserve the
   base revision and account isolation, and must not resurrect deleted drafts.
2. Accepted operative data must never cause unbounded synchronous rendering.
   Validate supported profile dimensions and bound title truncation even for
   malformed/legacy data reaching the renderer directly.
3. On session identity change, the shared notification widget must immediately
   clear the previous account's private content. Old in-flight replies must not
   restore it; guest-to-user and user-to-user transitions must work.
4. Every moderation decision after a returned FAQ submission is a new unread
   notification with its own occurrence time. Delivery retries of one decision
   must remain idempotent.
5. Delivery and read-through must agree on a recipient's watermark, including
   initially absent inbox state and concurrent source workers. An event at or
   before the committed watermark must not remain unread after both commit.
6. A Studio review form held across a publication version change must retain its
   text/scores after 409, refresh the version metadata, and require explicit
   confirmation before reassessing the new version. New-review forms also work.
7. KnowThyKT must not apply older progress/catalogue after asynchronous bank
   loading overlaps a newer successful answer or identity change.
8. Concurrent registration of the same normalized name must return one success
   and one HTTP 409, preserving database uniqueness; unrelated errors propagate.

## Approach and constraints

Use focused fixes at the existing persistence, renderer, session, notification,
review and registration boundaries. Broad rewrites and new dependencies add no
value for these defects. Durable recovery must not depend on a clean tab's last
write to a shared metadata object. Notification consistency must be enforced in
the real database transaction, with deterministic lock ordering across users.

Do not change tournament behavior, production authentication or database access
boundaries. Preserve current publication privacy, revision conflict recovery,
deleted-project tombstones, notification history and same-event idempotency.

All automated tests run in GitHub Actions CI only. First verify the regression
tests fail for the expected defects, then verify the fixed exact commit. No
local tests, application starts or preview are required. Update generated shared
asset versions using the existing generator when browser sources change.

The user has authorized execution of these fixes; implementation choices within
these constraints are engineering decisions. A draft PR against release/1.5.1
will make the result reviewable; merging is a separate action.
