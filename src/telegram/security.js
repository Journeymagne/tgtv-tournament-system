const crypto = require("node:crypto");
const { HttpError, sessionToken } = require("../http/io");
const { siteOrigin } = require("../http/sites");
const { COOKIE_SECURE } = require("../config");

const hash = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const csrfToken = req => hash("kt-telegram-csrf:" + sessionToken(req));
function equal(a, b) {
  const aa = Buffer.from(String(a || "")), bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function authorize(ctx) {
  if (ctx.req.headers["x-telegram-account"] !== String(ctx.user.id)) throw new HttpError(401, "Аккаунт изменился. Обновите страницу.");
  if (!equal(ctx.req.headers["x-csrf-token"], csrfToken(ctx.req))) throw new HttpError(403, "Обновите страницу перед изменением настроек.");
  const origin = siteOrigin(ctx.req) || process.env.SITE_URL || `${COOKIE_SECURE || ctx.req.socket?.encrypted ? "https" : "http"}://${ctx.req.headers.host}`;
  if (ctx.req.headers.origin && ctx.req.headers.origin !== origin.replace(/\/+$/, "")) throw new HttpError(403, "Invalid origin");
  if (!ctx.body || typeof ctx.body !== "object" || Array.isArray(ctx.body)) throw new HttpError(400, "Invalid request body");
}
module.exports = { hash, csrfToken, equal, authorize };
