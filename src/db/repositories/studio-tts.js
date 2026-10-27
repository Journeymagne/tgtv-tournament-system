const { randomUUID } = require("node:crypto");
const { HttpError } = require("../../http/io");

async function create(client, owner, pack) {
  const quotas = require('../../resources/quotas');
  await quotas.lock(client, owner);
  const limits = await quotas.limits(client, owner);
  const total = await quotas.studioUsage(client, owner);
  const { rows: [manifestSize] } = await client.query('SELECT octet_length($1::jsonb::text) AS bytes', [pack.manifest]);
  quotas.check('studioStorageBytes', limits.studioStorageBytes, total.bytes, total.bytes + pack.byteSize + manifestSize.bytes);
  await quotas.spend(client, owner, 'ttsExportHour', 3600, '', limits);
  // Match draft deletion's lock so a deleted project cannot acquire new public exports.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["studio:" + owner + ":" + pack.manifest.team.id]);
  const {rows:[project]} = await client.query("SELECT deleted_at FROM studio_projects WHERE owner_id=$1 AND project_id=$2", [owner,pack.manifest.team.id]);
  if (project?.deleted_at) throw new HttpError(410, "Команда удалена. Обновите страницу.");
  // Serialize quota checks, including simultaneous exports from different tabs.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["studio-tts:" + owner]);
  const {rows:[usage]} = await client.query(`SELECT COALESCE(sum(byte_size),0)::bigint AS bytes,
    count(*) FILTER (WHERE project_id=$2)::int AS versions FROM studio_tts_exports WHERE owner_id=$1`, [owner,pack.manifest.team.id]);
  quotas.check('ttsStorageBytes', limits.ttsStorageBytes, Number(usage.bytes), Number(usage.bytes) + pack.byteSize);
  quotas.check('ttsVersions', limits.ttsVersions, usage.versions, usage.versions + 1);
  const id = randomUUID();
  const {rows:[row]} = await client.query(`INSERT INTO studio_tts_exports (id,owner_id,project_id,name,manifest,byte_size)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,created_at,byte_size`, [id,owner,pack.manifest.team.id,pack.manifest.team.name,pack.manifest,pack.byteSize]);
  for (const asset of pack.assets) await client.query("INSERT INTO studio_tts_assets(export_id,name,bytes,hash) VALUES ($1,$2,$3,$4)", [id,asset.name,asset.bytes,asset.hash]);
  return row;
}

async function list(client, owner, project) {
  const {rows} = await client.query(`SELECT id,name,created_at,byte_size,jsonb_array_length(manifest->'cards') AS cards,
    jsonb_array_length(manifest->'tokens') AS tokens,
     COALESCE((SELECT sum((die->>'quantity')::int) FROM jsonb_array_elements(COALESCE(manifest->'dice','[]'::jsonb)) die),0)::int AS dice FROM studio_tts_exports WHERE owner_id=$1 AND project_id=$2 ORDER BY created_at DESC`, [owner,project]);
  return rows;
}
async function manifest(client, id) {
  const {rows:[row]} = await client.query("SELECT manifest FROM studio_tts_exports WHERE id=$1", [id]);
  return row?.manifest;
}
async function asset(client, id, name) {
  const {rows:[row]} = await client.query("SELECT bytes,hash FROM studio_tts_assets WHERE export_id=$1 AND name=$2", [id,name]);
  return row;
}
async function remove(client, owner, id) {
  await client.query("DELETE FROM studio_tts_exports WHERE id=$1 AND owner_id=$2", [id,owner]);
}
module.exports = {create,list,manifest,asset,remove};
