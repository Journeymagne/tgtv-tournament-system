// One place that knows how a player's avatar is addressed. Repositories build
// the URL as they map rows, so no layer above them ever sees the base64.
function avatarUrl(userId, version) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id < 1 || !version) return null;
  // Versioned, so the response can be cached hard and still change the moment a
  // player uploads a new picture.
  return `/api/users/${id}/avatar?v=${encodeURIComponent(version)}`;
}

module.exports = { avatarUrl };
