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
async function syncJourney(client, profile, catalog) {
  const journey = progression(profile.stats, catalog.questions, profile.rank_tier);
  // This durable marker survives course changes, qualification and inbox cleanup.
  // A player receives this notice only once for the lifetime of their account.
  const key = 'once';
  const notify = journey.recertification && !profile.recertification_key;
  if (journey.rank.tier !== profile.rank_tier || notify) {
    await client.query(`UPDATE knowthykt.training_profiles SET rank_tier=$2,recertification_key=$3 WHERE user_id=$1`,
      [profile.user_id, journey.rank.tier, notify ? key : profile.recertification_key]);
    profile.rank_tier = journey.rank.tier;
    if (notify) profile.recertification_key = key;
  }
  if (notify) {
    // Profile locking serializes devices; the fixed ID also protects retries.
    const payload = { id: 'knowthykt_recertification:' + key, type: 'knowthykt_recertification',
      title: 'Know Thy Kill Team · Переаттестация',
      excerpt: `База вопросов обновилась. Звание «${journey.rank.name}» и ${journey.xp} XP сохранены. Подтвердите звание по актуальным вопросам: осталось ${journey.recertificationRemaining} XP курса.`,
      href: '/knowthykt#journey', createdAt: new Date().toISOString() };
    await client.query(`INSERT INTO knowthykt.notification_messages(user_id,notification_id,payload,created_at)
      VALUES($1,$2,$3,$4) ON CONFLICT(user_id,notification_id) DO NOTHING`,
      [profile.user_id, payload.id, JSON.stringify(payload), payload.createdAt]);
  }
  return journey;
}
async function syncAllJourneys(client, catalog) {
  // Caller holds the exclusive bank lock. Preserve titles before changing the
  // curriculum, then notify affected accounts after it changes, including offline users.
  const { rows } = await client.query('SELECT * FROM knowthykt.training_profiles ORDER BY user_id FOR UPDATE');
  for (const profile of rows) await syncJourney(client, profile, catalog);
}
async function state(client, user, profile, bankVersion, catalog) {
  const active = await repairActive(client, user.id, profile, catalog);
  const journey = await syncJourney(client, profile, catalog);
  const { rows: history } = await client.query(`SELECT * FROM training_sessions WHERE user_id=$1
    AND status<>'active' ORDER BY started_at DESC,id DESC LIMIT 100`, [user.id]);
  return {
    bankVersion, bankRevision: catalog.revision, user: { id: user.id, name: user.name, isAdmin: Boolean(user.isAdmin) }, revision: profile.revision,
    stats: profile.stats, completedCount: profile.completed_count, journey,
    active: sessionView(active), history: history.map(sessionView), historyLimit: 100
  };
}

// Public achievement only: never include individual answers, sessions or timestamps.
async function publicJourney(client, userId) {
  let stats = {}, retainedTier = 1;
  if (userId) {
    const { rows: [row] } = await client.query(`SELECT p.stats,r.rank_tier FROM users u
      LEFT JOIN knowthykt.public_progress p ON p.user_id=u.id
      LEFT JOIN knowthykt.public_ranks r ON r.user_id=u.id WHERE u.id=$1`, [userId]);
    if (!row) return null;
    stats = row.stats;
    retainedTier = row.rank_tier;
  }
  const { rows } = await client.query('SELECT * FROM knowthykt.public_questions ORDER BY id');
  const { xp, courseXp, rank, next, remaining, percent, total, solved, mastered, recertification, recertificationRemaining } = progression(stats, rows.map(catalogStore.view), retainedTier);
  return { xp, courseXp, rank, next, remaining, percent, total, solved, mastered, recertification, recertificationRemaining };
}

module.exports = { sessionView, lockProfile, findSession, activeSession, repairActive, saveProfile, state, publicJourney, syncJourney, syncAllJourneys };
