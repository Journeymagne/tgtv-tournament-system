const { teamPointsForMatch, teamMatchProgress, teamSizeFor, gamePointsForTotals } = require("../team-tournaments");
const { leaguePick, uniquePicks, playedOrDeclared } = require("./picks");

const finite = value => Number.isFinite(value) ? value : null;
const sum = values => values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : null;

function completedTeamMatch(match, picksByMember) {
  const links = (match.games || []).filter(link => link.game?.status === "completed" && link.game.result);
  const archived = Array.isArray(match.gamePoints) ? match.gamePoints : [];
  const details = links.map(link => {
    const game = link.game;
    const [a, b] = game.resultPlayerIds || game.playerIds || [];
    const left = game.result.scores?.[a] || {};
    const right = game.result.scores?.[b] || {};
    for (const [member, score] of [[link.rosterAMemberId, left], [link.rosterBMemberId, right]]) {
      if (!member || !score.faction) continue;
      if (!picksByMember.has(member)) picksByMember.set(member, []);
      picksByMember.get(member).push(leaguePick(score.faction));
    }
    return { slot: link.slot, vpA: finite(left.total), vpB: finite(right.total), tacA: finite(left.tac), tacB: finite(right.tac) };
  });
  // Older games can retain the final numeric breakdown after the link was lost.
  const bySlot = new Map(archived.map((d, i) => [d.slot ?? i + 1, d]));
  for (const detail of details) {
    const merged = { ...bySlot.get(detail.slot) };
    for (const [field, value] of Object.entries(detail)) if (value != null) merged[field] = value;
    bySlot.set(detail.slot, merged);
  }
  const breakdown = [...bySlot.values()];
  const complete = Boolean(match.resolution) || breakdown.length === teamSizeFor(match);
  const hasVp = breakdown.every(d => Number.isFinite(d.vpA) && Number.isFinite(d.vpB));
  let derived = {};
  if (!match.resolution && complete && hasVp) {
    const numericDetails = breakdown.map(d => ({ ...d, ...gamePointsForTotals(d.vpA, d.vpB),
      winnerSide: d.vpA > d.vpB ? "a" : d.vpA < d.vpB ? "b" : null }));
    derived = teamPointsForMatch(match, teamMatchProgress({ ...match, games: undefined, gamePoints: numericDetails }));
  } else if (match.resolution === "bye" && teamSizeFor(match) === 3) {
    derived = { a: match.pairingType === "sword_shield_classic" ? 9 : 2, b: 0 };
  }
  const result = {};
  for (const [side, other] of [["A", "B"], ["B", "A"]]) {
    const key = side.toLowerCase();
    const ownVp = sum(breakdown.map(d => d["vp" + side]));
    const oppVp = sum(breakdown.map(d => d["vp" + other]));
    const wins = breakdown.map(d => Number.isFinite(d.vpA) && Number.isFinite(d.vpB)
      ? Number(d["vp" + side] > d["vp" + other]) : null);
    result[key] = {
      points: finite(match["teamTournamentPoints" + side]) ?? finite(derived[key]),
      total_vp: complete ? ownVp : null,
      vp_diff: complete && ownVp != null && oppVp != null ? ownVp - oppVp : null,
      individual_wins: complete ? sum(wins) : null,
      tac_op: complete ? sum(breakdown.map(d => d["tac" + side])) : null
    };
  }
  return result;
}

function teamContributions(bundle, output, base) {
  const { tournament, rosters = [], teamMatches = [] } = bundle;
  const official = new Map(tournament.finalResults.map(row => [row.rosterId, row]));
  const byRoster = new Map(rosters.map(roster => [roster.id, roster]));
  const picksByMember = new Map();
  const gamesByRoster = new Map();
  for (const match of teamMatches.filter(match => match.phase === "completed")) {
    const sides = completedTeamMatch(match, picksByMember);
    for (const [id, opponent, values] of [[match.rosterAId, match.rosterBId, sides.a], [match.rosterBId, match.rosterAId, sides.b]]) {
      if (!id) continue;
      if (!gamesByRoster.has(id)) gamesByRoster.set(id, []);
      gamesByRoster.get(id).push({ opponent, ...values });
    }
  }
  const results = new Map();
  for (const roster of rosters) {
    const publication = official.get(roster.id) || {};
    const games = gamesByRoster.get(roster.id) || [];
    const expected = sum([publication.wins, publication.losses, publication.draws]) ?? (official.has(roster.id) ? tournament.swissRoundCount : null);
    const complete = games.length > 0 && (expected == null || expected === games.length);
    const recover = metric => complete ? sum(games.map(game => game[metric])) : null;
    const rawTp = finite(publication.teamTournamentPoints) ?? recover("points");
    results.set(roster.id, { games, complete, rawTp, metrics: {
      total_vp: finite(publication.totalVp) ?? recover("total_vp"),
      vp_diff: finite(publication.vpDiff) ?? recover("vp_diff"),
      individual_wins: finite(publication.individualWins) ?? recover("individual_wins"),
      tac_op: finite(publication.tacOpPoints) ?? recover("tac_op")
    } });
  }

  for (const [id, result] of official) {
    const roster = byRoster.get(id);
    if (!roster?.teamId) {
      output.missing(roster ? "teamId" : "rosterId", { rosterId: id });
      continue;
    }
    const { games, complete, rawTp, metrics } = results.get(id);
    if (!games.length && (sum([result.wins, result.draws, result.losses]) === 0 ||
      ["registered", "withdrawn"].includes(roster.status))) continue;
    if (base.format === "doubles") {
      const opponents = games.filter(game => game.opponent);
      const values = opponents.map(game => results.get(game.opponent)?.rawTp);
      const total = complete ? sum(values) : null;
      const mean = tournament.pairingType === "wtc_doubles";
      const recovered = total == null ? null : total / (mean ? Math.max(1, opponents.length) : 1);
      metrics[mean ? "average_sos" : "strength_of_schedule"] = mean
        ? recovered ?? finite(result.strengthOfSchedule) : finite(result.strengthOfSchedule) ?? recovered;
    }
    const members = (roster.members || []).map(member => ({
      id: member.id, name: member.displayNameSnapshot, slot: member.slot, joinedAt: member.joinedAt, endedAt: member.endedAt,
      picks: playedOrDeclared(picksByMember.get(member.id) || [], member.factions)
    }));
    output.contributions.push({ ...base, sourceKey: tournament.id + ":roster:" + id, subjectKey: "team:" + roster.teamId,
      rosterId: id, name: roster.team?.name || roster.teamNameSnapshot || roster.name, displayName: roster.name,
      teamNameSnapshot: roster.teamNameSnapshot, identityStatus: "organization", rank: finite(result.rank),
      awardPlace: true, rawTp, metrics, members, picks: uniquePicks(members.flatMap(member => member.picks))
    });
  }
}

module.exports = { teamContributions };
