const { HttpError } = require("../http/io");
const usersRepo = require("../db/repositories/users");
const feedbackRepo = require("../db/repositories/feedback");
const { requiredProfileText } = require("../domain/validation");
const { feedbackView } = require("./views");
const { requirePositiveIntId } = require("./params");

async function create({ client, user, body }) {
  const screen = requiredProfileText(body.screen, "Screen", 80);
  const description = requiredProfileText(body.description, "Description", 1200);

  const item = await feedbackRepo.insert(client, { userId: user.id, screen, description });
  const people = await usersRepo.findByIds(client, [user.id]);

  return { status: 201, body: { feedback: feedbackView(item, people) } };
}

async function list({ client }) {
  const items = await feedbackRepo.listAll(client);
  const ids = new Set();
  for (const item of items) {
    if (item.userId) ids.add(item.userId);
    if (item.resolvedBy) ids.add(item.resolvedBy);
  }
  const people = await usersRepo.findByIds(client, [...ids]);
  return { feedback: items.map((item) => feedbackView(item, people)) };
}

async function requireItem(client, id) {
  // Old server.js matched this route with /^\/api\/admin\/feedback\/(\d+)$/, so a
  // non-numeric id never reached the handler at all -- it fell through to the
  // generic 404 "Route not found". The new router matches on segment count, not
  // digits, so guard here instead of letting NaN reach the query as 22P02.
  const feedbackId = requirePositiveIntId(id, 404, "Route not found");
  const existing = await feedbackRepo.findById(client, feedbackId);
  if (!existing) throw new HttpError(404, "Feedback not found");
  return existing;
}

async function updateStatus({ client, user, params, body }) {
  const existing = await requireItem(client, params.id);
  const status = body.status === "resolved" ? "resolved" : "open";
  const updated = await feedbackRepo.setStatus(client, existing.id, status, user.id);
  const people = await usersRepo.findByIds(
    client,
    [updated.userId, updated.resolvedBy].filter(Boolean)
  );
  return { feedback: feedbackView(updated, people) };
}

async function remove({ client, params }) {
  const existing = await requireItem(client, params.id);
  await feedbackRepo.remove(client, existing.id);
  return { ok: true };
}

module.exports = { create, list, updateStatus, remove };
