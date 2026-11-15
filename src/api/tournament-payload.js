// Send each roster and match once; the browser restores references for renderers.
function tournamentPayload(data, query) {
  if (query?.get("compact") !== "1" || !data.teamMatches) return data;
  return {
    ...data,
    compactTeamTournament: true,
    teamMatches: data.teamMatches.map(({ rosterA, rosterB, ...match }) => match),
    rounds: data.rounds.map(({ matches, ...round }) => round)
  };
}
module.exports = { tournamentPayload };
