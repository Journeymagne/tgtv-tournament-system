const { HttpError } = require("../http/io");
const { siteOrigin } = require("../http/sites");
const { COOKIE_SECURE } = require("../config");
const { checkWrite, checkAccount } = require("./studio");
const { validatePack } = require("../domain/studio-tts-pack");
const { buildObject, importer } = require("../domain/studio-tts-object");
const store = require("../db/repositories/studio-tts");
const { tokenMesh } = require("../domain/studio-tts-mesh");
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const noStore = {"Cache-Control":"no-store", "X-Robots-Tag":"noindex, nofollow"};

function origin(req) {
  const value = process.env.COMPANION_ORIGIN || process.env.SITE_URL || siteOrigin(req) || `${COOKIE_SECURE || req.socket?.encrypted ? "https" : "http"}://${req.headers.host}`;
  const url = new URL(value);
  if (!["http:","https:"].includes(url.protocol) || url.username || url.password) throw new HttpError(400, "Некорректный адрес сайта.");
  return url.origin;
}
function validId(ctx) { if (!ID.test(ctx.params.id)) throw new HttpError(404, "Набор TTS не найден."); return ctx.params.id; }
function entry(row, base) { return {id:row.id,name:row.name,createdAt:row.created_at,byteSize:row.byte_size,cards:row.cards,tokens:row.tokens,url:`${base}/api/studio/tts/exports/${row.id}/manifest`}; }

async function create(ctx) {
  checkWrite(ctx);
  const pack = validatePack(ctx.body);
  const row = await store.create(ctx.client,ctx.user.id,pack);
  return {body:entry({...row,cards:pack.manifest.cards.length,tokens:pack.manifest.tokens.length},origin(ctx.req)),headers:noStore};
}
async function list(ctx) {
  checkAccount(ctx);
  const project = ctx.query.get("project");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(project || "")) throw new HttpError(400,"Некорректный идентификатор команды.");
  return {body:{exports:(await store.list(ctx.client,ctx.user.id,project)).map(row=>entry(row,origin(ctx.req)))},headers:noStore};
}
async function remove(ctx) {
  checkWrite(ctx); await store.remove(ctx.client,ctx.user.id,validId(ctx));
  return {body:{deleted:true},headers:noStore};
}
async function manifest(ctx) {
  const id = validId(ctx), data = await store.manifest(ctx.client,id);
  if (!data) throw new HttpError(404,"Набор TTS удалён или не найден.");
  return {body:{format:"kt-studio-tts-v1",teamName:data.team.name,cardCount:data.cards.length,tokenCount:data.tokens.length,
    object:buildObject(data,`${origin(ctx.req)}/api/studio/tts/exports/${id}/assets/`)},headers:noStore};
}
async function asset(ctx) {
  const id = validId(ctx);
  if (/^[a-z0-9-]{1,80}\.obj$/.test(ctx.params.name)) {
    const data = await store.manifest(ctx.client,id);
    const token = data?.tokens.find(item=>item.image.replace(/\.png$/, ".obj")===ctx.params.name);
    if (!token) throw new HttpError(404,"Модель жетона не найдена.");
    return {buffer:Buffer.from(tokenMesh(token.shape)),contentType:"text/plain; charset=utf-8",headers:noStore};
  }
  if (!/^[a-z0-9-]{1,80}\.png$/.test(ctx.params.name)) throw new HttpError(404,"Изображение не найдено.");
  const file = await store.asset(ctx.client,id,ctx.params.name);
  if (!file) throw new HttpError(404,"Изображение не найдено.");
  const etag = `"${file.hash}"`;
  return {buffer:file.bytes,contentType:"image/png",status:ctx.req.headers["if-none-match"]===etag?304:200,
    headers:{"Cache-Control":"no-cache",ETag:etag,"X-Robots-Tag":"noindex, nofollow"}};
}
async function downloadObject(ctx) {
  const id = validId(ctx), data = await store.manifest(ctx.client,id);
  if (!data) throw new HttpError(404,"Набор TTS удалён или не найден.");
  const bag = buildObject(data,`${origin(ctx.req)}/api/studio/tts/exports/${id}/assets/`);
  const object = data.dice?.length && !data.cards.length && !data.tokens.length && bag.ContainedObjects.length === 1 ? bag.ContainedObjects[0] : bag;
  return {buffer:Buffer.from(JSON.stringify({ObjectStates:[object]})),contentType:"application/json",
    headers:{...noStore,"Content-Disposition":'attachment; filename="KT-Companion-Object.json"'}};
}
function downloadImporter(ctx) {
  const lua = ctx.req.url.split("?")[0].endsWith(".lua");
  const content = importer(origin(ctx.req),lua);
  return {buffer:Buffer.from(lua?content:JSON.stringify(content)),contentType:lua?"text/plain; charset=utf-8":"application/json",
    headers:{...noStore,"Content-Disposition":`attachment; filename="KT-Studio-Importer.${lua?"lua":"json"}"`}};
}
module.exports = {create,list,remove,manifest,asset,downloadImporter,downloadObject,MAX_BODY:96*1024*1024};
