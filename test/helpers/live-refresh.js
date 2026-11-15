const { createController } = require("../../public/live-refresh");

function liveHarness(options = {}) {
  const timers = new Map();
  const events = {};
  const renders = [];
  const requests = [];
  let id = 0;
  const h = {
    current: { key: "tournament:1", anchor: {}, interval: 5000, url: "/api/tournaments/1", snapshot: 1, project: (data) => data },
    blocked: false, response: 2,
    document: { visibilityState: "visible", addEventListener: (type, handler) => { events[type] = handler; } },
    timers, events, renders, requests
  };
  h.controller = createController({
    target: () => h.current,
    fetch: async (target) => { requests.push(target.url); return options.fetch ? options.fetch(target) : h.response; },
    apply: (target, data) => { renders.push(data); target.snapshot = data; options.apply?.(target, data); },
    blocked: () => h.blocked,
    window: {
      setTimeout: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
      clearTimeout: (timer) => timers.delete(timer),
      addEventListener: (type, handler) => { events[type] = handler; }
    },
    document: h.document
  });
  h.tick = async () => {
    const [timer, entry] = timers.entries().next().value;
    timers.delete(timer);
    await entry.callback();
  };
  return h;
}
module.exports = { liveHarness };
