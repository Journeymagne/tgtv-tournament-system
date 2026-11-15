const { logError } = require('../http/logger');
function startLoop(name, tick, interval = 1000) {
  let stopped = false, running = null;
  const run = () => {
    if (stopped || running) return;
    running = Promise.resolve().then(tick).catch(error => logError(name, error)).finally(() => { running = null; });
  };
  const timer = setInterval(run, interval); timer.unref(); run();
  return async () => { stopped = true; clearInterval(timer); await running; };
}
module.exports = { startLoop };
