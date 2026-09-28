const { HttpError } = require("../http/io");
const { checkWrite } = require("./studio");
const store = require("../db/repositories/studio-reviews");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ids(ctx) {
  for (const key of ["id","reviewId","commentId","reportId"]) if(ctx.params[key] && !UUID.test(ctx.params[key])) throw new HttpError(404,"Объект не найден.");
}
function cursor(ctx) {
  const value=ctx.query.get("cursor");
  if(!value) return null;
  try {
    if(value.length>200) throw Error();
    const parsed=JSON.parse(Buffer.from(value,"base64url").toString());
    if(!Array.isArray(parsed)||parsed.length!==2||typeof parsed[0]!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(parsed[0])||!Number.isFinite(Date.parse(parsed[0]))||!UUID.test(parsed[1])) throw Error();
    return parsed;
  } catch { throw new HttpError(400,"Некорректная страница."); }
}
function revision(body) {
  if(!Number.isSafeInteger(body.revision)||body.revision<1) throw new HttpError(400,"Некорректная ревизия.");
}
function text(value,max) {
  if(typeof value!=="string"||!value.trim()||value.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new HttpError(400,"Проверьте текст и его длину.");
  return value.trim();
}
function review(body) {
  const result={...body,body:text(body.body,5000)};
  for(const key of ["themeScore","balanceScore","loreScore"]) if(!Number.isInteger(body[key])||body[key]<1||body[key]>5) throw new HttpError(400,"Выберите целую оценку от 1 до 5 в каждой категории.");
  if(body.reevaluate!==undefined&&typeof body.reevaluate!=="boolean") throw new HttpError(400,"Некорректный выбор версии.");
  if(body.versionLabel!==undefined&&(typeof body.versionLabel!=="string"||body.versionLabel.length>100))throw new HttpError(400,"Некорректная версия команды.");
  return result;
}
const read = fn => async ctx => { ids(ctx); return {body:await fn(ctx),headers:{"Cache-Control":"no-store"}}; };
const write = fn => async ctx => { ids(ctx); checkWrite(ctx); return fn(ctx); };
module.exports={
  validation:{UUID,cursor,revision,text,read,write},
  list:read(ctx=>store.list(ctx.client,ctx.params.id,ctx.user,cursor(ctx))),
  get:read(ctx=>store.get(ctx.client,ctx.params.id,ctx.params.reviewId,ctx.user)),
  create:write(ctx=>{const input=review(ctx.body);if(!UUID.test(input.clientRequestId||""))throw new HttpError(400,"Некорректный идентификатор запроса.");return store.create(ctx.client,ctx.params.id,ctx.user,input)}),
  update:write(ctx=>{revision(ctx.body);return store.change(ctx.client,ctx.params.id,ctx.params.reviewId,ctx.user,review(ctx.body))}),
  remove:write(ctx=>{revision(ctx.body);return store.change(ctx.client,ctx.params.id,ctx.params.reviewId,ctx.user,ctx.body,true)}),
  report:write(ctx=>{if(!["spam","abuse","other"].includes(ctx.body.reason)||typeof ctx.body.details!=="string"||ctx.body.details.length>500)throw new HttpError(400,"Проверьте причину жалобы.");return store.report(ctx.client,ctx.params.id,ctx.params.reviewId,ctx.user,ctx.body)}),
  adminList:read(ctx=>store.adminList(ctx.client,ctx.params.id,ctx.user,cursor(ctx))),
  reports:read(ctx=>store.reports(ctx.client,cursor(ctx))),
  history:read(ctx=>store.history(ctx.client,ctx.params.id,ctx.params.reviewId)),
  moderate:write(ctx=>{revision(ctx.body);if(typeof ctx.body.hidden!=="boolean")throw new HttpError(400,"Некорректное действие.");return store.moderate(ctx.client,ctx.params.id,ctx.params.reviewId,ctx.user,{...ctx.body,reason:text(ctx.body.reason,500)})}),
  resolve:write(ctx=>store.resolve(ctx.client,ctx.params.reportId,ctx.user,text(ctx.body.reason,500))),
  lock:write(ctx=>{if(typeof ctx.body.locked!=="boolean")throw new HttpError(400,"Некорректное действие.");return store.lock(ctx.client,ctx.params.id,ctx.user,{...ctx.body,reason:text(ctx.body.reason,500)})}),
  preferences:read(ctx=>store.preferences(ctx.client,ctx.user)),
  updatePreferences:write(ctx=>{if(typeof ctx.body.notifications!=="boolean")throw new HttpError(400,"Некорректная настройка.");return store.preferences(ctx.client,ctx.user,ctx.body.notifications)})
};
