const { createHash } = require("node:crypto");
const { HttpError, sessionToken } = require("../http/io");
const { siteOrigin } = require("../http/sites");
const { COOKIE_SECURE } = require("../config");
const bank = require("../domain/training");
const store = require("../db/repositories/training");
const { progression } = require("../domain/training-progression");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function csrfToken(req) {
  return createHash("sha256").update("kt-training-csrf:" + sessionToken(req)).digest("hex");
}

function authorize(ctx, write = false) {
  if (ctx.req.headers["x-training-account"] !== String(ctx.user.id)) {
    throw new HttpError(401, "Аккаунт изменился. Обновите страницу тренажёра.");
  }
  if (!write) return;
  if (ctx.req.headers["x-csrf-token"] !== csrfToken(ctx.req)) {
    throw new HttpError(403, "Сессия входа изменилась. Обновите страницу.");
  }
  const origin = (siteOrigin(ctx.req) || process.env.SITE_URL || `${COOKIE_SECURE || ctx.req.socket?.encrypted ? "https" : "http"}://${ctx.req.headers.host}`).replace(/\/+$/, "");
  if (ctx.req.headers.origin && ctx.req.headers.origin !== origin) throw new HttpError(403, "Недопустимый источник запроса.");
  if (!ctx.body || typeof ctx.body !== "object" || Array.isArray(ctx.body)) throw new HttpError(400, "Некорректный запрос.");
}

function checkRevision(profile, body) {
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new HttpError(400, "Укажите версию прогресса.");
  if (body.revision !== profile.revision) throw new HttpError(409, "Прогресс изменился на другом устройстве. Загружены актуальные данные; повторите действие.");
}

async function response(ctx, profile) {
  return { body: { state: await store.state(ctx.client, ctx.user, profile, bank.BANK_VERSION), csrfToken: csrfToken(ctx.req) }, headers: { "Cache-Control": "no-store" } };
}

function questions() {
  return { body: { version: bank.BANK_VERSION, verifiedAt: "2026-10-15", questions: bank.questions, journey: progression() }, headers: { "Cache-Control": "no-store" } };
}

async function progress(ctx) {
  authorize(ctx);
  const profile = await store.lockProfile(ctx.client, ctx.user.id);
  return response(ctx, profile);
}

async function start(ctx) {
  authorize(ctx, true);
  const { sessionId, mode, replaceSessionId } = ctx.body;
  if (!UUID.test(sessionId || "") || !["mixed", "1", "2", "3", "4"].includes(mode)) throw new HttpError(400, "Выберите сложность сессии.");
  const profile = await store.lockProfile(ctx.client, ctx.user.id);
  const previousRequest = await store.findSession(ctx.client, ctx.user.id, sessionId);
  // Retrying an acknowledged request never creates or abandons another session.
  if (previousRequest) {
    if (previousRequest.mode !== mode) throw new HttpError(409, "Этот запрос уже использован для другой сессии.");
    return response(ctx, profile);
  }
  checkRevision(profile, ctx.body);
  const current = await store.activeSession(ctx.client, ctx.user.id);
  if ((current?.id || null) !== (replaceSessionId || null)) throw new HttpError(409, "Активная сессия изменилась. Обновите страницу перед началом новой.");
  if (current) await ctx.client.query("UPDATE training_sessions SET status='abandoned',finished_at=NOW() WHERE id=$1 AND user_id=$2", [current.id, ctx.user.id]);
  const { rowCount } = await ctx.client.query(`INSERT INTO training_sessions(id,user_id,bank_version,mode,items)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`, [sessionId, ctx.user.id, bank.BANK_VERSION, mode, JSON.stringify(bank.sessionItems(mode))]);
  if (!rowCount) throw new HttpError(409, "Идентификатор запроса занят. Повторите начало сессии.");
  await store.saveProfile(ctx.client, profile);
  return response(ctx, profile);
}

async function ownedSession(ctx) {
  if (!UUID.test(ctx.params.id || "")) throw new HttpError(404, "Сессия не найдена.");
  const session = await store.findSession(ctx.client, ctx.user.id, ctx.params.id);
  if (!session) throw new HttpError(404, "Сессия не найдена.");
  return session;
}

async function answer(ctx) {
  authorize(ctx, true);
  const { questionId, selected } = ctx.body;
  if (typeof questionId !== "string" || !Number.isInteger(selected) || selected < 0 || selected > 3) throw new HttpError(400, "Выберите один вариант ответа.");
  const profile = await store.lockProfile(ctx.client, ctx.user.id);
  const session = await ownedSession(ctx);
  const index = session.items.findIndex(item => item.questionId === questionId);
  if (index < 0) throw new HttpError(400, "Вопрос не относится к этой сессии.");
  const item = session.items[index];
  if (item.selected !== null) {
    if (item.selected !== selected) throw new HttpError(409, "На этот вопрос уже ответили. Сохранённый ответ нельзя изменить.");
    return response(ctx, profile);
  }
  checkRevision(profile, ctx.body);
  if (session.status !== "active" || session.bank_version !== bank.BANK_VERSION) throw new HttpError(409, "Эта сессия больше не активна.");
  if (index !== session.cursor || session.items.findIndex(value => value.selected === null) !== index) throw new HttpError(409, "Сначала завершите текущий вопрос.");
  const question = bank.byId.get(questionId);
  item.selected = selected;
  item.correct = selected === question.answer;
  item.answeredAt = new Date().toISOString();
  const prior = profile.stats[questionId] || { attempts: 0, correct: 0 };
  profile.stats[questionId] = { attempts: prior.attempts + 1, correct: prior.correct + Number(item.correct), lastCorrect: item.correct, lastAt: item.answeredAt };
  await ctx.client.query("UPDATE training_sessions SET items=$3 WHERE id=$1 AND user_id=$2", [session.id, ctx.user.id, JSON.stringify(session.items)]);
  await store.saveProfile(ctx.client, profile);
  return response(ctx, profile);
}

async function advance(ctx) {
  authorize(ctx, true);
  const profile = await store.lockProfile(ctx.client, ctx.user.id);
  const session = await ownedSession(ctx);
  const index = session.items.findIndex(item => item.questionId === ctx.body.questionId);
  if (index < 0) throw new HttpError(400, "Вопрос не относится к этой сессии.");
  if (session.status === "completed" || session.status === "active" && session.cursor > index) return response(ctx, profile);
  checkRevision(profile, ctx.body);
  if (session.status !== "active" || index !== session.cursor || session.items[index].selected === null) throw new HttpError(409, "Сначала проверьте ответ на текущий вопрос.");
  const completed = index === 19;
  if (completed) {
    if (session.items.some(item => item.selected === null)) throw new HttpError(409, "В сессии остались вопросы без ответа.");
    await ctx.client.query("UPDATE training_sessions SET status='completed',finished_at=NOW() WHERE id=$1 AND user_id=$2", [session.id, ctx.user.id]);
  } else {
    await ctx.client.query("UPDATE training_sessions SET cursor=cursor+1 WHERE id=$1 AND user_id=$2", [session.id, ctx.user.id]);
  }
  await store.saveProfile(ctx.client, profile, completed);
  if (completed) await require('../notifications/publish').publish(ctx.client,'knowthykt',ctx.user.id,{
    id:'knowthykt_session:'+session.id,type:'knowthykt_session',createdAt:new Date().toISOString(),
    title:'Сессия KnowThyKT завершена',excerpt:'Результат сохранён в вашем прогрессе.',href:'/knowthykt'
  });
  return response(ctx, profile);
}

module.exports = { routes: [
  { method: "GET", path: "/api/training/questions", handler: questions },
  { method: "GET", path: "/api/training/progress", handler: progress, auth: "user", tx: true },
  { method: "POST", path: "/api/training/sessions", handler: start, auth: "user", tx: true, maxBodyBytes: 4096 },
  { method: "POST", path: "/api/training/sessions/:id/answers", handler: answer, auth: "user", tx: true, maxBodyBytes: 4096 },
  { method: "POST", path: "/api/training/sessions/:id/advance", handler: advance, auth: "user", tx: true, maxBodyBytes: 4096 }
] };
