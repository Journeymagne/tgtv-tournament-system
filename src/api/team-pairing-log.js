const { canManageTournament } = require("../domain/access");
const { toIso } = require("../db/rows");
const EVENT_TYPES = [
  "team_match_roll", "mission_ban", "shield_select", "shields_reveal", "sword_select", "swords_reveal",
  "environment_select", "personal_games_create", "team_pairing_undo", "team_match_reset",
  "team_pairings_override", "team_round_tables_update",
  "team_game_result_submit", "team_game_result_confirm", "team_game_result_reject", "team_game_result_admin-save"
];

function memberSnapshot(roster, memberId) {
  const member = roster?.members?.find(item => item.id === memberId);
  if (!member) return null;
  return { memberId: member.id, rosterId: roster.id, rosterName: roster.name || roster.teamNameSnapshot,
    playerName: member.displayNameSnapshot, faction: member.factionSnapshot };
}

function choiceDetails(context, side, memberId, kind, match) {
  const own = side === "a" ? context.rosterA : context.rosterB;
  const chosenRoster = kind === "shield" ? own : side === "a" ? context.rosterB : context.rosterA;
  const revealed = match[kind + "AConfirmed"] && match[kind + "BConfirmed"];
  return { rosterName: own.name || own.teamNameSnapshot, choice: memberSnapshot(chosenRoster, memberId),
    ...(revealed ? { revealedChoices: ["a", "b"].map(choiceSide => {
      const roster = choiceSide === "a" ? context.rosterA : context.rosterB;
      const target = kind === "shield" ? roster : choiceSide === "a" ? context.rosterB : context.rosterA;
      return { side: choiceSide, rosterName: roster.name || roster.teamNameSnapshot,
        choice: memberSnapshot(target, match[kind + choiceSide.toUpperCase() + "MemberId"]) };
    }) } : {}) };
}

function assignmentDetails(context, assignments, tables) {
  return assignments.map(assignment => {
    const pairing = context.match.pairings?.find(item => item.slot === assignment.slot);
    const table = tables.find(item => item.id === assignment.tableId);
    return { slot: assignment.slot, mission: assignment.mission?.critOp || null,
      table: table ? { number: table.tableNumber, killzone: table.killzone, layout: table.deployment } : null,
      playerA: memberSnapshot(context.rosterA, pairing?.rosterAMemberId),
      playerB: memberSnapshot(context.rosterB, pairing?.rosterBMemberId) };
  });
}

function visibleMember(member, rosters) {
  if (!member) return null;
  const current = rosters.find(roster => roster?.id === member.rosterId)?.members?.find(item => item.id === member.memberId);
  return { playerName: member.playerName || "", rosterName: member.rosterName || "",
    faction: current?.factionHidden ? null : member.faction || null,
    factionHidden: Boolean(current?.factionHidden) };
}

function eventView(row, match, rosterA, rosterB, user) {
  const metadata = row.metadata || {};
  const side = metadata.side || metadata.step?.side ||
    (row.actor_user_id && row.actor_user_id === rosterA?.captainUserId ? "a" :
      row.actor_user_id && row.actor_user_id === rosterB?.captainUserId ? "b" : null);
  const roster = side === "a" ? rosterA : side === "b" ? rosterB : null;
  const rosters = [rosterA, rosterB];
  const isReveal = ["shields_reveal", "swords_reveal"].includes(row.event_type);
  const isCaptain = Boolean(user?.id && rosters.some(item => item?.captainUserId === user.id));
  // Private attempts stay private even after a later choice is revealed or undone.
  // Reveal events store only the two choices that were actually made public.
  const canReadChoice = isReveal || (!isCaptain && canManageTournament(user, match.tournamentId)) || Boolean(user?.id && roster?.captainUserId === user.id);
  const view = { id: row.id, type: row.event_type, at: toIso(row.created_at),
    actorName: metadata.actorName || row.actor_name || null,
    actorRole: (metadata.actorIsAdmin ?? row.actor_is_admin) ? "admin" : side ? "captain" : "player",
    rosterName: metadata.rosterName || roster?.name || roster?.teamNameSnapshot || null };
  if (["shield_select", "shields_reveal", "sword_select", "swords_reveal"].includes(row.event_type)) {
    view.confirmed = metadata.confirmed !== false;
    view.choice = canReadChoice ? visibleMember(metadata.choice, rosters) : null;
    view.choiceHidden = Boolean(metadata.choice && !canReadChoice);
    if (isReveal) view.revealedChoices = (metadata.revealedChoices || []).map(item => ({
      rosterName: item.rosterName, choice: visibleMember(item.choice, rosters)
    }));
  }
  if (row.event_type === "team_match_roll") {
    view.result = metadata.result ?? row.roll_result;
    view.rollRound = metadata.round || null;
    view.manual = Boolean(metadata.manual);
    view.tied = Boolean(metadata.tied);
    view.attackerName = metadata.attackerName || null;
    view.defenderName = metadata.defenderName || null;
  }
  if (row.event_type === "mission_ban") view.mission = metadata.mission || null;
  if (row.event_type === "environment_select") {
    view.kind = metadata.step?.kind;
    view.slot = metadata.step?.slot;
    view.mission = metadata.assignment?.mission?.critOp || null;
  }
  if (["environment_select", "personal_games_create", "team_pairings_override"].includes(row.event_type)) {
    view.assignments = (metadata.logAssignments || []).map(item => ({
      slot: item.slot, mission: item.mission, table: item.table,
      playerA: visibleMember(item.playerA, rosters), playerB: visibleMember(item.playerB, rosters)
    }));
  }
  if (row.event_type === "team_pairing_undo") {
    view.undoneAction = metadata.undoneAction || null;
    view.phase = row.target_phase || null;
  }
  if (row.event_type === "team_match_reset") view.phase = row.target_phase || null;
  if (row.event_type.startsWith("team_game_result_")) view.slot = metadata.slot || row.game_slot || null;
  return view;
}

async function read(client, match, rosterA, rosterB, user) {
  const { rows } = await client.query(
    `SELECT e.id, e.actor_user_id, e.event_type, e.metadata, e.created_at,
            e.after->>'phase' AS target_phase, e.after->'rollResult' AS roll_result,
            u.name AS actor_name, u.is_admin AS actor_is_admin, g.slot AS game_slot
     FROM player_team_audit_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     LEFT JOIN tournament_team_match_games g ON e.entity_type = 'game' AND g.game_id = e.entity_id AND g.team_match_id = $2
     WHERE e.tournament_id = $1 AND e.event_type = ANY($4::text[])
       AND ((e.entity_type = 'team_match' AND e.entity_id = $2)
         OR (e.entity_type = 'game' AND (g.id IS NOT NULL OR e.metadata->>'matchId' = $2::text))
         OR (e.event_type = 'team_round_tables_update' AND e.entity_type = 'round' AND e.entity_id = $3))
     ORDER BY e.id DESC`,
    [match.tournamentId, match.id, match.roundId, EVENT_TYPES]
  );
  return rows.map(row => eventView(row, match, rosterA, rosterB, user));
}

function auditForViewer(rows, matches, rosters, user) {
  const captainRosterIds = new Set(rosters.filter(roster => user?.id && roster.captainUserId === user.id).map(roster => roster.id));
  if (!captainRosterIds.size) return rows;
  const ownMatch = match => captainRosterIds.has(match.rosterAId) || captainRosterIds.has(match.rosterBId);
  const knownMatches = new Map(matches.map(match => [match.id, match]));
  // Rolled-back rounds keep snapshots of matches that no longer exist in the live table.
  for (const row of rows) {
    for (const snapshot of [row.before, row.after]) {
      for (const match of [snapshot, ...(snapshot?.matches || [])]) {
        if (match?.id && match.rosterAId && !knownMatches.has(match.id)) knownMatches.set(match.id, match);
      }
    }
  }
  const snapshotForViewer = value => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(snapshotForViewer);
    if (value.rosterAId && ownMatch(value)) {
      // Raw snapshots can contain private attempts inside pairingHistory.
      return { id: value.id, roundId: value.roundId, phase: value.phase,
        rosterAId: value.rosterAId, rosterBId: value.rosterBId };
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshotForViewer(item)]));
  };
  return rows.map(row => {
    const match = row.entity_type === "team_match" ? knownMatches.get(row.entity_id) : null;
    if (row.entity_type === "team_match" && (!match || ownMatch(match))) {
      const metadata = match ? eventView({ ...row, target_phase: row.after?.phase, roll_result: row.after?.rollResult }, match,
        rosters.find(roster => roster.id === match.rosterAId), rosters.find(roster => roster.id === match.rosterBId), user) : {};
      return { ...row, before: null, after: null, metadata };
    }
    return { ...row, before: snapshotForViewer(row.before), after: snapshotForViewer(row.after), metadata: snapshotForViewer(row.metadata) };
  });
}

module.exports = { choiceDetails, assignmentDetails, eventView, read, auditForViewer };
