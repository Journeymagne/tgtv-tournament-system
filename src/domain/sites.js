const SERVICE_PATHS = { home: "/", tournament: "/tournament", initiative: "/initiative", tracker: "/tracker", studio: "/studio", dice: "/dice" };

function buildSites(value) {
  if (!String(value || "").trim()) return null;
  let origin;
  try { origin = new URL(String(value).trim()); } catch { throw new Error("COMPANION_ORIGIN must be a complete HTTP(S) origin"); }
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("COMPANION_ORIGIN must be a site origin, e.g. https://ktcompanion.ru or http://127.0.0.1:3000");
  }
  return { origin: origin.origin, urls: Object.fromEntries(Object.entries(SERVICE_PATHS).map(([name, pathname]) => [name, new URL(pathname, origin).href])) };
}

module.exports = { buildSites, SERVICE_PATHS };
