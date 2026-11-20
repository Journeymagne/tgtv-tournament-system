const { HttpError, ValidationError } = require('../http/io');
const store = require('../db/repositories/weapon-profiles');

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const isName = value => typeof value === 'string' && value.trim().length > 0 &&
  Array.from(value.trim()).length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
const safeKey = key => /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key) && !Object.hasOwn(Object.prototype, key) && key !== 'prototype';
const scalar = value => typeof value === 'boolean' || (Number.isSafeInteger(value) && Math.abs(value) <= 100) ||
  (typeof value === 'string' && value.length <= 64 && !value.includes('\0'));

function profile(value) {
  if (!isObject(value) || !isName(value.name) || !isObject(value.model)) throw new ValidationError('Некорректный профиль оружия.');
  const model = value.model;
  const validValue = value => scalar(value) || (Array.isArray(value) && value.length <= 64 && value.every(scalar)) ||
    (isObject(value) && Object.keys(value).length <= 32 && Object.entries(value).every(([key, item]) => safeKey(key) && scalar(item)));
  if (!['numDice','diceStat','normDmg','critDmg'].every(key => Number.isInteger(model[key]) && model[key] >= 0) ||
      model.numDice > 9 || model.diceStat < 1 || model.diceStat > 7 ||
      !Array.isArray(model.abilities) || !model.abilities.every(item => typeof item === 'string') ||
      Object.keys(model).length > 64 || !Object.entries(model).every(([key, item]) => safeKey(key) && validValue(item)) ||
      Buffer.byteLength(JSON.stringify(model)) > 8192) throw new ValidationError('Некорректные параметры оружия.');
  return { name: value.name.trim(), model };
}

function scope({ user, params, req }, writing = false) {
  if (!['shoot','fight'].includes(params.mode)) throw new HttpError(404, 'Неизвестный режим расчёта.');
  const expected = req.headers['x-weapon-profile-account'];
  if ((writing || expected !== undefined) && expected !== String(user.id)) {
    throw new HttpError(401, 'Аккаунт изменился. Обновите список профилей.');
  }
  return [user.id, params.mode];
}

async function list(ctx) {
  const profiles = await store.list(ctx.client, ...scope(ctx));
  return { accountId: ctx.user.id, profiles };
}
async function save(ctx) {
  const args = scope(ctx, true);
  await store.save(ctx.client, ...args, profile(ctx.body));
  return { accountId: ctx.user.id };
}
async function remove(ctx) {
  const args = scope(ctx, true);
  if (!isName(ctx.body?.name) || !uuid(ctx.body?.revision)) throw new ValidationError('Укажите профиль для удаления.');
  await store.remove(ctx.client, ...args, ctx.body.name.trim(), ctx.body.revision);
  return { accountId: ctx.user.id };
}
async function importLegacy(ctx) {
  const args = scope(ctx, true);
  const { importId, profiles } = ctx.body || {};
  if (!uuid(importId) || !Array.isArray(profiles) || !profiles.length || profiles.length > store.MAX_PROFILES) {
    throw new ValidationError('Некорректный список профилей.');
  }
  const entries = profiles.map(profile);
  if (new Set(entries.map(row => row.name)).size !== entries.length) throw new ValidationError('Названия профилей должны различаться.');
  await store.importLegacy(ctx.client, ...args, importId, entries);
  return { accountId: ctx.user.id };
}
module.exports = { list, save, remove, importLegacy };
