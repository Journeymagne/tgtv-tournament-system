const { createHash, timingSafeEqual } = require('node:crypto');
const { HttpError, sessionToken } = require('../http/io');
const { siteOrigin } = require('../http/sites');
const { COOKIE_SECURE } = require('../config');
const validation = require('../domain/tierlists');
const store = require('../db/repositories/tierlists');
function catalogData() {
  const catalog = require('../../public/tierlist/catalog.json');
  return { version: catalog.version, teams: catalog.teams };
}
function csrfToken(req) {
  const token = sessionToken(req);
  if (!token) throw new HttpError(401, 'Войдите в KT Companion.');
  return createHash('sha256').update('kt-tierlists-csrf:' + token).digest('hex');
}
function equalToken(a, b) {
  return typeof a === 'string' && /^[a-f0-9]{64}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function authorize(ctx, write = false) {
  if (!ctx.user) throw new HttpError(401, 'Войдите в KT Companion.');
  if (!write) return;
  if (ctx.req.headers['x-tierlist-account'] !== String(ctx.user.id)) throw new HttpError(401, 'Аккаунт изменился. Обновите страницу тирлистов.');
  if (!equalToken(ctx.req.headers['x-csrf-token'], csrfToken(ctx.req))) throw new HttpError(403, 'Сессия входа изменилась. Обновите страницу.');
  const origin = (siteOrigin(ctx.req) || `${COOKIE_SECURE || ctx.req.socket?.encrypted ? 'https' : 'http'}://${ctx.req.headers.host}`).replace(/\/+$/, '');
  if (ctx.req.headers.origin && ctx.req.headers.origin !== origin) throw new HttpError(403, 'Недопустимый источник запроса.');
}
function response(ctx, body, status = 200) {
  return { status, body: { ...body, accountId: ctx.user.id, csrfToken: csrfToken(ctx.req) }, headers: { 'Cache-Control': 'no-store' } };
}
function teams() { return catalogData().teams.map(team => team.id); }
async function knownSeason(client, id) {
  if (!await store.hasSeason(client, id)) throw new HttpError(400, 'Неизвестный сезон. Обновите список сезонов.');
}
async function owned(ctx, lock = false) {
  if (!validation.validId(ctx.params.id)) throw new HttpError(404, 'Тирлист не найден.');
  const tierlist = await store.owned(ctx.client, ctx.user.id, ctx.params.id, lock);
  if (!tierlist) throw new HttpError(404, 'Тирлист не найден.');
  return tierlist;
}
function catalog() { return { body: catalogData(), headers: { 'Cache-Control': 'no-cache' } }; }
async function seasons(ctx) { return { body: validation.seasonsView(await store.seasons(ctx.client)), headers: { 'Cache-Control': 'no-cache' } }; }
async function list(ctx) {
  authorize(ctx);
  const seasonId = ctx.query.get('seasonId') || null;
  if (seasonId) await knownSeason(ctx.client, seasonId);
  return response(ctx, { tierlists: await store.list(ctx.client, ctx.user.id, seasonId) });
}
async function get(ctx) {
  authorize(ctx);
  const tierlist = await owned(ctx);
  tierlist.rows = validation.normalizeRows(tierlist.rows, teams());
  return response(ctx, { tierlist });
}
async function create(ctx) {
  authorize(ctx, true);
  const value = validation.payload(ctx.body, teams());
  await knownSeason(ctx.client, value.seasonId);
  return response(ctx, { tierlist: await store.create(ctx.client, ctx.user.id, value) }, 201);
}
async function update(ctx) {
  authorize(ctx, true);
  const current = await owned(ctx, true);
  const value = validation.payload(ctx.body, teams(), true);
  if (value.revision !== current.revision) throw new HttpError(409, 'Тирлист изменён на другом устройстве. Загрузите актуальную версию.');
  await knownSeason(ctx.client, value.seasonId);
  const tierlist = await store.update(ctx.client, ctx.user.id, ctx.params.id, value);
  if (!tierlist) throw new HttpError(409, 'Тирлист изменён на другом устройстве. Загрузите актуальную версию.');
  return response(ctx, { tierlist });
}
async function remove(ctx) {
  authorize(ctx, true);
  const current = await owned(ctx, true);
  if (!validation.object(ctx.body) || Object.keys(ctx.body).some(k => k !== 'revision')) throw new HttpError(400, 'Некорректный запрос удаления.');
  const revision = validation.checkRevision(ctx.body.revision);
  if (revision !== current.revision || !await store.remove(ctx.client, ctx.user.id, ctx.params.id, revision)) throw new HttpError(409, 'Тирлист изменён на другом устройстве. Загрузите актуальную версию.');
  return response(ctx, { deleted: true });
}
module.exports = { catalog, seasons, list, get, create, update, remove, authorize, csrfToken };
