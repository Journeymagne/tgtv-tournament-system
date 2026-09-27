// One-time owner assignment requested for the existing production account.
// ID 2 was checked against the public user directory; the profile also identifies
// Journey as @Journeymagne. Never grant ownership to a later registration by name.
module.exports = {
  version: 38,
  name: "journey_platform_owner",
  async up(client) {
    // Share the bootstrap CLI's lock, in addition to the migration runner lock.
    await client.query("SELECT pg_advisory_xact_lock(847362952)");
    const { rows: [journey] } = await client.query(`
      SELECT id, name_key, telegram_contact, is_admin FROM users
      WHERE id = 2 FOR UPDATE
    `);
    if (!journey || journey.name_key !== "journey"
      || String(journey.telegram_contact || "").trim().toLowerCase() !== "@journeymagne") {
      // Empty installations and unrelated databases remain usable. The migration
      // is still recorded, so registering this name later cannot claim ownership.
      // Like the migration runner, write structured status to stdout; CLI tools
      // reserve stderr for the operation's actual failure message.
      console.log(JSON.stringify({ level: "warn", version: 38,
        msg: "Journey owner assignment skipped: expected account ID 2, name Journey and Telegram @Journeymagne were not found" }));
      return;
    }

    const { rows: [previous] } = await client.query(
      "SELECT owner_user_id FROM platform_ownership WHERE singleton FOR UPDATE"
    );
    if (previous?.owner_user_id === journey.id && journey.is_admin) return;

    await client.query("UPDATE users SET is_admin=TRUE, updated_at=NOW() WHERE id=$1 AND NOT is_admin", [journey.id]);
    // The singleton constraint permits exactly one owner. Other platform
    // administrators retain their ordinary administrator role.
    await client.query(`INSERT INTO platform_ownership (singleton, owner_user_id)
      VALUES (TRUE, $1) ON CONFLICT (singleton) DO UPDATE
      SET owner_user_id=EXCLUDED.owner_user_id, updated_at=NOW()`, [journey.id]);
    await client.query(`INSERT INTO administrative_audit_events
      (actor_name, event_type, entity_type, entity_id, before, after, reason)
      VALUES ($1, $2, 'user', $3, $4, $5, $6)`, [
      "Release 4.9.3 migration", "platform_owner_changed", journey.id,
      JSON.stringify({ ownerUserId: previous?.owner_user_id || null, targetIsAdmin: journey.is_admin }),
      JSON.stringify({ ownerUserId: journey.id, targetIsAdmin: true }),
      "Assign Journey (@Journeymagne, user ID 2) as the sole platform super administrator at the owner's request"
    ]);
  }
};
