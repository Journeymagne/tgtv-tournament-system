const {
  canonicalKillTeam,
  CLASSIFIED_TRACK,
  ALL_KILL_TEAM_TRACK,
  WILDCARDS
} = require("./kill-teams");

function buildChallengeEvents(games, user) {
  const gameEvents = games
    .filter((game) => game.status === "completed" && game.result?.winnerId === user.id)
    .map((game) => ({
      team: canonicalKillTeam(game.result.scores?.[user.id]?.faction),
      source: "game",
      action: "credit",
      gameId: game.id,
      at: game.submittedAt || game.createdAt || null
    }));

  const manualEvents = (user.challengeCredits || []).map((credit) => ({
    team: canonicalKillTeam(credit.team),
    source: "manual",
    action: credit.action === "deduct" ? "deduct" : "credit",
    creditedBy: credit.creditedBy || credit.deductedBy || null,
    at: credit.creditedAt || credit.deductedAt || null
  }));

  return [...gameEvents, ...manualEvents]
    .filter((event) => event.team)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function buildTrackProgress(events, teams, wildcards) {
  const completed = [];
  const wildcardCompleted = [];

  for (const event of events) {
    if (wildcards.includes(event.team)) {
      const index = wildcardCompleted.findIndex((item) => item.team === event.team);
      if (event.action === "deduct") {
        if (index !== -1) wildcardCompleted.splice(index, 1);
      } else if (index === -1) {
        wildcardCompleted.push({ ...event });
      }
      continue;
    }

    const teamIndex = teams.indexOf(event.team);
    if (teamIndex === -1) continue;

    const completedIndex = completed.findIndex((item) => item.team === event.team);
    if (event.action === "deduct") {
      if (completedIndex !== -1) completed.splice(completedIndex, 1);
      continue;
    }
    if (completedIndex === -1) {
      completed.push({ ...event, order: teamIndex + 1 });
    }
  }

  const completedTeams = new Set(completed.map((item) => item.team));
  const nextIndex = teams.findIndex((team) => !completedTeams.has(team));
  const currentIndex = nextIndex === -1 ? teams.length : nextIndex;

  return {
    total: teams.length,
    completedCount: completed.length,
    nextTeam: teams[currentIndex] || null,
    completed,
    wildcardCompleted,
    teams: teams.map((team, index) => ({
      order: index + 1,
      team,
      status: completedTeams.has(team)
        ? "completed"
        : index === currentIndex
          ? "current"
          : "locked",
      credit: completed.find((item) => item.team === team) || null
    })),
    wildcards: wildcards.map((team) => ({
      team,
      status: wildcardCompleted.some((item) => item.team === team) ? "completed" : "available",
      credit: wildcardCompleted.find((item) => item.team === team) || null
    }))
  };
}

function buildChallengeTracks(games, user) {
  const events = buildChallengeEvents(games, user);
  return {
    classified: buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS),
    allKillTeam: buildTrackProgress(events, ALL_KILL_TEAM_TRACK, WILDCARDS)
  };
}

module.exports = { buildChallengeEvents, buildTrackProgress, buildChallengeTracks };
