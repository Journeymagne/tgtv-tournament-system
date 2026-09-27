// Privileged fixtures are explicit. Production registration always creates a player.
async function grantOwner(db, actor) {
  const http = actor.http || actor;
  const id = actor.id || (await http.get('/api/me')).body.user.id;
  await db.query('UPDATE users SET is_admin=TRUE WHERE id=$1',[id]);
  await db.query('INSERT INTO platform_ownership(owner_user_id) VALUES ($1)',[id]);
  actor.isAdmin=true;
  actor.isSuperAdmin=true;
}
module.exports={grantOwner};
