// Only the public profile fields needed by the shared account bar.
function session({ user }) {
  return { body: { user: user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl || null,
    rating: user.ratings?.combined ?? user.rating ?? null, isAdmin: user.isAdmin,
    isSuperAdmin: Boolean(user.isSuperAdmin), isFAQModerator: Boolean(user.isFAQModerator) } : null }, headers: { "Cache-Control": "no-store" } };
}
function profile({ user }) {
  return { body: { user: { id:user.id,name:user.name,registerNickname:user.registerNickname,
    telegramContact:user.telegramContact,avatarUrl:user.avatarUrl,isAdmin:user.isAdmin,isSuperAdmin:user.isSuperAdmin } },
    headers: { 'Cache-Control':'no-store' } };
}
module.exports = { session, profile };
