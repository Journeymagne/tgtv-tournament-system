const { isDeepStrictEqual } = require('node:util');
const { HttpError } = require('../../http/io');

const MAX_PROFILES = 100;
const TOO_MANY = 'Можно сохранить до 100 профилей на режим. Удалите лишние профили и повторите.';

async function lock(client, userId, mode) {
  // A save and a browser import must agree on the available names and capacity.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`weapon-profiles:${userId}:${mode}`]);
}

async function list(client, userId, mode) {
  const { rows } = await client.query(`
    SELECT name,model,revision FROM accounts.weapon_profiles
    WHERE user_id=$1 AND mode=$2 ORDER BY updated_at DESC,name`, [userId, mode]);
  return rows;
}

async function save(client, userId, mode, { name, model }) {
  await lock(client, userId, mode);
  const { rows: [usage] } = await client.query(`
    SELECT count(*)::int AS total, bool_or(name=$3) AS replacing
    FROM accounts.weapon_profiles WHERE user_id=$1 AND mode=$2`, [userId, mode, name]);
  if (usage.total >= MAX_PROFILES && !usage.replacing) throw new HttpError(409, TOO_MANY);
  await client.query(`
    INSERT INTO accounts.weapon_profiles(user_id,mode,name,model) VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT (user_id,mode,name) DO UPDATE SET model=EXCLUDED.model,
      updated_at=clock_timestamp(), revision=gen_random_uuid()`, [userId, mode, name, JSON.stringify(model)]);
}

async function remove(client, userId, mode, name, revision) {
  await lock(client, userId, mode);
  const result = await client.query(`
    DELETE FROM accounts.weapon_profiles WHERE user_id=$1 AND mode=$2 AND name=$3 AND revision=$4`,
  [userId, mode, name, revision]);
  if (!result.rowCount) throw new HttpError(412, 'Профиль уже изменён или удалён. Выберите его заново.');
}

async function importLegacy(client, userId, mode, importId, profiles) {
  await lock(client, userId, mode);
  // A lost response must not recreate a profile that was edited or deleted since import.
  const receipt = await client.query(`
    INSERT INTO accounts.weapon_profile_imports(user_id,mode,import_id) VALUES($1,$2,$3)
    ON CONFLICT DO NOTHING`, [userId, mode, importId]);
  if (!receipt.rowCount) return;

  const existing = new Map((await list(client, userId, mode)).map(row => [row.name, row.model]));
  const reserved = new Set([...existing.keys(), ...profiles.map(row => row.name)]);
  const additions = [];
  for (const profile of profiles) {
    let name = profile.name;
    if (existing.has(name)) {
      if (isDeepStrictEqual(existing.get(name), profile.model)) continue;
      let suffix = 2;
      do {
        const ending = ` (${suffix++})`;
        name = Array.from(profile.name).slice(0, 100 - ending.length).join('') + ending;
      } while (reserved.has(name));
    }
    reserved.add(name);
    additions.push({ name, model: profile.model });
  }
  if (existing.size + additions.length > MAX_PROFILES) throw new HttpError(409, TOO_MANY);
  if (additions.length) await client.query(`
    INSERT INTO accounts.weapon_profiles(user_id,mode,name,model,updated_at)
    SELECT $1,$2,item->>'name',item->'model',statement_timestamp() - position * interval '1 microsecond'
    FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY AS batch(item,position)`,
  [userId, mode, JSON.stringify(additions)]);
}

module.exports = { list, save, remove, importLegacy, MAX_PROFILES, TOO_MANY };
