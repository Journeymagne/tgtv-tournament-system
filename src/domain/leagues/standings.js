const { validateLeagueRules } = require("./rules");
const { uniquePicks } = require("./picks");

function aggregateCriterion(row, criterion) {
  if (criterion.metric === "events") return row.eventCount;
  if (criterion.metric === "head_to_head") return 0;
  const byEvent = new Map();
  for (const source of row.history) {
    const value = source.metrics[criterion.metric];
    byEvent.set(source.tournamentId, (byEvent.get(source.tournamentId) ?? 0) + value);
  }
  const values = Array.from(byEvent.values());
  return criterion.aggregate === "max" ? Math.max(...values) : values.reduce((sum, value) => sum + value, 0);
}

function tiedGroups(items, score) {
  const sorted = [...items].sort((a, b) => score(b) - score(a));
  const groups = [];
  for (const item of sorted) {
    const last = groups.at(-1);
    if (last && score(last[0]) === score(item)) last.push(item);
    else groups.push([item]);
  }
  return groups;
}

function buildLeagueStandings(contributions, encounters, rule) {
  const { primary, scale, criteria } = validateLeagueRules(rule);
  const hasHeadToHead = criteria.some(c => c.metric === "head_to_head");
  const historyByWinnerSource = new Map();
  const subjects = new Map();
  for (const source of contributions) {
    let row = subjects.get(source.subjectKey);
    if (!row) {
      row = { subjectKey: source.subjectKey, name: source.name, identityStatus: source.identityStatus, points: 0, history: [] };
      subjects.set(source.subjectKey, row);
    }
    const placePoints = source.awardPlace ? scale[Math.min(source.rank, scale.length) - 1] : 0;
    const points = primary === "place" ? placePoints : source.rawTp;
    row.points += points;
    const history = { ...source, points };
    if (hasHeadToHead) {
      history.metrics = { ...source.metrics, head_to_head: 0 };
      for (const key of source.sourceKeys || [source.sourceKey]) historyByWinnerSource.set(key, history);
    }
    row.history.push(history);
  }
  for (const row of subjects.values()) {
    row.eventCount = new Set(row.history.map(item => item.tournamentId)).size;
    row.picks = uniquePicks(row.history.flatMap(item => item.picks || []));
    row.criteriaValues = criteria.map(criterion => aggregateCriterion(row, criterion));
  }
  let groups = tiedGroups([...subjects.values()], row => row.points);
  for (const [index, criterion] of criteria.entries()) {
    if (criterion.metric === "head_to_head") {
      const groupOf = new Map();
      for (const group of groups) for (const row of group) groupOf.set(row.subjectKey, group);
      for (const { a, b, winner, winnerSourceKey } of encounters) {
        if (a !== b && winner && subjects.has(winner) && groupOf.has(a) && groupOf.get(a) === groupOf.get(b)) {
          subjects.get(winner).criteriaValues[index]++;
          const history = historyByWinnerSource.get(winnerSourceKey);
          if (history) history.metrics.head_to_head++;
        }
      }
    }
    groups = groups.flatMap(group => tiedGroups(group, row => row.criteriaValues[index]));
  }
  let nextRank = 1;
  return groups.flatMap(group => {
    const rank = nextRank;
    nextRank += group.length;
    return group.sort((a, b) => a.name.localeCompare(b.name) || a.subjectKey.localeCompare(b.subjectKey))
      .map(row => ({ ...row, rank }));
  });
}

module.exports = { buildLeagueStandings };

