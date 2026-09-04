const { randomInt, randomBytes } = require("node:crypto");
const { Pool } = require("pg");

const { DATABASE_URL, PGSSL, requireDatabaseUrl } = require("../src/config");
const teamsRepo = require("../src/db/repositories/player-teams");
const { uniqueSlug } = require("../src/domain/tournaments/slug");
const { teamNameKey } = require("../src/domain/player-teams");

const TEAM_COUNT = 10;
const MEMBERS_PER_TEAM = 5;
const REQUIRED_LEADER = "Lehe";

const ADJECTIVES = [
  "Amber", "Arcane", "Azure", "Brass", "Crimson", "Emerald", "Feral", "Golden",
  "Iron", "Ivory", "Lunar", "Obsidian", "Raging", "Royal", "Scarlet", "Silent",
  "Solar", "Storm", "Violet", "Wild"
];

const NOUNS = [
  "Badgers", "Basilisks", "Bears", "Cobras", "Dragons", "Falcons", "Foxes", "Golems",
  "Griffins", "Hounds", "Jackals", "Kraken", "Lions", "Mammoths", "Mantis", "Ravens",
  "Scorpions", "Sharks", "Titans", "Wolves"
];

function assertExplicitLocalTarget(connectionString) {
  if (!process.argv.includes("--confirm-local")) {
    throw new Error("Pass --confirm-local to acknowledge that this script inserts test data");
  }
  const target = new URL(connectionString);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
    throw new Error("Random team seeding is restricted to a local PostgreSQL host");
  }
  const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!/(_prod_copy|_test|_local)$/i.test(database)) {
    throw new Error("Target database name must end in _prod_copy, _test, or _local");
  }
  return database;
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function randomTeamName(token, index) {
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const noun = NOUNS[randomInt(NOUNS.length)];
  return `${adjective} ${noun} ${token}-${String(index + 1).padStart(2, "0")}`;
}

async function createTeam(client, name, leader, members, token) {
  const slug = await uniqueSlug(name, (candidate) => teamsRepo.isSlugTaken(client, candidate));
  const team = await teamsRepo.insert(client, {
    slug,
    name,
    nameKey: teamNameKey(name),
    description: `Локальная тестовая команда, набор ${token}.`,
    logoData: null,
    leaderUserId: leader.id
  });
  for (const member of members) {
    await teamsRepo.addMembership(client, team.id, member, member.id === leader.id ? "leader" : "member");
  }
  await teamsRepo.audit(client, {
    teamId: team.id,
    actorUserId: leader.id,
    eventType: "team_seed",
    entityType: "team",
    entityId: team.id,
    after: team,
    metadata: { localTestData: true, token, memberCount: members.length }
  });
  return { team, leader, members };
}

async function main() {
  const connectionString = requireDatabaseUrl(DATABASE_URL);
  const database = assertExplicitLocalTarget(connectionString);
  const pool = new Pool({
    connectionString,
    ssl: PGSSL ? { rejectUnauthorized: false } : undefined
  });
  const client = await pool.connect();
  try {
    const { rows: users } = await client.query("SELECT id, name FROM users ORDER BY id");
    const requiredLeader = users.find((user) => user.name.toLocaleLowerCase("en-US") === REQUIRED_LEADER.toLocaleLowerCase("en-US"));
    if (!requiredLeader) throw new Error(`Required leader ${REQUIRED_LEADER} was not found`);
    const needed = TEAM_COUNT * MEMBERS_PER_TEAM;
    if (users.length < needed) throw new Error(`At least ${needed} users are required`);

    const selectedUsers = [requiredLeader, ...shuffle(users.filter((user) => user.id !== requiredLeader.id)).slice(0, needed - 1)];
    const token = randomBytes(3).toString("hex").toUpperCase();
    const generated = [];

    await client.query("BEGIN");
    for (let index = 0; index < TEAM_COUNT; index += 1) {
      const members = selectedUsers.slice(index * MEMBERS_PER_TEAM, (index + 1) * MEMBERS_PER_TEAM);
      const leader = index === 0 ? requiredLeader : members[0];
      generated.push(await createTeam(client, randomTeamName(token, index), leader, members, token));
    }
    await client.query("COMMIT");

    console.log(JSON.stringify({
      database,
      token,
      teamCount: generated.length,
      membersPerTeam: MEMBERS_PER_TEAM,
      teams: generated.map(({ team, leader, members }) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        leader: leader.name,
        members: members.map((member) => member.name)
      }))
    }, null, 2));
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
