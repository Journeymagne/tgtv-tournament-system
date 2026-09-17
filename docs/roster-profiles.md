# Tournament roster profiles

- `/#/rosters/:id` is the public page for one registered roster. Standings,
  tournament roster lists, team-match roster names, and the team's tournament
  participation history link here. The parent team remains a separate link.
- `GET /api/rosters/:rosterId` returns the roster, tournament summary, standing,
  and team matches filtered by that roster ID within that tournament. Matches
  include individual game results and the round's table information.
- The page displays the roster's players (including former members), captain,
  seed, status, tournament place and statistics. Match history is newest round
  first; scores follow the displayed roster A / roster B order.
- History cards link to match/game details. Result entry and pairing controls
  remain on the match and game pages. Back retraces the actual navigation;
  opening the roster by a direct link falls back to the tournament standings.
- Unpublished tournaments are visible only to administrators. The existing
  first-round faction visibility rules apply to every roster in the response.
  Pairing history and unrevealed choices use the same redaction as match pages.
- Withdrawn rosters retain their member history, games and statistics, but have
  no current standing rank. Final published standings take precedence once set.

Coverage: client roster/navigation tests and the roster visibility integration
scenario test same-team rosters, another tournament, side A/B scoring, former
members, withdrawn rosters, private tournaments and late navigation responses.
