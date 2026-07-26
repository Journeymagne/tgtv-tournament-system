const { ValidationError } = require("../http/io");
const { KILLZONES, CRIT_OPS, requireKillTeam } = require("./kill-teams");
const {
  scoreInput,
  primaryInput,
  aplInput,
  optionalTextInput,
  requireInteger
} = require("./validation");

function calculateApprovedOps(player = {}) {
  const ops = {
    crit: scoreInput(player.crit),
    kill: scoreInput(player.kill),
    tac: scoreInput(player.tac)
  };
  const primary = primaryInput(player.primary);
  const primaryBonus = Math.ceil(ops[primary] / 2);

  return {
    crit: ops.crit,
    kill: ops.kill,
    tac: ops.tac,
    faction: requireKillTeam(player.faction),
    tacOp: optionalTextInput(player.tacOp, "Tac Op"),
    primary,
    primaryScore: ops[primary],
    primaryBonus,
    total: ops.crit + ops.kill + ops.tac + primaryBonus
  };
}

function parseKillzone(input) {
  const source = input || {};
  const killzone = optionalTextInput(source.killzone, "Killzone");
  const critOp = optionalTextInput(source.critOp, "Crit Op");
  const layoutText = String(source.layout || "").trim();

  let layout = null;
  if (layoutText) {
    layout = requireInteger(layoutText, {
      min: 1,
      max: 6,
      message: "Killzone layout must be between 1 and 6"
    });
  }
  if (killzone && !KILLZONES.includes(killzone)) {
    throw new ValidationError("Choose a valid Killzone");
  }
  if (critOp && !CRIT_OPS.includes(critOp)) {
    throw new ValidationError("Choose a valid Crit Op");
  }
  return killzone || critOp || layout ? { killzone, critOp, layout } : null;
}

function calculateTieBreakers(input, playerAId, playerBId, scoreA, scoreB) {
  const primary = { [playerAId]: scoreA.primaryBonus, [playerBId]: scoreB.primaryBonus };
  const critTac = {
    [playerAId]: scoreA.crit + scoreA.tac,
    [playerBId]: scoreB.crit + scoreB.tac
  };
  const apl = {
    [playerAId]: aplInput(input.apl?.[playerAId]),
    [playerBId]: aplInput(input.apl?.[playerBId])
  };
  const rollOffWinnerId = input.rollOffWinnerId ? Number(input.rollOffWinnerId) : null;

  let winnerId = null;
  let decidedBy = null;

  if (primary[playerAId] !== primary[playerBId]) {
    winnerId = primary[playerAId] > primary[playerBId] ? playerAId : playerBId;
    decidedBy = "primary";
  } else if (critTac[playerAId] !== critTac[playerBId]) {
    winnerId = critTac[playerAId] > critTac[playerBId] ? playerAId : playerBId;
    decidedBy = "critTac";
  } else if (apl[playerAId] !== apl[playerBId]) {
    winnerId = apl[playerAId] > apl[playerBId] ? playerAId : playerBId;
    decidedBy = "apl";
  } else {
    if (![playerAId, playerBId].includes(rollOffWinnerId)) {
      throw new ValidationError("Choose the roll-off winner for this tied match");
    }
    winnerId = rollOffWinnerId;
    decidedBy = "rollOff";
  }

  return {
    enabled: true,
    winnerId,
    decidedBy,
    primary,
    critTac,
    apl,
    rollOffWinnerId: decidedBy === "rollOff" ? rollOffWinnerId : null
  };
}

function calculateSubmittedResult(body, playerAId, playerBId) {
  const scoresByUser = body.scores || {};
  const scoreA = calculateApprovedOps(scoresByUser[playerAId] || {});
  const scoreB = calculateApprovedOps(scoresByUser[playerBId] || {});

  let winnerId = null;
  let tiebreakers = null;

  if (scoreA.total > scoreB.total) {
    winnerId = playerAId;
  } else if (scoreB.total > scoreA.total) {
    winnerId = playerBId;
  } else if (body.tiebreakers?.enabled) {
    tiebreakers = calculateTieBreakers(body.tiebreakers, playerAId, playerBId, scoreA, scoreB);
    winnerId = tiebreakers.winnerId;
  }

  return {
    winnerId,
    scores: { [playerAId]: scoreA, [playerBId]: scoreB },
    killzone: parseKillzone(body.killzone),
    tiebreakers
  };
}

function matchScoreFor(result, playerAId, playerBId) {
  if (result.winnerId === playerAId) return 1;
  if (result.winnerId === playerBId) return 0;
  return 0.5;
}

module.exports = {
  calculateApprovedOps,
  parseKillzone,
  calculateTieBreakers,
  calculateSubmittedResult,
  matchScoreFor
};
