(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TGTVPairingWarnings = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  function player(person, fallbackId, prefix = "participant") {
    if (!person && !fallbackId) return null;
    const id = fallbackId || person?.id;
    return {
      key: person?.userId ? `user:${person.userId}` : `${prefix}:${id}`,
      name: person?.displayName || person?.displayNameSnapshot || person?.playerName || person?.name || "—"
    };
  }

  function individual(match, participants = [], tables = []) {
    const person = (side) => {
      const id = match[`participant${side}Id`];
      const current = match[`participant${side}`] || participants.find(item => item.id === Number(id));
      return player(match.participantSnapshots?.[id] || current, id);
    };
    return {
      roundNumber: Number(match.roundNumber), status: match.status, isBye: Boolean(match.isBye),
      a: person("A"), b: person("B"), tableId: match.tableId || match.table?.id || null,
      tableNumber: match.table?.tableNumber || tables.find(table => table.id === Number(match.tableId))?.tableNumber || null
    };
  }

  function team(match, rosters = []) {
    const roster = (side) => {
      const id = match[`roster${side}Id`];
      const value = match[`roster${side}`] || rosters.find(item => item.id === Number(id));
      return id ? { key: `roster:${id}`, name: value?.name || "—" } : null;
    };
    return { roundNumber: Number(match.roundNumber), status: match.phase || match.status,
      isBye: !match.rosterAId || !match.rosterBId, kind: "team", a: roster("A"), b: roster("B") };
  }

  function teamGames(match, rosters = [], tables = []) {
    const rosterA = match.rosterA || rosters.find(item => item.id === match.rosterAId);
    const rosterB = match.rosterB || rosters.find(item => item.id === match.rosterBId);
    const links = new Map((match.games || []).map(link => [Number(link.slot), link]));
    const assignments = new Map((match.environment?.assignments || []).map(item => [Number(item.slot), item]));
    const pairings = new Map((match.pairings || []).map(item => [Number(item.slot), item]));
    return [...new Set([...links.keys(), ...pairings.keys()])].map(slot => {
      const link = links.get(slot);
      const pair = link || pairings.get(slot);
      const assignment = link || assignments.get(slot) || {};
      const memberA = rosterA?.members?.find(member => member.id === Number(pair.rosterAMemberId));
      const memberB = rosterB?.members?.find(member => member.id === Number(pair.rosterBMemberId));
      const snapshots = link?.game?.participants || link?.game?.players || [];
      const table = link?.table || (match.tables || tables).find(item => item.id === Number(assignment.tableId));
      return { slot, roundNumber: Number(match.roundNumber), status: link?.game?.status || match.phase,
        isBye: match.resolution === "bye" || (!link && Boolean(match.resolution)),
        a: player(snapshots[0] || memberA, pair.rosterAMemberId, "member"),
        b: player(snapshots[1] || memberB, pair.rosterBMemberId, "member"),
        tableId: assignment.tableId || null, tableNumber: table?.tableNumber || null };
    });
  }

  function history(data = {}) {
    const teamMatches = data.teamMatches || [];
    return {
      teams: teamMatches.map(match => team(match, data.rosters)),
      players: data.tournament?.participantMode === "team"
        ? teamMatches.flatMap(match => teamGames(match, data.rosters, data.tables))
        : (data.rounds || []).flatMap(round => (round.matches || []).map(match =>
          individual({ ...match, roundNumber: round.roundNumber }, data.participants, data.tables)))
    };
  }

  function warnings(match, previous = [], venueMode = "tts") {
    if (match.isBye || !match.a || !match.b || match.a.key === match.b.key) return [];
    const earlier = previous.filter(item => !item.isBye && item.status === "completed" &&
      item.roundNumber < match.roundNumber && item.a && item.b);
    const pairKey = [match.a.key, match.b.key].sort().join("|");
    const rounds = items => [...new Set(items.map(item => item.roundNumber))].sort((a, b) => a - b);
    const repeats = earlier.filter(item => [item.a.key, item.b.key].sort().join("|") === pairKey);
    const result = repeats.length ? [{ kind: match.kind === "team" ? "team_rematch" : "rematch",
      pairKey, names: [match.a.name, match.b.name], rounds: rounds(repeats) }] : [];
    if (venueMode === "irl" && match.tableId) {
      for (const person of [match.a, match.b]) {
        const visits = earlier.filter(item => Number(item.tableId) === Number(match.tableId) &&
          [item.a.key, item.b.key].includes(person.key));
        if (visits.length) result.push({ kind: "table_repeat", playerKey: person.key, names: [person.name],
          tableId: Number(match.tableId), tableNumber: match.tableNumber, rounds: rounds(visits) });
      }
    }
    return result;
  }

  function assignTables(matches, tables = [], previous = []) {
    const used = new Set();
    return matches.map(match => {
      if (match.isBye || !match.a || !match.b) return match;
      let table = tables.find(item => item.id === Number(match.tableId));
      if (!table) {
        const available = tables.filter(item => !used.has(item.id));
        const candidates = available.length ? available : tables;
        const visited = (person, candidate) => previous.some(item => item.roundNumber < match.roundNumber &&
          Number(item.tableId) === candidate.id && [item.a?.key, item.b?.key].includes(person.key));
        table = candidates.find(item => !visited(match.a, item) && !visited(match.b, item)) ||
          candidates.find(item => !visited(match.a, item) || !visited(match.b, item)) || candidates[0];
      }
      if (table) used.add(table.id);
      return { ...match, tableId: table?.id || null, tableNumber: table?.tableNumber || null };
    });
  }

  return { individual, team, teamGames, history, warnings, assignTables };
});
