// The common navigation needs only identity, not the full games dashboard.
function session({ user }) {
  return { body: { user: user ? { id: user.id, name: user.name, isAdmin: user.isAdmin,
    isSuperAdmin: Boolean(user.isSuperAdmin), isFAQModerator: Boolean(user.isFAQModerator) } : null }, headers: { "Cache-Control": "no-store" } };
}
function profile({ user }) {
  return { body: { user: { id:user.id,name:user.name,registerNickname:user.registerNickname,
    telegramContact:user.telegramContact,avatarUrl:user.avatarUrl,isAdmin:user.isAdmin,isSuperAdmin:user.isSuperAdmin } },
    headers: { 'Cache-Control':'no-store' } };
}
module.exports = { session, profile };
