const { ValidationError } = require("../http/io");
const notificationsRepo = require("../db/repositories/notifications");
const { toIso } = require("../db/rows");

async function list({ client, user }) {
  const { rows } = await client.query("SELECT NOW() AS generated_at");
  const lastSeenAt = await notificationsRepo.getLastSeenAt(client, user.id);
  const items = await notificationsRepo.listActive(client, user.id);
  const generatedAt = toIso(rows[0].generated_at);
  const withReadState = items.map((item) => ({
    ...item,
    unread: !lastSeenAt || item.createdAt > lastSeenAt
  }));
  return {
    generatedAt,
    lastSeenAt,
    unreadCount: withReadState.filter((item) => item.unread).length,
    items: withReadState
  };
}

async function markRead({ client, user, body }) {
  const through = new Date(body.through);
  if (!body.through || Number.isNaN(through.getTime())) {
    throw new ValidationError("Choose a valid notification read time");
  }
  const lastSeenAt = await notificationsRepo.markReadThrough(client, user.id, through.toISOString());
  return { lastSeenAt };
}

module.exports = { list, markRead };
