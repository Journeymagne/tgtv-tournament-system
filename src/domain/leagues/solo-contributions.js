const { matchParticipant, participantScore } = require("../tournaments/results");
const { leaguePick, playedOrDeclared } = require("./picks");

const number = value => Number.isFinite(value) ? value : null;
const sum = values => values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : null;

function subject(identity, bindings) {
  const person = bindings.bySource?.get(identity.sourceKey) || bindings.byUser?.get(identity.userId);
  const registry = person ? person.registerNickname : identity.registerNickname;
  const account = person ? person.userId : identity.userId;
  return {
    subjectKey: person ? "person:" + person.id : account ? "user:" + account : "guest:" + identity.originKey,
    name: registry || person?.name || identity.displayName,
    identityStatus: registry ? "verified" : account || person?.confirmed ? "missing_nickname" : "guest"
  };
}

function actualSide(match, participant) {
  if (!participant) return null;
  const frozen = matchParticipant(match, participant);
  const recorded = match.recorded?.find(side => side.participantId === participant.id);
  if (!recorded) {
    return { ...frozen, registerNickname: frozen.userId === participant.userId ? participant.registerNickname : frozen.registerNickname || "" };
  }
  const sameOccupant = recorded.userId === frozen.userId &&
    (recorded.userId != null || recorded.displayName === frozen.displayName);
  // A positive recorded result key is the original account ID even after the
  // FK was cleared on deletion. Negative proxy keys only identify a seat.
  return { ...frozen, ...recorded, userId: recorded.userId ?? (recorded.resultKey > 0 ? recorded.resultKey : null),
    factions: sameOccupant ? frozen.factions : recorded.faction ? [recorded.faction] : [] };
}

function expectedMatches(result) {
  return sum([result?.wins, result?.draws, result?.losses]);
}

function trimmedBuchholz(values) {
  if (!values.every(Number.isFinite)) return null;
  if (values.length <= 2) return 0;
  return sum([...values].sort((a, b) => a - b).slice(1, -1));
}

function soloContributions(bundle, bindings, rule, output, base) {
  const { tournament, participants = [], matches = [] } = bundle;
  const official = new Map(tournament.finalResults.map(row => [row.participantId, row]));
  const slots = new Map(participants.map(p => [p.id, p]));
  const played = new Map(participants.map(p => [p.id, []]));
  const ambiguous = new Set(bundle.replacedParticipantIds || []);
  const games = [];
  for (const match of matches.filter(match => match.status === "completed")) {
    const entries = [];
    for (const [label, participantId] of [["a", match.participantAId], ["b", match.participantBId]]) {
      if (!participantId) continue;
      const participant = slots.get(participantId);
      const side = actualSide(match, participant);
      if (!side) continue;
      if (side.userId !== participant.userId || (!side.userId && side.displayName !== participant.displayName)) {
        ambiguous.add(participantId);
      }
      const score = match.result ? participantScore(match.result, side) : {};
      const entry = { match, label, side, slot: participantId, score };
      entries.push(entry);
      played.get(participantId).push(entry);
    }
    games.push(entries);
  }

  const finalTp = new Map();
  const completeHistory = new Map();
  for (const [slot, entries] of played) {
    const result = official.get(slot);
    const expected = expectedMatches(result) ?? (result && tournament.format === "swiss" ? tournament.swissRoundCount : null);
    const reliable = entries.length > 0 && (expected == null || expected === entries.length) &&
      entries.every(({ match }) => match.isBye ? match.winnerParticipantId === slot : !!match.result);
    completeHistory.set(slot, reliable);
    const earned = entries.map(({ match }) =>
      match.winnerParticipantId === slot ? 3 : match.winnerParticipantId == null ? 1 : 0);
    finalTp.set(slot, number(result?.matchPoints) ?? (reliable ? sum(earned) : null));
  }

  const seenIdentities = new Map();
  function identify(side, slot, entry) {
    const prefix = tournament.id + ":";
    // An unreplaced guest seat has one occupant. After a replacement even two
    // proxies sharing a seat's negative game key require separate evidence.
    const slotKey = prefix + "slot:" + slot;
    const sourceKey = entry ? prefix + "match:" + entry.match.id + ":" + entry.label : slotKey;
    const originKey = ambiguous.has(slot) ? sourceKey : slotKey;
    const identity = { tournamentId: tournament.id, participantId: slot, sourceKey, originKey, userId: side.userId ?? null,
      displayName: side.displayName || ("#" + slot), registerNickname: side.registerNickname || "" };
    const resolved = { ...identity, ...subject(identity, bindings) };
    if (!seenIdentities.has(sourceKey)) seenIdentities.set(sourceKey, identity);
    return resolved;
  }
  for (const entries of games) {
    for (const entry of entries) entry.identity = identify(entry.side, entry.slot, entry);
    const [a, b] = entries;
    if (!a || !b || !a.match.result || a.match.isBye) continue;
    const winner = entries.find(entry => entry.slot === a.match.winnerParticipantId);
    output.encounters.push({ tournamentId: tournament.id, matchId: a.match.id,
      a: a.identity.subjectKey, b: b.identity.subjectKey, winner: winner?.identity.subjectKey || null,
      winnerSourceKey: winner?.identity.sourceKey || null });
    a.opponent = b;
    b.opponent = a;
  }

  for (const [slot, result] of official) {
    const participant = slots.get(slot);
    if (!participant) {
      output.missing("participantId", { participantId: slot });
      continue;
    }
    const entries = played.get(slot);
    // An explicitly unplayed published registration is not an appearance.
    if (!entries.length && (expectedMatches(result) === 0 || ["joined", "removed", "withdrawn"].includes(participant.status))) continue;
    if (ambiguous.has(slot) && !completeHistory.get(slot)) {
      output.missing("participantSnapshots", { participantId: slot });
    }
    const groups = new Map();
    for (const entry of entries) {
      if (!groups.has(entry.identity.subjectKey)) groups.set(entry.identity.subjectKey, []);
      groups.get(entry.identity.subjectKey).push(entry);
    }
    if (!groups.size) {
      const identity = identify(participant, slot);
      groups.set(identity.subjectKey, [{ identity, side: participant }]);
    }
    const candidateKeys = [...groups.keys()];
    const recipient = bindings.recipients?.get(tournament.id + ":" + slot);
    const selected = candidateKeys.length === 1 ? candidateKeys[0] : candidateKeys.find(key => key === "person:" + recipient);
    if (!selected && rule.primary === "place") output.issues.push({ code: "place_recipient", field: "participantId",
      tournamentId: tournament.id, participantId: slot, candidateKeys, action: "confirm_place_recipient" });
    const split = groups.size > 1;
    if (split && rule.primary === "tp" && Number.isFinite(result.matchPoints)) {
      const earned = entries.reduce((total, entry) => total +
        (entry.match.winnerParticipantId === slot ? 3 : entry.match.winnerParticipantId == null ? 1 : 0), 0);
      if (earned !== result.matchPoints) output.missing("matchPoints", { participantId: slot });
    }
    for (const [key, appearances] of groups) {
      const identity = appearances[0].identity;
      const playedGames = appearances.filter(entry => entry.match);
      const reliable = completeHistory.get(slot) && playedGames.length > 0;
      const scores = playedGames.map(entry => {
        if (entry.match.isBye) return { points: 3, win: 1, vp: 0, diff: 0, tac: 0 };
        const vp = number(entry.score.total);
        const oppVp = number(entry.opponent?.score.total);
        const win = Number(entry.match.winnerParticipantId === slot);
        return { points: win ? 3 : entry.match.winnerParticipantId == null ? 1 : 0, win,
          vp, diff: vp == null || oppVp == null ? null : vp - oppVp, tac: number(entry.score.tac) };
      });
      const opponents = playedGames.filter(entry => !entry.match.isBye).map(entry => finalTp.get(entry.opponent?.slot));
      const take = (published, fallback) => (!split ? number(published) : null) ?? (reliable ? fallback : null);
      const metric = field => sum(scores.map(score => score[field]));
      const metrics = {
        total_vp: take(result.totalVp, metric("vp")), vp_diff: take(result.vpDiff, metric("diff")),
        individual_wins: take(result.wins, metric("win")), tac_op: take(result.tacOpPoints, metric("tac")),
        strength_of_schedule: take(result.strengthOfSchedule, sum(opponents)), buchholz: take(result.buchholz, trimmedBuchholz(opponents))
      };
      if (rule.criteria.some(c => c.metric === "head_to_head") && (!reliable ||
        playedGames.some(entry => !entry.match.isBye && !entry.opponent))) output.missing("head_to_head", { participantId: slot });
      output.contributions.push({
        ...base, sourceKey: identity.sourceKey, subjectKey: identity.subjectKey, name: identity.name,
        identityStatus: identity.identityStatus, displayName: identity.displayName,
        aliases: [...new Set(appearances.map(entry => entry.identity.displayName))],
        sourceKeys: [...new Set(appearances.map(entry => entry.identity.sourceKey))],
        participantId: slot, rank: number(result.rank), awardPlace: key === selected,
        rawTp: take(result.matchPoints, metric("points")), metrics,
        picks: playedOrDeclared(playedGames.map(entry => leaguePick(entry.score.faction)), appearances.flatMap(entry => entry.side.factions || []))
      });
    }
  }
  output.identities.push(...seenIdentities.values());
}

module.exports = { soloContributions };

