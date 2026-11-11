const { HttpError } = require('../http/io');
const RANKS = ['S', 'A', 'B', 'C', 'F', 'pool'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SAVED = 100;
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function normalizeTitle(title) {
  if (typeof title !== 'string') throw new HttpError(400, 'Укажите название тирлиста.');
  const result = title.trim();
  if (!result || result.length > 120 || /[\u0000-\u001f\u007f]/.test(result)) throw new HttpError(400, 'Название должно содержать от 1 до 120 символов в одной строке.');
  return result;
}
function normalizeRows(rows, teamIds) {
  if (!object(rows) || Object.keys(rows).some(k => !RANKS.includes(k))) throw new HttpError(400, 'Нужны тиры S, A, B, C, F и зона распределения.');
  const known = new Set(teamIds), seen = new Set(), normalized = {};
  for (const rank of RANKS) {
    if (!Array.isArray(rows[rank]) || rows[rank].length > known.size) throw new HttpError(400, 'Некорректный состав тира.');
    normalized[rank] = [];
    for (const id of rows[rank]) {
      if (typeof id !== 'string' || !known.has(id)) throw new HttpError(400, 'В раскладке есть неизвестная команда.');
      if (seen.has(id)) throw new HttpError(400, 'Команда не может находиться в нескольких тирах.');
      seen.add(id); normalized[rank].push(id);
    }
  }
  // Preserve old ranks when new catalogue teams are added; append only omissions.
  for (const id of teamIds) if (!seen.has(id)) normalized.pool.push(id);
  return normalized;
}
function checkRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new HttpError(400, 'Укажите текущую версию тирлиста.');
  return revision;
}
function validId(value) { return typeof value === 'string' && UUID.test(value); }
function payload(body, teamIds, update = false) {
  const allowed = ['title', 'seasonId', 'rows', ...(update ? ['revision'] : [])];
  if (!object(body) || Object.keys(body).some(k => !allowed.includes(k))) throw new HttpError(400, 'Некорректные поля тирлиста.');
  if (typeof body.seasonId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(body.seasonId)) throw new HttpError(400, 'Выберите сезон.');
  return { title: normalizeTitle(body.title), seasonId: body.seasonId, rows: normalizeRows(body.rows, teamIds),
    ...(update ? { revision: checkRevision(body.revision) } : {}) };
}
function seasonsView(rows, at = Date.now()) {
  const time = Number(at);
  const seasons = rows.map(row => ({
    id: row.id, label: row.label,
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    isActive: (!row.starts_at || time >= new Date(row.starts_at).getTime()) && (!row.ends_at || time < new Date(row.ends_at).getTime())
  }));
  const ordered = [...seasons].sort((a,b) => (b.startsAt ? Date.parse(b.startsAt) : -Infinity) - (a.startsAt ? Date.parse(a.startsAt) : -Infinity));
  const current = ordered.find(s => s.isActive) || ordered.find(s => !s.startsAt || Date.parse(s.startsAt) <= time) || ordered.at(-1);
  return { seasons, currentSeasonId: current?.id || null };
}
module.exports = { RANKS, MAX_SAVED, object, normalizeTitle, normalizeRows, checkRevision, validId, payload, seasonsView };
