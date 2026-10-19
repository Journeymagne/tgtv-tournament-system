const { HttpError, ValidationError } = require("../http/io");
const notificationsRepo = require("../db/repositories/notifications");
const { toIso } = require("../db/rows");

async function list({ client, user }) {
  const { rows } = await client.query("SELECT NOW() AS generated_at");
  const lastSeenAt = await notificationsRepo.getLastSeenAt(client, user.id);
  const items = await notificationsRepo.listRecent(client, user.id);
  const generatedAt = toIso(rows[0].generated_at);
  return {
    generatedAt,
    lastSeenAt,
    unreadCount: items.filter((item) => item.unread).length,
    items
  };
}

async function markRead({ client, user, body }) {
  if (Object.hasOwn(body, "id")) {
    if (typeof body.id !== "string" || body.id.length > 100 ||
        !/^[a-z][a-z0-9_]*:[a-zA-Z0-9-]{1,64}$/.test(body.id)) {
      throw new ValidationError("Choose a valid notification");
    }
    const item = await notificationsRepo.markItemRead(client, user.id, body.id);
    if (!item) throw new HttpError(404, "Notification not found");
    return item;
  }
  const through = new Date(body.through);
  if (!body.through || Number.isNaN(through.getTime())) {
    throw new ValidationError("Choose a valid notification read time");
  }
  const lastSeenAt = await notificationsRepo.markReadThrough(client, user.id, through.toISOString());
  await notificationsRepo.markRememberedReadThrough(client, user.id, lastSeenAt);
  return { lastSeenAt };
}

module.exports = { list, markRead };
