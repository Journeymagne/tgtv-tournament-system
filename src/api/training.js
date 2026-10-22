const { createHash } = require("node:crypto");
const { HttpError, sessionToken } = require("../http/io");
const { siteOrigin } = require("../http/sites");
const { COOKIE_SECURE } = require("../config");
const bank = require("../domain/training");
const store = require("../db/repositories/training");
const catalogStore = require('../db/repositories/training-catalog');
const validation = require('../domain/training-moderation');
const { isDeepStrictEqual } = require('node:util');
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
  return { body: { state: await store.state(ctx.client, ctx.user, profile, bank.BANK_VERSION, ctx.catalog), csrfToken: csrfToken(ctx.req) }, headers: { "Cache-Control": "no-store" } };
}

async function questions(ctx) {
  const catalog = await catalogStore.load(ctx.client);
  if (ctx.query.get('revision') === String(catalog.revision)) return { body: { revision: catalog.revision, unchanged: true }, headers: { 'Cache-Control': 'no-store' } };
  return { body: { version: bank.BANK_VERSION, revision: catalog.revision, compatibleVersions: bank.COMPATIBLE_VERSIONS, verifiedAt: "2026-10-16", questions: catalog.questions, journey: progression({}, catalog.curriculum) }, headers: { "Cache-Control": "no-store" } };
}

async function progress(ctx) {
  authorize(ctx);
  ctx.catalog = await catalogStore.load(ctx.client);
  const profile = await store.lockProfile(ctx.client, ctx.user.id);
  return response(ctx, profile);
}

async function start(ctx) {
  authorize(ctx, true);
  ctx.catalog = await catalogStore.load(ctx.client);
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
  const pool = ctx.catalog.active.filter(q => mode === 'mixed' || q.difficulty === Number(mode));
  if (pool.length < 20) throw new HttpError(409, 'В этом режиме осталось меньше 20 вопросов. Выберите другую сложность или смешанную подготовку.');
  const current = await store.activeSession(ctx.client, ctx.user.id);
  if ((current?.id || null) !== (replaceSessionId || null)) throw new HttpError(409, "Активная сессия изменилась. Обновите страницу перед началом новой.");
  if (current) await ctx.client.query("UPDATE training_sessions SET status='abandoned',finished_at=NOW() WHERE id=$1 AND user_id=$2", [current.id, ctx.user.id]);
  const { rowCount } = await ctx.client.query(`INSERT INTO training_sessions(id,user_id,bank_version,mode,items)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`, [sessionId, ctx.user.id, bank.BANK_VERSION, mode, JSON.stringify(bank.sessionItems(mode, pool))]);
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
  ctx.catalog = await catalogStore.load(ctx.client);
  const { questionId, selected } = ctx.body;
  if (typeof questionId !== "string" || !Number.isInteger(selected) || selected < 0 || selected > 3) throw new HttpError(400, "Выберите один вариант ответа.");
  const profile = await store.lockProfile(ctx.client, ctx.user.id);
  await store.repairActive(ctx.client, ctx.user.id, profile, ctx.catalog);
  const session = await ownedSession(ctx);
  const index = session.items.findIndex(item => item.questionId === questionId);
  if (index < 0) throw new HttpError(409, 'Вопрос снят с выдачи или заменён. Загружаем актуальную сессию.');
  const item = session.items[index];
  if (item.selected !== null) {
    if (item.selected !== selected) throw new HttpError(409, "На этот вопрос уже ответили. Сохранённый ответ нельзя изменить.");
    return response(ctx, profile);
  }
  checkRevision(profile, ctx.body);
  if (session.status !== "active" || !bank.COMPATIBLE_VERSIONS.includes(session.bank_version)) throw new HttpError(409, "Эта сессия больше не активна.");
  if (index !== session.cursor || session.items.findIndex(value => value.selected === null && !value.skipped) !== index) throw new HttpError(409, "Сначала завершите текущий вопрос.");
  const question = ctx.catalog.byId.get(questionId);
  if (item.skipped || question?.status !== 'active' || ctx.body.questionVersion !== question.version) throw new HttpError(409, 'Вопрос снят с выдачи или исправлен. Обновите сессию.');
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
  ctx.catalog = await catalogStore.load(ctx.client);
  const profile = await store.lockProfile(ctx.client, ctx.user.id);
  await store.repairActive(ctx.client, ctx.user.id, profile, ctx.catalog);
  const session = await ownedSession(ctx);
  const index = session.items.findIndex(item => item.questionId === ctx.body.questionId);
  if (index < 0) throw new HttpError(409, 'Вопрос заменён. Загружаем актуальную сессию.');
  if (session.status === "completed" || session.status === "active" && session.cursor > index) return response(ctx, profile);
  checkRevision(profile, ctx.body);
  if (session.status !== "active" || index !== session.cursor || session.items[index].selected === null && !session.items[index].skipped) throw new HttpError(409, "Сначала проверьте ответ на текущий вопрос.");
  const completed = index === 19;
  if (completed) {
    if (session.items.some(item => item.selected === null && !item.skipped)) throw new HttpError(409, "В сессии остались вопросы без ответа.");
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

function questionFrom(ctx) {
  const question = ctx.catalog.byId.get(ctx.params.id);
  if (!question) throw new HttpError(404, 'Вопрос не найден.');
  return question;
}
async function priorRequest(ctx) {
  if (!UUID.test(ctx.body.requestId || '')) throw new HttpError(400, 'Некорректный идентификатор запроса.');
  const { rows: [event] } = await ctx.client.query('SELECT question_id,action FROM knowthykt.training_question_events WHERE actor_id=$1 AND request_id=$2', [ctx.user.id, ctx.body.requestId]);
  if (event && (event.question_id !== ctx.params.id || event.action !== (ctx.body.action || 'report'))) throw new HttpError(409, 'Этот запрос уже использован для другого действия.');
  return event;
}
async function report(ctx) {
  authorize(ctx, true);
  ctx.catalog = await catalogStore.load(ctx.client, true);
  const question = questionFrom(ctx);
  const prior = await priorRequest(ctx);
  if (!prior) {
    if (question.status === 'deleted') throw new HttpError(409, 'Вопрос уже удалён из пула.');
    if (ctx.body.questionVersion !== question.version || question.status === 'active' && ctx.body.questionRevision !== question.revision) throw new HttpError(409, 'Вопрос уже изменён модератором. Просмотрите актуальную версию.');
    const comment = validation.comment(ctx.body.comment);
    await catalogStore.event(ctx.client, question.id, ctx.user, 'report', comment, question, ctx.body.requestId);
    await ctx.client.query("UPDATE knowthykt.training_questions SET status='review',revision=revision+1,updated_at=NOW() WHERE id=$1", [question.id]);
    await catalogStore.changed(ctx.client);
    ctx.catalog = await catalogStore.load(ctx.client);
  }
  const profile = await store.lockProfile(ctx.client, ctx.user.id);
  return response(ctx, profile);
}
async function moderationList(ctx) {
  authorize(ctx);
  const catalog = await catalogStore.load(ctx.client);
  const { rows } = await ctx.client.query("SELECT question_id,COUNT(*)::int AS count FROM knowthykt.training_question_events WHERE action='report' GROUP BY question_id");
  const counts = new Map(rows.map(row => [row.question_id, row.count]));
  return { body: { questions: catalog.questions.map(q => ({ ...q, reportCount: counts.get(q.id) || 0 })), revision: catalog.revision }, headers: { 'Cache-Control': 'no-store' } };
}
async function detail(ctx) {
  const question = questionFrom(ctx);
  const { rows } = await ctx.client.query(`SELECT e.id,e.action,e.comment,e.snapshot,e.created_at,u.name AS author
    FROM knowthykt.training_question_events e LEFT JOIN users u ON u.id=e.actor_id
    WHERE e.question_id=$1 ORDER BY e.id DESC`, [question.id]);
  return { body: { question, events: rows }, headers: { 'Cache-Control': 'no-store' } };
}
async function moderationDetail(ctx) {
  authorize(ctx);
  ctx.catalog = await catalogStore.load(ctx.client);
  return detail(ctx);
}
async function moderate(ctx) {
  authorize(ctx, true);
  ctx.catalog = await catalogStore.load(ctx.client, true);
  const question = questionFrom(ctx);
  if (await priorRequest(ctx)) return detail(ctx);
  const { action } = ctx.body;
  if (!['save', 'restore', 'delete', 'comment'].includes(action)) throw new HttpError(400, 'Неизвестное действие модерации.');
  if (ctx.body.revision !== question.revision) throw new HttpError(409, 'Другой модератор изменил вопрос. Обновите его перед сохранением; ваши правки пока остаются в форме.');
  const comment = validation.comment(ctx.body.comment);
  if (action === 'comment' && !comment) throw new HttpError(400, 'Введите комментарий.');
  const edited = ['save', 'restore'].includes(action) ? validation.content(ctx.body.question, question.id) : validation.content(question, question.id);
  const changed = !isDeepStrictEqual(edited, validation.content(question, question.id));
  const status = action === 'delete' ? 'deleted' : action === 'restore' ? 'active' : action === 'save' && question.status !== 'deleted' ? 'review' : question.status;
  await ctx.client.query(`UPDATE knowthykt.training_questions SET content=$2,status=$3,version=version+$4,
    revision=revision+1,updated_at=NOW() WHERE id=$1`, [question.id, JSON.stringify(edited), status, Number(changed)]);
  await catalogStore.event(ctx.client, question.id, ctx.user, action, comment, { before: question, after: { ...edited, status, version: question.version + Number(changed) } }, ctx.body.requestId);
  await catalogStore.changed(ctx.client);
  ctx.catalog = await catalogStore.load(ctx.client);
  return detail(ctx);
}

module.exports = { routes: [
  { method: "GET", path: "/api/training/questions", handler: questions, tx: true },
  { method: "GET", path: "/api/training/progress", handler: progress, auth: "user", tx: true },
  { method: "POST", path: "/api/training/sessions", handler: start, auth: "user", tx: true, maxBodyBytes: 4096 },
  { method: "POST", path: "/api/training/sessions/:id/answers", handler: answer, auth: "user", tx: true, maxBodyBytes: 4096 },
  { method: "POST", path: "/api/training/sessions/:id/advance", handler: advance, auth: "user", tx: true, maxBodyBytes: 4096 },
  { method: 'POST', path: '/api/training/questions/:id/report', handler: report, auth: 'user', tx: true, maxBodyBytes: 20000 },
  { method: 'GET', path: '/api/training/moderation', handler: moderationList, auth: 'admin', tx: true },
  { method: 'GET', path: '/api/training/moderation/:id', handler: moderationDetail, auth: 'admin', tx: true },
  { method: 'POST', path: '/api/training/moderation/:id', handler: moderate, auth: 'admin', tx: true, maxBodyBytes: 100000 }
] };
