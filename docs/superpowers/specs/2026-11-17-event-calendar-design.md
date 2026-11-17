# Event calendar

Approved direction: desktop calendar plus chronological list (concept 5), with the dedicated mobile calendar and selected-day list (concept 6). Integrate into the existing tournament application and its UI kit; retain its header, navigation, account controls, themes, localization and native component styles. Remove the game/system picker: all events are Kill Team.

Calendar announcements are independent persisted records. Fields: name, date, optional local start time, city, venue, optional address, tournament type (solo, teams, pairs), participant limit and participation fee in RUB. Public visitors can browse; only global administrators create, edit or delete announcements. Use the actual calendar date without timezone shifts. Default to the current month and day; support month navigation, date selection, search, city and tournament-type filters, and explicit empty/loading/error states.

Desktop: compact month, chronological month list, selected-event details. Mobile: compact month, selected-day events (with a month-list toggle), filters behind an accessible disclosure, details in a native dialog. Reuse the application shell and UI-kit controls; no prototype selector, alternate header, phone frame or additional navigation bar.

An admin can open the existing tournament-creation screen in a new tab from an announcement. Fetch the source event by ID, prefill its name, date/time, venue, Kill Team and participant/team format. Capacity is counted in players on the announcement and converted to roster count for team tournaments. Creation and linking run in one transaction with a locked event, preventing duplicate tournaments on repeated/concurrent submission. Public calendar records never reveal unpublished tournament slugs/IDs. Deleting an announcement leaves its tournament intact; deleting a tournament clears the optional link. Event edits do not silently overwrite tournament settings.

Alternatives considered: a full month grid (concept 1), split month/details (2), calendar with featured events (3), and week schedule (4). The user selected 5 and 6 for the final responsive page.

Implementation uses the existing Node/PostgreSQL application, scoped tournaments schema and lazy-loaded client module. Preserve normal production authentication. Local preview autologin and fixture seeding live exclusively in ignored work/ files and use a verified local database. Automated checks run in CI, never locally under the standing AGENTS.md instruction.
