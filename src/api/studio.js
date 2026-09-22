const { createHash } = require("node:crypto");
const { HttpError, sessionToken } = require("../http/io");
const { siteOrigin } = require("../http/sites");
const { COOKIE_SECURE } = require("../config");
const model = require("../../public/studio/model");
const store = require("../db/repositories/studio");
const PROJECT_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const PUBLICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 100 * 1024 * 1024;

function csrfToken(req) {
  return createHash("sha256").update("kt-studio-csrf:" + sessionToken(req)).digest("hex");
}

function checkAccount({ req, user }) {
  // An editor left open while another account signs in must never upload its
  // old local projects into the new account, including after reconnecting.
  if (req.headers["x-studio-account"] !== String(user.id)) {
    throw new HttpError(401, "Аккаунт изменился. Обновите страницу Студии, чтобы продолжить.");
  }
}

function checkWrite(ctx) {
  checkAccount(ctx);
  const { req } = ctx;
  if (req.headers["x-csrf-token"] !== csrfToken(req)) throw new HttpError(403, "Сессия истекла. Обновите страницу.");
  const expectedOrigin = (siteOrigin(req) || process.env.SITE_URL || `${COOKIE_SECURE || req.socket?.encrypted ? "https" : "http"}://${req.headers.host}`).replace(/\/+$/, "");
  if (req.headers.origin && req.headers.origin !== expectedOrigin) throw new HttpError(403, "Недопустимый источник запроса.");
}

function validate(body, id, publishing) {
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new HttpError(400, "Некорректная версия черновика.");
  try {
    const project = model.validate(model.migrate(body.project));
    if (!PROJECT_ID.test(id) || project.team.id !== id) throw Error("Некорректный идентификатор команды.");
    if (project.team.name.length > 200 || typeof project.team.subtitle !== "string" || project.team.subtitle.length > 2000 || typeof project.team.version !== "string" || project.team.version.length > 100) throw Error("Проверьте название, подзаголовок и версию команды.");
    if (publishing && !project.team.name.trim()) throw Error("Укажите название команды перед публикацией.");
    return project;
  } catch (error) { throw new HttpError(400, error.message || "Некорректный проект."); }
}

async function session(ctx) {
  checkAccount(ctx);
  return { userId: ctx.user.id, csrfToken: csrfToken(ctx.req) };
}
async function drafts(ctx) {
  checkAccount(ctx);
  return { teams: await store.drafts(ctx.client, ctx.user.id), deletedIds: await store.deletedIds(ctx.client, ctx.user.id) };
}
async function draft(ctx) {
  checkAccount(ctx);
  if (!PROJECT_ID.test(ctx.params.id)) throw new HttpError(404, "Черновик не найден.");
  const result = await store.draft(ctx.client, ctx.user.id, ctx.params.id);
  if (!result) throw new HttpError(404, "Черновик не найден.");
  return result;
}
async function save(ctx, publishing = false) {
  checkWrite(ctx);
  const project = validate(ctx.body, ctx.params.id, publishing);
  const recoveryId = ctx.body.recoveryId;
  if (recoveryId !== undefined && (typeof recoveryId !== "string" || !PROJECT_ID.test(recoveryId) || recoveryId === ctx.params.id)) {
    throw new HttpError(400, "Некорректный идентификатор копии правок.");
  }
  return store.save(ctx.client, ctx.user.id, project, ctx.body.revision, publishing, recoveryId);
}
async function library(ctx) {
  const offset = Number(ctx.query.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, "Некорректная страница.");
  return store.library(ctx.client, (ctx.query.get("q") || "").slice(0, 200), offset, 30, libraryOwner(ctx));
}

function libraryOwner(ctx) {
  return ctx.user && ctx.req.headers["x-studio-account"] === String(ctx.user.id) ? ctx.user.id : null;
}

async function rename(ctx) {
  checkWrite(ctx);
  if (!PROJECT_ID.test(ctx.params.id)) throw new HttpError(404, "Команда не найдена.");
  if (!Number.isSafeInteger(ctx.body?.revision) || ctx.body.revision < 0) throw new HttpError(400, "Некорректная версия черновика.");
  const name = typeof ctx.body.name === "string" ? ctx.body.name.trim() : "";
  if (!name || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name)) throw new HttpError(400, "Введите название команды от 1 до 200 символов в одну строку.");
  return store.rename(ctx.client, ctx.user.id, ctx.params.id, name, ctx.body.revision);
}

async function remove(ctx) {
  checkWrite(ctx);
  if (!PROJECT_ID.test(ctx.params.id)) throw new HttpError(404, "Команда не найдена.");
  if (!Number.isSafeInteger(ctx.body?.revision) || ctx.body.revision < 0) throw new HttpError(400, "Некорректная версия черновика.");
  return store.remove(ctx.client, ctx.user.id, ctx.params.id, ctx.body.revision);
}
async function publication(ctx) {
  if (!PUBLICATION_ID.test(ctx.params.id)) throw new HttpError(404, "Команда не найдена.");
  const result = await store.publication(ctx.client, ctx.params.id, libraryOwner(ctx));
  if (!result) throw new HttpError(404, "Команда не найдена.");
  return result;
}

module.exports = { session, drafts, draft, save, remove, rename, publish: ctx => save(ctx, true), library, publication, MAX_BODY };
