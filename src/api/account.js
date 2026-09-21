// The common navigation needs only identity, not the full games dashboard.
function session({ user }) {
  return { body: { user: user ? { id: user.id, name: user.name, isAdmin: user.isAdmin } : null }, headers: { "Cache-Control": "no-store" } };
}
module.exports = { session };
