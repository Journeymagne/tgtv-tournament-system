const { ValidationError } = require("../http/io");
const { CRIT_OPS, KILLZONES } = require("./kill-teams");
const { pairScoreBrackets } = require("./tournaments/swiss");
const { shuffledIds } = require("./tournaments/seeding");

function teamSizeFor(value) {
  return value?.pairingType === "doubles" ? 2 : 3;
}

function usesIndividualTeamPoints(value) {
  return ["sword_shield_classic", "doubles"].includes(value?.pairingType);
}

function validTableKillzone(table, venueMode) {
  return KILLZONES.includes(table.killzone) || (venueMode === "irl" && (table.killzone == null || table.killzone === ""));
}

function usesSharedTeamTables(tournament) {
  return tournament.participantMode === "team" && tournament.venueMode === "tts" &&
    tournament.pairingType !== "sword_shield_classic";
}

function validateTeamTables(tables, venueMode = "tts", size = 3) {
  if (!Array.isArray(tables) || tables.length !== size ||
      tables.some((table) => !table || !validTableKillzone(table, venueMode) ||
        !["number", "string"].includes(typeof table.deployment) ||
        !Number.isInteger(Number(table.deployment)) || Number(table.deployment) < 1 || Number(table.deployment) > 6)) {
    throw new ValidationError(venueMode === "irl" ? `Configure ${size === 3 ? "three" : "two"} tables with deployments from 1 to 6; Killzones are optional` : "Configure three tables, each with a Killzone and a deployment from 1 to 6");
  }
  return tables;
}

function numberTeamTables(tables) {
  const numbered = tables.map((table, index) => ({ ...table,
    tableNumber: table.tableNumber === undefined ? index + 1
      : ["number", "string"].includes(typeof table.tableNumber) ? Number(table.tableNumber) : NaN }));
  if (numbered.some(table => !Number.isSafeInteger(table.tableNumber) || table.tableNumber < 1 || table.tableNumber > 2147483647) ||
      new Set(numbered.map(table => table.tableNumber)).size !== numbered.length) {
    throw new ValidationError("Table numbers must be unique positive integers");
  }
  return numbered;
}

function teamEnvironmentPlan(match) {
  if (match.captainPairingEnabled === false || match.pairingType === "doubles") return [];
  if (match.pairingType === "sword_shield_classic") {
    const first = match.attackerRosterId === match.rosterAId ? "a" : "b";
    const second = first === "a" ? "b" : "a";
    const choices = match.environment?.choices || [];
    const other = kind => kind === "table" ? "mission" : "table";
    return [
      { side: first, slot: first === "a" ? 1 : 2, kind: "either" },
      { side: second, slot: first === "a" ? 1 : 2, kind: other(choices[0]) },
      { side: second, slot: second === "a" ? 1 : 2, kind: "either" },
      { side: first, slot: second === "a" ? 1 : 2, kind: other(choices[2]) },
      ...(match.missions?.length > 3 ? [{ side: second, slot: 3, kind: "mission" }] : [])
    ];
  }
  const attacker = match.attackerRosterId === match.rosterAId ? "a" : "b";
  const defender = attacker === "a" ? "b" : "a";
  // Manual pairings retain slot ownership even when the players are overridden.
  const defenderSlot = match.pairings?.find((pair) => pair.shieldOwner === defender)?.slot;
  const attackerSlot = match.pairings?.find((pair) => pair.shieldOwner === attacker)?.slot;
  if (!defenderSlot || !attackerSlot) return [];
  return [
    { side: attacker, kind: "table", slot: defenderSlot },
    { side: defender, kind: "mission", slot: defenderSlot },
    { side: defender, kind: "table", slot: attackerSlot },
    { side: attacker, kind: "mission", slot: attackerSlot },
    { side: defender, kind: "mission", slot: 3 }
  ];
}

function teamRollRound(match) {
  const history = match.rollHistory || [];
  const last = history[history.length - 1];
  return !last || (last.a && last.b) ? history.length + 1 : history.length;
}

function teamNextAction(match) {
  if (match.pairingVersion !== 2) return null;
  if (match.phase === "mission_ban") {
    const attacker = match.attackerRosterId === match.rosterAId ? "a" : "b";
    return { kind: "ban", side: match.missionBans?.length ? attacker : attacker === "a" ? "b" : "a" };
  }
  if (match.phase === "environment_selection") {
    return teamEnvironmentPlan(match)[Number(match.environment?.step || 0)] || null;
  }
  return null;
}

function validateTeamTournament(tournament, rosters) {
  if (tournament.participantMode !== "team" || tournament.format !== "swiss" || tournament.teamSize !== teamSizeFor(tournament) ||
      (tournament.pairingType === "doubles" && tournament.venueMode !== "irl")) {
    throw new ValidationError("Team tournaments require Swiss and the correct roster size; Doubles requires IRL");
  }
  const started = tournament.status === "in_progress" || Boolean(tournament.startedAt);
  if (started && !rosters.length) throw new ValidationError("No active rosters remain in this tournament");
  if (rosters.length < (started ? 1 : 4) || rosters.length > 128) {
    throw new ValidationError("Team Swiss requires 4-128 active rosters");
  }
  if ((!started || tournament.pairingType === "doubles") && rosters.length % 2 !== 0) {
    throw new ValidationError("Team Swiss requires an even number of rosters; bye is not supported");
  }
}

function sortedRosters(rosters) {
  return [...rosters].sort((a, b) => Number(a.seed || 0) - Number(b.seed || 0) || a.id - b.id);
}

function buildFirstTeamRound(tournament, rosters) {
  validateTeamTournament(tournament, rosters);
  const seeded = sortedRosters(rosters);
  const bye = seeded.length % 2 ? seeded.pop() : null;
  const half = seeded.length / 2;
  return {
    roundNumber: 1,
    status: "active",
    pairings: seeded.slice(0, half).map((roster, index) => ({
      bracketPosition: index + 1,
      rosterAId: roster.id,
      rosterBId: seeded[index + half].id
    })).concat(bye ? [{ bracketPosition: half + 1, rosterAId: bye.id, rosterBId: null }] : [])
  };
}

function pairKey(aId, bId) {
  return [Number(aId), Number(bId)].sort((a, b) => a - b).join(":");
}

function teamMatchProgress(match) {
  const details = Array.isArray(match.games)
    ? match.games.filter((link) => link.game?.status === "completed" && link.game.result).map((link) => {
      const [playerAId, playerBId] = link.game.resultPlayerIds || link.game.playerIds;
      const scoreA = link.game.result.scores?.[playerAId] || {};
      const scoreB = link.game.result.scores?.[playerBId] || {};
      const vpA = Number(scoreA.total || 0);
      const vpB = Number(scoreB.total || 0);
      return {
        slot: link.slot, ...(usesIndividualTeamPoints(match) ? {} : gamePointsForTotals(vpA, vpB)), vpA, vpB,
        winnerSide: vpA === vpB ? null : vpA > vpB ? "a" : "b",
        tacA: Number(scoreA.tac || 0), tacB: Number(scoreB.tac || 0)
      };
    })
    : (match.gamePoints || []);
  const winPoints = match.pairingType === "doubles" ? 2 : 3;
  return {
    completed: details.length, total: teamSizeFor(match), details,
    winsA: details.filter(item => item.winnerSide === "a").length,
    winsB: details.filter(item => item.winnerSide === "b").length,
    tpA: details.reduce((sum, item) => sum + (item.winnerSide === "a" ? winPoints : item.winnerSide === null ? 1 : 0), 0),
    tpB: details.reduce((sum, item) => sum + (item.winnerSide === "b" ? winPoints : item.winnerSide === null ? 1 : 0), 0),
    gpA: usesIndividualTeamPoints(match) ? null : match.resolution ? Number(match.teamGamePointsA || 0) : details.reduce((sum, game) => sum + Number(game.a || 0), 0),
    gpB: usesIndividualTeamPoints(match) ? null : match.resolution ? Number(match.teamGamePointsB || 0) : details.reduce((sum, game) => sum + Number(game.b || 0), 0)
  };
}

function teamStandings(rosters, matches, order = null, tournament = {}) {
  const doubles = tournament.pairingType === "doubles" || matches.some(match => match.pairingType === "doubles");
  // Include withdrawn opponents in the calculation, then hide their ranking.
  const allRosters = [...rosters, ...(tournament.historicalRosters || []).filter(roster => !rosters.some(item => item.id === roster.id))];
  const rows = sortedRosters(allRosters).map((roster) => ({
    roster,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    teamTournamentPoints: 0,
    teamGamePoints: 0,
    individualWins: 0,
    totalVp: 0,
    vpDiff: 0,
    tacOpPoints: 0,
    strengthOfSchedule: 0,
    opponents: []
  }));
  const byId = new Map(rows.map((row) => [row.roster.id, row]));
  for (const match of matches) {
    if (doubles && match.phase !== "completed") continue;
    const a = byId.get(match.rosterAId);
    const b = byId.get(match.rosterBId);
    if (!a && !b) continue;
    const progress = teamMatchProgress(match);
    const classic = match.pairingType === "sword_shield_classic";
    const points = classic || doubles ? teamPointsForMatch(match, progress) : {
      a: Number(match.teamTournamentPointsA || 0), b: Number(match.teamTournamentPointsB || 0)
    };
    const details = progress.details;
    for (const [row, score, opponentScore, gamePoints, side] of [
      [a, points.a, points.b, details.length ? progress.gpA : match.teamGamePointsA, "a"],
      [b, points.b, points.a, details.length ? progress.gpB : match.teamGamePointsB, "b"]
    ]) {
      if (!row) continue;
      row.teamGamePoints += Number(gamePoints || 0);
      row.individualWins += details.filter((item) => item.winnerSide === side).length;
      row.totalVp += details.reduce((sum, item) => sum + Number(side === "a" ? item.vpA || 0 : item.vpB || 0), 0);
      row.vpDiff += details.reduce((sum, item) => sum + (side === "a" ? Number(item.vpA || 0) - Number(item.vpB || 0) : Number(item.vpB || 0) - Number(item.vpA || 0)), 0);
      row.tacOpPoints += details.reduce((sum, item) => sum + Number(side === "a" ? item.tacA : item.tacB), 0);
      if (classic) row.teamTournamentPoints += score;
      if (match.phase !== "completed") continue;
      row.played += 1;
      const opponentId = side === "a" ? match.rosterBId : match.rosterAId;
      if (opponentId) row.opponents.push(opponentId);
      if (!classic) row.teamTournamentPoints += score;
      if (score > opponentScore) row.wins += 1;
      else if (score === opponentScore) row.draws += 1;
      else row.losses += 1;
    }
  }
  if (doubles) {
    for (const row of rows) row.strengthOfSchedule = row.opponents.reduce((sum, id) => sum + (byId.get(id)?.teamTournamentPoints || 0), 0);
  }
  const fields = { individual_wins: "individualWins", vp_diff: "vpDiff", total_vp: "totalVp" };
  rows.sort((left, right) =>
    right.teamTournamentPoints - left.teamTournamentPoints ||
    (doubles ? right.strengthOfSchedule - left.strengthOfSchedule || right.totalVp - left.totalVp
      : order === null ? right.individualWins - left.individualWins || right.totalVp - left.totalVp || right.tacOpPoints - left.tacOpPoints
      : order.reduce((difference, key) => difference || right[fields[key]] - left[fields[key]], 0)) ||
    Number(left.roster.seed || 0) - Number(right.roster.seed || 0) ||
    left.roster.id - right.roster.id
  );
  const visible = new Set(rosters.map(roster => roster.id));
  return rows.filter(row => visible.has(row.roster.id)).map(({ opponents, ...row }, index) => ({ rank: index + 1, ...row }));
}

function buildNextTeamRound(tournament, rosters, matches, roundNumber, random = Math.random) {
  validateTeamTournament(tournament, rosters);
  if (!Number.isInteger(roundNumber) || roundNumber < 2 || roundNumber > tournament.swissRoundCount) {
    throw new ValidationError("Team Swiss round number is out of range");
  }
  const standings = teamStandings(rosters, matches, tournament.teamTiebreakerOrder ?? null, tournament);
  let bye = null;
  if (standings.length % 2) {
    const freeWins = (id) => matches.filter((match) => match.resolution &&
      ((match.rosterAId === id && match.teamTournamentPointsA > 1) ||
       (match.rosterBId === id && match.teamTournamentPointsB > 1))).length;
    const candidates = [...standings].reverse().sort((a, b) => freeWins(a.roster.id) - freeWins(b.roster.id));
    bye = candidates[0];
    standings.splice(standings.indexOf(bye), 1);
  }
  const withBye = (pairings) => pairings.concat(bye
    ? [{ bracketPosition: pairings.length + 1, rosterAId: bye.roster.id, rosterBId: null }] : []);
  const history = new Set(matches.map((match) => pairKey(match.rosterAId, match.rosterBId)));
  const standingsIndex = new Map(standings.map((row, index) => [row.roster.id, index]));
  // TP defines the draw groups. Personal wins, VP and seed only rank the table;
  // they must not select opponents within a group.
  const bracketPairs = pairScoreBrackets(standings.map((row) => ({
    ...row, participant: row.roster, matchPoints: row.teamTournamentPoints
  })), history, random);
  const randomizedStandings = shuffledIds(standings, random)
    .sort((a, b) => b.teamTournamentPoints - a.teamTournamentPoints);

  // If the groups force a rematch, look across groups before accepting it.
  // Choosing the most constrained roster first avoids a greedy rematch trap.
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
        Math.abs(selected.teamTournamentPoints - left.candidate.teamTournamentPoints) -
        Math.abs(selected.teamTournamentPoints - right.candidate.teamTournamentPoints)
      );
    for (const { candidateIndex } of selectedCandidates) {
      const next = [...remaining];
      const [opponent] = next.splice(candidateIndex, 1);
      const rest = freshMatching(next);
      if (rest) return [[selected, opponent], ...rest];
    }
    return null;
  }

  const freshPairs = bracketPairs.some(([a, b]) => history.has(pairKey(a.roster.id, b.roster.id)))
    ? freshMatching([...randomizedStandings]) : bracketPairs;
  if (freshPairs) {
    freshPairs.sort((left, right) =>
      Math.min(standingsIndex.get(left[0].roster.id), standingsIndex.get(left[1].roster.id)) -
      Math.min(standingsIndex.get(right[0].roster.id), standingsIndex.get(right[1].roster.id))
    );
    return {
      roundNumber,
      status: "active",
      pairings: withBye(freshPairs.map(([a, b], index) => ({
        bracketPosition: index + 1,
        rosterAId: a.roster.id,
        rosterBId: b.roster.id
      })))
    };
  }

  const remaining = [...randomizedStandings];
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
  return { roundNumber, status: "active", pairings: withBye(pairings) };
}

function normalizeRoundMissions(values = CRIT_OPS, pairingType = null) {
  if (pairingType === "doubles" && (!Array.isArray(values) || values.length !== 4)) {
    throw new ValidationError("Choose exactly four different missions for a Doubles round");
  }
  if (!Array.isArray(values) || values.length < 3 || values.length > CRIT_OPS.length) {
    throw new ValidationError("Choose between three and nine missions for a team round");
  }
  const missions = values.map((value) => {
    const critOp = String(typeof value === "string" ? value : value?.critOp || "").trim();
    if (!CRIT_OPS.includes(critOp)) throw new ValidationError("Choose valid team-round missions");
    return { critOp };
  });
  if (new Set(missions.map((mission) => mission.critOp)).size !== missions.length) {
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
    throw new ValidationError("WTC selections must use current roster members");
  }
  if (shieldA === swordB || shieldB === swordA) {
    throw new ValidationError("A player can appear in only one pairing");
  }
  const remainingA = membersA.find((member) => ![shieldA, swordB].includes(member.id));
  const remainingB = membersB.find((member) => ![shieldB, swordA].includes(member.id));
  if (!remainingA || !remainingB) throw new ValidationError("WTC pairing could not be completed");
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
  if (points < 28) return { a: 0, b: 2 };
  if (points > 32) return { a: 2, b: 0 };
  return { a: 1, b: 1 };
}

function teamPointsForMatch(match, progress = teamMatchProgress(match)) {
  if (match.pairingType === "doubles") {
    const score = doublesScoring(match, progress);
    return { a: score.baseTpA + (score.vpBonusA || 0), b: score.baseTpB + (score.vpBonusB || 0) };
  }
  if (match.pairingType !== "sword_shield_classic") return teamTournamentPoints(progress.gpA);
  if (match.resolution === "bye") return { a: 9, b: 0 };
  if (match.resolution === "forfeit") {
    return Number(match.teamTournamentPointsA || 0) > Number(match.teamTournamentPointsB || 0)
      ? { a: 9, b: 0 } : { a: 0, b: 9 };
  }
  const draws = Math.max(0, Number(progress.completed || 0) - progress.winsA - progress.winsB);
  return { a: progress.winsA * 3 + draws, b: progress.winsB * 3 + draws };
}

function doublesScoring(match, progress = teamMatchProgress(match)) {
  const totalVpA = progress.details.reduce((sum, game) => sum + game.vpA, 0);
  const totalVpB = progress.details.reduce((sum, game) => sum + game.vpB, 0);
  const complete = progress.completed === 2;
  return {
    baseTpA: progress.tpA, baseTpB: progress.tpB, totalVpA, totalVpB,
    vpBonusA: complete ? Number(totalVpA > totalVpB) : null,
    vpBonusB: complete ? Number(totalVpB > totalVpA) : null
  };
}

function validateTeamLines(tables, venueMode = "tts", size = 3) {
  if (!Array.isArray(tables) || !tables.length || tables.length % size || tables.length > 128 * size ||
      tables.some(table => !table || !validTableKillzone(table, venueMode) || !["number", "string"].includes(typeof table.deployment) || !Number.isInteger(Number(table.deployment)) || Number(table.deployment) < 1 || Number(table.deployment) > 6)) {
    throw new ValidationError(venueMode === "irl" ? `Configure complete lines of ${size === 3 ? "three" : "two"} tables with deployments (1–6); Killzones are optional` : "Configure complete lines of three tables with a Killzone and deployment (1–6) on every table");
  }
  return numberTeamTables(tables.map(table => ({ ...table, killzone: table.killzone || "" })));
}

module.exports = {
  teamSizeFor,
  usesIndividualTeamPoints,
  doublesScoring,
  usesSharedTeamTables,
  validateTeamLines,
  teamPointsForMatch,
  teamMatchProgress,
  validateTeamTables,
  numberTeamTables,
  teamEnvironmentPlan,
  teamRollRound,
  teamNextAction,
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
