const { COMPANION_SITES } = require("../config");
const { SERVICE_PATHS } = require("../domain/sites");
const { SECURITY_HEADERS } = require("./io");

const ROOT_DOCUMENTS = {
  home: "home.html", initiative: "killteam-initiative-calculator.html",
  tracker: "killteam-activation-tracker.html", tournament: "index.html", studio: "studio/index.html"
};
const ALIASES = {
  "/home.html": "home", "/index.html": "tournament", "/tournament/": "tournament",
  "/studio/": "studio", "/studio/index.html": "studio", "/initiative/": "initiative", "/tracker/": "tracker",
  "/killteam-initiative-calculator.html": "initiative", "/killteam-activation-tracker.html": "tracker"
};

function siteName(req) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (ALIASES[pathname]) return ALIASES[pathname];
  if (/^\/(tournaments|teams)\/[^/]+\/?$/.test(pathname)) return "tournament";
  return Object.keys(SERVICE_PATHS).find(name => SERVICE_PATHS[name] === pathname) || null;
}

function siteOrigin(req, sites = COMPANION_SITES) {
  return sites && new URL(sites.origin).host === String(req.headers.host || "").toLowerCase() ? sites.origin : null;
}

function rootDocument(req) {
  return ROOT_DOCUMENTS[siteName(req) || "home"];
}

function pageDestination(req, sites = COMPANION_SITES) {
  if (!["GET", "HEAD"].includes(req.method)) return null;
  const url = new URL(req.url, "http://localhost");
  const name = siteName(req);
  if (!name) return null;
  let pathname = ALIASES[url.pathname] ? SERVICE_PATHS[name] : url.pathname;
  // Keep old service-host bookmarks working when they reach this application.
  if (sites && url.pathname === "/") {
    const canonical = new URL(sites.origin);
    const host = String(req.headers.host || "").toLowerCase();
    for (const [prefix, service] of Object.entries({ rating: "tournament", initiative: "initiative", tracker: "tracker", studio: "studio" })) {
      if (host === prefix + "." + canonical.host) pathname = SERVICE_PATHS[service];
    }
  }
  const target = pathname + url.search;
  if (sites && new URL(sites.origin).host !== String(req.headers.host || "").toLowerCase()) return new URL(target, sites.origin).href;
  return pathname === url.pathname ? null : target;
}

function handleSiteRequest(req, res, sites = COMPANION_SITES) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/companion-sites.js" && ["GET", "HEAD"].includes(req.method)) {
    const config = { subdomains: false, urls: sites?.urls || SERVICE_PATHS };
    const source = "window.KT_SITES = " + JSON.stringify(config) + ";\n";
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(source) });
    res.end(req.method === "HEAD" ? undefined : source);
    return true;
  }
  const destination = pageDestination(req, sites);
  if (!destination) return false;
  // Browsers carry any legacy fragment to the destination automatically.
  res.writeHead(302, { ...SECURITY_HEADERS, Location: destination, "Cache-Control": "no-store" });
  res.end();
  return true;
}

module.exports = { handleSiteRequest, rootDocument, siteName, siteOrigin, pageDestination };
