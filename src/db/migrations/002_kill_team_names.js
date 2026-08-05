const { LEGACY_NAMES } = require("../../domain/kill-teams");

function canonical(name) {
  return LEGACY_NAMES[name] || null;
}

function rewriteResult(result) {
  if (!result || !result.scores) return null;

  let changed = false;
  const scores = {};
  for (const [playerId, score] of Object.entries(result.scores)) {
    const replacement = canonical(score?.faction);
    if (replacement) {
      changed = true;
      scores[playerId] = { ...score, faction: replacement };
    } else {
      scores[playerId] = score;
    }
  }
  return changed ? { ...result, scores } : null;
}

function rewritePendingResult(pending) {
  if (!pending?.result) return null;
  const rewritten = rewriteResult(pending.result);
  return rewritten ? { ...pending, result: rewritten } : null;
}

function rewriteCredits(credits) {
  if (!Array.isArray(credits) || !credits.length) return null;

  let changed = false;
  const next = credits.map((credit) => {
    const replacement = canonical(credit?.team);
    if (!replacement) return credit;
    changed = true;
    return { ...credit, team: replacement };
  });
  return changed ? next : null;
}

async function up(client) {
  let gamesChanged = 0;
  let usersChanged = 0;

  const { rows: gameRows } = await client.query(
    "SELECT id, result, pending_result FROM games WHERE result IS NOT NULL OR pending_result IS NOT NULL"
  );
  for (const row of gameRows) {
    const result = rewriteResult(row.result);
    const pendingResult = rewritePendingResult(row.pending_result);
    if (!result && !pendingResult) continue;

    await client.query(
      `UPDATE games
       SET result = COALESCE($2::jsonb, result),
           pending_result = COALESCE($3::jsonb, pending_result)
       WHERE id = $1`,
      [
        row.id,
        result ? JSON.stringify(result) : null,
        pendingResult ? JSON.stringify(pendingResult) : null
      ]
    );
    gamesChanged += 1;
  }

  const { rows: userRows } = await client.query(
    "SELECT id, challenge_credits FROM users WHERE challenge_credits IS NOT NULL"
  );
  for (const row of userRows) {
    const credits = rewriteCredits(row.challenge_credits);
    if (!credits) continue;

    await client.query("UPDATE users SET challenge_credits = $2::jsonb WHERE id = $1", [
      row.id,
      JSON.stringify(credits)
    ]);
    usersChanged += 1;
  }

  console.log(
    JSON.stringify({
      level: "info",
      time: new Date().toISOString(),
      msg: "kill team names canonicalized",
      gamesChanged,
      usersChanged
    })
  );
}

module.exports = {
  version: 2,
  name: "kill_team_names",
  up,
  rewriteResult,
  rewritePendingResult,
  rewriteCredits
};
