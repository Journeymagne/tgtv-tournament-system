# Tournament venue addresses

IRL tournaments have an optional plain-text venue address (maximum 500 characters).
Tournament organizers can set it in the creation and settings forms, change it
after the tournament starts, or clear it. Completed and cancelled events retain
their existing read-only settings policy. The address appears on public event
cards only for IRL events. Changing an event to TTS clears its address.

Public event cards also show the venue type. Events are ordered by creation time,
newest first, within their existing status categories.

Migration 055_tournament_venue_address follows 054_user_bcp_email and adds
tournaments.venue_address with an empty default and a 500-character constraint.
Published migration 032_studio_projects remains unchanged. The older unpublished
032_tournament_venue_address is not registered or shipped in main.

The integration retains current faction limits, season defaults, roster settings
and IRL Doubles rules. No new dependencies or environment variables are required.

## Merge verification — 13 October 2026

All 1050 unit and integration tests passed, with zero failures, cancellations or
skips, as part of merging into main. They used only the dedicated local PostgreSQL
database venue_address_merge_test_20261013 on 127.0.0.1:5432. The upgrade check
starts from migration 054, applies only 055, retains Studio migration 032 and the
existing tournament's name and three-faction setting, and checks the database
length limit. Fresh-schema, address persistence, editing after start and
read-only completed-event checks also passed.

Browser verification used a separate venue_address_preview_20261013 database
and a normal LocalPreviewAdmin session on loopback port 3006. Creating IRL
Doubles automatically showed the address field and retained two-player rosters
and three optional factions. Address autosave, reload, public cards, clearing,
overlong-value rejection and denial of ordinary-player edits passed. Desktop
and 390px mobile cards were visually inspected; RU/EN and light/dark settings
worked, with no browser page errors or horizontal overflow.

The merge also updates isolated UI harnesses for the previously released roster
editor and leaderboard search, and recognizes Best Coast Pairings as a product
name in the translation check. Their existing assertions remain in place.

Ignored evidence in the canonical MMR KIT runtime is under work/venue-address/;
the full test transcript is work/venue-merge-tests.tap.log. Application package
versions remain 1.2.0; tournament asset markers use 1.2.0-venue-address to refresh
cached client scripts and styles.
