async function deliverNotifications() {
  await require('../../src/notifications/tournament-worker').tick();
  await require('../../src/notifications/worker').tick();
}
module.exports = { deliverNotifications };
