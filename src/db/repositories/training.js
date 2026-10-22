const { progression } = require('../../domain/training-progression');
const bank = require('../../domain/training');
const catalogStore = require('./training-catalog');
const { reconcile } = require('../../../public/training/session-bank');

function sessionView(row) {
  return row ? {
    id: row.id, bankVersion: row.bank_version, mode: row.mode, status: row.status,
    cursor: row.cursor, items: row.items, startedAt: row.started_at,
    finishedAt: row.finished_at
  } : null;
}

// Every read or write takes the same per-account lock inside the route transaction.
// A device therefore receives one coherent revision, not a mixture of old totals
// and new answers. Different accounts never block each other's training.
async function lockProfile(client, userId) {
  await client.query("INSERT INTO training_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING", [userId]);
  const { rows: [row] } = await client.query("SELECT * FROM training_profiles WHERE user_id=$1 FOR UPDATE", [userId]);
  return row;
}

async function findSession(client, userId, id) {
  const { rows: [row] } = await client.query("SELECT * FROM training_sessions WHERE user_id=$1 AND id=$2", [userId, id]);
  return row || null;
}

async function activeSession(client, userId) {
  const { rows: [row] } = await client.query("SELECT * FROM training_sessions WHERE user_id=$1 AND status='active'", [userId]);
  return row || null;
}

async function saveProfile(client, profile, completed = false) {
  await client.query(`UPDATE training_profiles SET stats=$2, revision=revision+1,
    completed_count=completed_count+$3, updated_at=NOW() WHERE user_id=$1`,
  [profile.user_id, JSON.stringify(profile.stats), Number(completed)]);
  profile.revision += 1;
  if (completed) profile.completed_count += 1;
}

async function repairActive(client, userId, profile, catalog) {
  const active = await activeSession(client, userId);
  if (active && reconcile(active, catalog.questions, bank.sessionItem, pool => bank.shuffled(pool)[0])) {
    await client.query('UPDATE training_sessions SET items=$2 WHERE id=$1', [active.id, JSON.stringify(active.items)]);
    await saveProfile(client, profile);
  }
  return active;
}
async function state(client, user, profile, bankVersion, catalog) {
  const active = await repairActive(client, user.id, profile, catalog);
  const { rows: history } = await client.query(`SELECT * FROM training_sessions WHERE user_id=$1
    AND status<>'active' ORDER BY started_at DESC,id DESC LIMIT 100`, [user.id]);
  return {
    bankVersion, bankRevision: catalog.revision, user: { id: user.id, name: user.name, isAdmin: Boolean(user.isAdmin) }, revision: profile.revision,
    stats: profile.stats, completedCount: profile.completed_count, journey: progression(profile.stats, catalog.curriculum),
    active: sessionView(active), history: history.map(sessionView), historyLimit: 100
  };
}

// Public achievement only: never include individual answers, sessions or timestamps.
async function publicJourney(client, userId) {
  let stats = {};
  if (userId) {
    const { rows: [row] } = await client.query(`SELECT p.stats FROM users u
      LEFT JOIN knowthykt.public_progress p ON p.user_id=u.id WHERE u.id=$1`, [userId]);
    if (!row) return null;
    stats = row.stats;
  }
  const { rows } = await client.query("SELECT * FROM knowthykt.public_questions WHERE status<>'deleted' ORDER BY id");
  const { xp, rank, next, remaining, percent, total, solved, mastered } = progression(stats, rows.map(catalogStore.view));
  return { xp, rank, next, remaining, percent, total, solved, mastered };
}

module.exports = { sessionView, lockProfile, findSession, activeSession, repairActive, saveProfile, state, publicJourney };
