// Share one transaction boundary between delivery and inbox watermarks, even
// before a recipient has a notification_inbox_state row.
async function lockRecipient(client, userId) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['notification-inbox:' + userId]);
}

module.exports = { lockRecipient };
