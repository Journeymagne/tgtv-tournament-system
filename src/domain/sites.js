const SERVICE_PATHS = { home: "/", tournament: "/tournament", initiative: "/initiative", tracker: "/tracker", studio: "/studio", dice: "/dice", faq: "/faq", combat: "/combat", training: "/knowthykt", tierlist: "/tierlist" };

function parseOrigin(value) {
  let origin;
  try { origin = new URL(String(value).trim()); } catch { throw new Error("COMPANION_ORIGIN must be a complete HTTP(S) origin"); }
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("COMPANION_ORIGIN must be a site origin, e.g. https://ktcompanion.ru or http://127.0.0.1:3000");
  }
  return origin.origin;
}

function buildSites(value, aliases = "") {
  if (!String(value || "").trim()) {
    if (String(aliases || "").trim()) throw new Error("COMPANION_ALIASES requires COMPANION_ORIGIN");
    return null;
  }
  const origin = parseOrigin(value);
  const origins = [...new Set([origin, ...String(aliases || "").split(/[\s,]+/).filter(Boolean).map(parseOrigin)])];
  if (new Set(origins.map(value => new URL(value).host)).size !== origins.length) {
    throw new Error("Companion origins must use distinct hosts");
  }
  return { origin, origins, urls: Object.fromEntries(Object.entries(SERVICE_PATHS).map(([name, pathname]) => [name, new URL(pathname, origin).href])) };
}

module.exports = { buildSites, SERVICE_PATHS };
