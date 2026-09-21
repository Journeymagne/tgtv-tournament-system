const { isIP } = require("node:net");

const SERVICE_PREFIXES = { initiative: "initiative", tracker: "tracker", tournament: "rating", studio: "studio" };

function buildSites(value) {
  if (!String(value || "").trim()) return null;
  let origin;
  try { origin = new URL(String(value).trim()); } catch { throw new Error("COMPANION_ORIGIN must be a complete HTTP(S) origin"); }
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash || isIP(origin.hostname) ||
      !origin.hostname.includes(".") || !/^[a-z0-9.-]+$/.test(origin.hostname)) {
    throw new Error("COMPANION_ORIGIN must name the parent domain, e.g. https://ktcompanion.ru or http://ktcompanion.localhost:3000");
  }
  const urls = { home: origin.origin + "/" };
  for (const [name, prefix] of Object.entries(SERVICE_PREFIXES)) {
    const service = new URL(origin);
    service.hostname = prefix + "." + origin.hostname;
    urls[name] = service.origin + "/";
  }
  return { domain: origin.hostname, urls };
}

module.exports = { buildSites };
