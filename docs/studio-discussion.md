# Studio discussions

Published teams have a Discussion tab beside Reviews and a comment counter in
the library. No review or rating is required. Discussion does not change ratings.
Guests can read; signed-in users, including the team author, can ask questions
and reply. Author messages have a Team author badge.

Messages are plain text, 1–2000 characters. Replies have one nesting level and
retain the direct recipient. Threads load 20 at a time, with three initial replies
and cursor pagination. Links to individual messages load their thread even when
it is outside the current page. Newest/oldest ordering applies to root messages.

Writers may edit or delete their own messages. Revision checks protect concurrent
edits, request UUIDs deduplicate creation retries, and unsaved text is guarded.
Deleting a root preserves other participants' replies with a deleted placeholder.
Messages survive publication updates and retain the version at creation.
Superadmins can delete other users' messages, including hidden messages, with
the same revision checks, audit trail and preservation of replies. This permission
does not allow editing someone else's message or extend to ordinary administrators.

The team author receives questions and replies. Root-message authors and direct
reply recipients also receive replies, without duplicate or self notifications.
In-app notifications link to the message. The Studio notification preference is
shared with reviews. Hidden/deleted messages retract their notifications.

Site administrators can hide/restore messages with a reason, inspect audit
history, resolve reports, and close/reopen the discussion. The existing discussion
lock applies to reviews and comments together. Team ownership grants no moderation
rights. Users can report other messages as spam, abuse or other.

Migration 041 adds `studio_comments`, `studio_comment_audit`, and
`studio_comment_reports`. Run normal application migrations before serving the
new API. Review and comment writes share account rate limits: one per ten seconds,
30/hour, and ten reports/hour. Writes use existing account, session, origin and
CSRF validation. No new environment variables are required.

Public endpoints live under `/api/studio/library/:id/comments`: GET/POST on the
collection, PATCH/DELETE on `/:commentId`, GET `/:commentId/replies` and
`/:commentId/context`, POST `/:commentId/reports`. Administrative equivalents live
under `/api/studio/admin/library/:id/comments`, including GET history and POST
moderation. The report queue is `/api/studio/admin/comment-reports`; PATCH with
the report ID dismisses a report. Existing discussion-lock and notification
preference endpoints are reused.
