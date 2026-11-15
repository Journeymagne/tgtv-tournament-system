// Populate only the dedicated local demo database; never erase existing data.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { DATABASE_URL, ROOT } = require('../src/config');
const { migrate } = require('../src/db/migrate');
const { hashPassword } = require('../src/domain/passwords');
const usersRepo = require('../src/db/repositories/users');
const teamsRepo = require('../src/db/repositories/player-teams');
const teamsApi = require('../src/api/player-teams');

const TEAM_NAMES = [
  'Iron Ravens', 'Void Wolves', 'Crimson Spears', 'Storm Wardens',
  'Silent Blades', 'Ash Sentinels', 'Golden Talons', 'Frost Hunters',
  'Obsidian Guard', 'Thunder Hawks', 'Ember Knights', 'Silver Reapers',
  'Shadow Lions', 'Steel Vipers', 'Scarlet Watch', 'Onyx Raiders',
  'Solar Fangs', 'Jade Phantoms', 'Cobalt Legion', 'Ivory Shields'
];

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function verify(client) {
  const { rows: [counts] } = await client.query(`
    SELECT (SELECT COUNT(*)::int FROM users) AS users,
           (SELECT COUNT(*)::int FROM users WHERE is_admin) AS admins,
           (SELECT COUNT(*)::int FROM player_teams) AS teams,
           (SELECT COUNT(*)::int FROM player_team_memberships WHERE ended_at IS NULL) AS memberships,
           (SELECT COUNT(DISTINCT user_id)::int FROM player_team_memberships WHERE ended_at IS NULL) AS distinct_members,
           (SELECT COUNT(*)::int FROM users u WHERE NOT EXISTS (
             SELECT 1 FROM player_team_memberships m WHERE m.user_id = u.id AND m.ended_at IS NULL
           )) AS unassigned
  `);
  assert.deepEqual(counts, { users: 100, admins: 1, teams: 20, memberships: 60, distinct_members: 60, unassigned: 40 });
  const { rows: invalidTeams } = await client.query(`
    SELECT t.id FROM player_teams t
    LEFT JOIN player_team_memberships m ON m.team_id = t.id AND m.ended_at IS NULL
    GROUP BY t.id
    HAVING COUNT(m.id) <> 3
       OR COUNT(*) FILTER (WHERE m.role = 'leader' AND m.user_id = t.leader_user_id) <> 1
  `);
  assert.equal(invalidTeams.length, 0, 'Every team must have three members and its designated leader');
  return counts;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seeding is disabled in production');
  }
  const url = new URL(DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/tgtv_local_demo') {
    throw new Error('Seeding is restricted to 127.0.0.1:55432/tgtv_local_demo');
  }
  const pool = new Pool({ connectionString: DATABASE_URL });
  let client;
  try {
    await migrate(pool);
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(734910221)');
    const { rows: [existing] } = await client.query(`
      SELECT (SELECT COUNT(*)::int FROM users) AS users,
             (SELECT COUNT(*)::int FROM player_teams) AS teams
    `);
    if (existing.users || existing.teams) {
      // A repeat invocation verifies this fixture instead of adding duplicates.
      const counts = await verify(client);
      const { rows: [names] } = await client.query(`
        SELECT COUNT(*)::int AS matches FROM users
        WHERE name_key = 'admin' OR name ~ '^Player(00[1-9]|0[1-9][0-9])$'
      `);
      assert.equal(names.matches, 100, 'Database is not the expected demo fixture');
      await client.query('COMMIT');
      console.log(JSON.stringify({ status: 'already_seeded', ...counts }));
      return;
    }

    const players = [];
    for (let i = 0; i < 100; i += 1) {
      const name = i === 0 ? 'admin' : `Player${String(i).padStart(3, '0')}`;
      const user = await usersRepo.insert(client, {
        name, passwordHash: await hashPassword(name),
        registerNickname: name, telegramContact: `@tgtv_demo_${name.toLowerCase()}`,
        rating: 1000, isAdmin: i === 0
      });
      if (i > 0) players.push(user);
    }
    const picked = shuffle(players).slice(0, 60);
    const teams = [];
    for (let i = 0; i < TEAM_NAMES.length; i += 1) {
      const [leader, ...members] = picked.slice(i * 3, i * 3 + 3);
      const { body: { team } } = await teamsApi.create({
        client, user: leader,
        body: { name: TEAM_NAMES[i], description: 'Локальная тестовая команда. Состав выбран случайно.' }
      });
      for (const member of members) {
        const membership = await teamsRepo.addMembership(client, team.id, member);
        await teamsRepo.audit(client, {
          teamId: team.id, actorUserId: leader.id, eventType: 'local_demo_member_added',
          entityType: 'membership', entityId: membership.id, after: membership
        });
      }
      teams.push({ id: team.id, name: team.name, slug: team.slug,
        leader: leader.name, members: [leader, ...members].map((u) => u.name) });
    }
    const counts = await verify(client);
    await client.query('COMMIT');
    fs.mkdirSync(path.join(ROOT, 'work/local-runtime'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'work/local-runtime/demo-roster.json'), JSON.stringify({
      createdAt: new Date().toISOString(), database: url.pathname.slice(1),
      admin: 'admin', users: ['admin', ...players.map((u) => u.name)], teams, counts
    }, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'seeded', ...counts }));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
