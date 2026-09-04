const { ValidationError } = require("../http/io");
const { CRIT_OPS } = require("./kill-teams");

function validateTeamTournament(tournament, rosters) {
  if (tournament.participantMode !== "team" || tournament.format !== "swiss" || tournament.teamSize !== 3) {
    throw new ValidationError("Team tournaments require Swiss and rosters of three");
  }
  if (rosters.length < 4 || rosters.length > 128) {
    throw new ValidationError("Team Swiss requires 4-128 active rosters");
  }
  if (rosters.length % 2 !== 0) {
    throw new ValidationError("Team Swiss requires an even number of rosters; bye is not supported");
  }
}

function sortedRosters(rosters) {
  return [...rosters].sort((a, b) => Number(a.seed || 0) - Number(b.seed || 0) || a.id - b.id);
}

function buildFirstTeamRound(tournament, rosters) {
  validateTeamTournament(tournament, rosters);
  const seeded = sortedRosters(rosters);
  const half = seeded.length / 2;
  return {
    roundNumber: 1,
    status: "active",
    pairings: seeded.slice(0, half).map((roster, index) => ({
      bracketPosition: index + 1,
      rosterAId: roster.id,
      rosterBId: seeded[index + half].id
    }))
  };
}

function pairKey(aId, bId) {
  return [Number(aId), Number(bId)].sort((a, b) => a - b).join(":");
}

function teamStandings(rosters, matches) {
  const rows = sortedRosters(rosters).map((roster) => ({
    roster,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    teamTournamentPoints: 0,
    teamGamePoints: 0,
    individualWins: 0,
    tacOpPoints: 0
  }));
  const byId = new Map(rows.map((row) => [row.roster.id, row]));
  for (const match of matches) {
    if (match.phase !== "completed") continue;
    const a = byId.get(match.rosterAId);
    const b = byId.get(match.rosterBId);
    if (!a || !b) continue;
    const pointsA = Number(match.teamTournamentPointsA || 0);
    const pointsB = Number(match.teamTournamentPointsB || 0);
    const details = Array.isArray(match.gamePoints) ? match.gamePoints : [];
    for (const [row, points, gamePoints, side] of [
      [a, pointsA, match.teamGamePointsA, "a"],
      [b, pointsB, match.teamGamePointsB, "b"]
    ]) {
      row.played += 1;
      row.teamTournamentPoints += points;
      row.teamGamePoints += Number(gamePoints || 0);
      row.individualWins += details.filter((item) => item.winnerSide === side).length;
      row.tacOpPoints += details.reduce((sum, item) => sum + Number(side === "a" ? item.tacA : item.tacB), 0);
      if (points === 2) row.wins += 1;
      else if (points === 1) row.draws += 1;
      else row.losses += 1;
    }
  }
  rows.sort((left, right) =>
    right.teamTournamentPoints - left.teamTournamentPoints ||
    right.teamGamePoints - left.teamGamePoints ||
    right.individualWins - left.individualWins ||
    right.tacOpPoints - left.tacOpPoints ||
    Number(left.roster.seed || 0) - Number(right.roster.seed || 0) ||
    left.roster.id - right.roster.id
  );
  return rows.map((row, index) => ({ rank: index + 1, ...row }));
}

function buildNextTeamRound(tournament, rosters, matches, roundNumber) {
  validateTeamTournament(tournament, rosters);
  if (!Number.isInteger(roundNumber) || roundNumber < 2 || roundNumber > tournament.swissRoundCount) {
    throw new ValidationError("Team Swiss round number is out of range");
  }
  const standings = teamStandings(rosters, matches);
  const history = new Set(matches.map((match) => pairKey(match.rosterAId, match.rosterBId)));
  const standingsIndex = new Map(standings.map((row, index) => [row.roster.id, index]));

  // Prefer a complete matching without rematches. Choosing the most constrained
  // roster first prevents an early greedy choice from trapping the final pair.
  let searchSteps = 0;
  function freshMatching(remaining) {
    searchSteps += 1;
    if (searchSteps > 100000) return null;
    if (!remaining.length) return [];
    let selectedIndex = 0;
    let selectedCandidates = null;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidates = remaining
        .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
        .filter(({ candidateIndex, candidate }) => candidateIndex !== index &&
          !history.has(pairKey(remaining[index].roster.id, candidate.roster.id)));
      if (!candidates.length) return null;
      if (!selectedCandidates || candidates.length < selectedCandidates.length) {
        selectedIndex = index;
        selectedCandidates = candidates;
      }
    }
    const [selected] = remaining.splice(selectedIndex, 1);
    selectedCandidates = remaining
      .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
      .filter(({ candidate }) => !history.has(pairKey(selected.roster.id, candidate.roster.id)))
      .sort((left, right) =>
        Math.abs(standingsIndex.get(selected.roster.id) - standingsIndex.get(left.candidate.roster.id)) -
        Math.abs(standingsIndex.get(selected.roster.id) - standingsIndex.get(right.candidate.roster.id))
      );
    for (const { candidateIndex } of selectedCandidates) {
      const next = [...remaining];
      const [opponent] = next.splice(candidateIndex, 1);
      const rest = freshMatching(next);
      if (rest) return [[selected, opponent], ...rest];
    }
    return null;
  }

  const freshPairs = freshMatching([...standings]);
  if (freshPairs) {
    freshPairs.sort((left, right) =>
      Math.min(standingsIndex.get(left[0].roster.id), standingsIndex.get(left[1].roster.id)) -
      Math.min(standingsIndex.get(right[0].roster.id), standingsIndex.get(right[1].roster.id))
    );
    return {
      roundNumber,
      status: "active",
      pairings: freshPairs.map(([a, b], index) => ({
        bracketPosition: index + 1,
        rosterAId: a.roster.id,
        rosterBId: b.roster.id
      }))
    };
  }

  const remaining = [...standings];
  const pairings = [];
  while (remaining.length) {
    const a = remaining.shift();
    let opponentIndex = remaining.findIndex((candidate) => !history.has(pairKey(a.roster.id, candidate.roster.id)));
    if (opponentIndex < 0) opponentIndex = 0;
    const [b] = remaining.splice(opponentIndex, 1);
    pairings.push({
      bracketPosition: pairings.length + 1,
      rosterAId: a.roster.id,
      rosterBId: b.roster.id
    });
  }
  return { roundNumber, status: "active", pairings };
}

function normalizeRoundMissions(values) {
  if (!Array.isArray(values) || values.length !== 3) {
    throw new ValidationError("Choose exactly three missions for a team round");
  }
  const missions = values.map((value) => {
    const critOp = String(typeof value === "string" ? value : value?.critOp || "").trim();
    if (!CRIT_OPS.includes(critOp)) throw new ValidationError("Choose valid team-round missions");
    return { critOp };
  });
  if (new Set(missions.map((mission) => mission.critOp)).size !== 3) {
    throw new ValidationError("Team-round missions must be unique");
  }
  return missions;
}

function buildShieldSwordPairings(membersA, membersB, selections) {
  const aIds = new Set(membersA.map((member) => member.id));
  const bIds = new Set(membersB.map((member) => member.id));
  const shieldA = Number(selections.shieldA);
  const shieldB = Number(selections.shieldB);
  const swordA = Number(selections.swordA);
  const swordB = Number(selections.swordB);
  if (!aIds.has(shieldA) || !bIds.has(shieldB) || !bIds.has(swordA) || !aIds.has(swordB)) {
    throw new ValidationError("Shield-Sword selections must use current roster members");
  }
  if (shieldA === swordB || shieldB === swordA) {
    throw new ValidationError("A player can appear in only one pairing");
  }
  const remainingA = membersA.find((member) => ![shieldA, swordB].includes(member.id));
  const remainingB = membersB.find((member) => ![shieldB, swordA].includes(member.id));
  if (!remainingA || !remainingB) throw new ValidationError("Shield-Sword pairing could not be completed");
  return [
    { slot: 1, rosterAMemberId: shieldA, rosterBMemberId: swordA, shieldOwner: "a" },
    { slot: 2, rosterAMemberId: swordB, rosterBMemberId: shieldB, shieldOwner: "b" },
    { slot: 3, rosterAMemberId: remainingA.id, rosterBMemberId: remainingB.id, shieldOwner: null }
  ];
}

function gamePointsForTotals(totalA, totalB) {
  const difference = Math.max(-10, Math.min(10, Number(totalA || 0) - Number(totalB || 0)));
  const a = 10 + difference;
  return { a, b: 20 - a };
}

function teamTournamentPoints(teamGamePointsA) {
  const points = Number(teamGamePointsA || 0);
  if (points < 26) return { a: 0, b: 2 };
  if (points > 34) return { a: 2, b: 0 };
  return { a: 1, b: 1 };
}

module.exports = {
  validateTeamTournament,
  buildFirstTeamRound,
  buildNextTeamRound,
  teamStandings,
  pairKey,
  normalizeRoundMissions,
  buildShieldSwordPairings,
  gamePointsForTotals,
  teamTournamentPoints
};
