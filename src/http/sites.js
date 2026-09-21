const { COMPANION_SITES } = require("../config");
const { SECURITY_HEADERS } = require("./io");

const FALLBACK_URLS = {
  home: "/", initiative: "/killteam-initiative-calculator.html",
  tracker: "/killteam-activation-tracker.html", tournament: "/tournament/", studio: "/studio/"
};
const ROOT_DOCUMENTS = {
  home: "home.html", initiative: "killteam-initiative-calculator.html",
  tracker: "killteam-activation-tracker.html", tournament: "index.html", studio: "studio/index.html"
};

function siteName(req, sites = COMPANION_SITES) {
  if (!sites) return null;
  const host = String(req.headers.host || "").toLowerCase();
  return Object.keys(sites.urls).find(name => new URL(sites.urls[name]).host === host) || null;
}

function siteOrigin(req, sites = COMPANION_SITES) {
  const name = siteName(req, sites);
  return name ? new URL(sites.urls[name]).origin : null;
}

function rootDocument(req, sites = COMPANION_SITES) {
  return ROOT_DOCUMENTS[siteName(req, sites) || "home"];
}

function pageDestination(req, sites = COMPANION_SITES) {
  if (!sites || !["GET", "HEAD"].includes(req.method)) return null;
  const url = new URL(req.url, "http://localhost");
  const aliases = {
    "/home.html": "home", "/index.html": "tournament", "/tournament": "tournament", "/tournament/": "tournament",
    "/studio": "studio", "/studio/": "studio", "/studio/index.html": "studio",
    "/killteam-initiative-calculator.html": "initiative", "/killteam-activation-tracker.html": "tracker"
  };
  let name = aliases[url.pathname], destination;
  if (name) destination = new URL(sites.urls[name]);
  else if (/^\/(tournaments|teams)\/[^/]+\/?$/.test(url.pathname)) {
    destination = new URL(url.pathname, sites.urls.tournament);
  } else if (url.pathname === "/") destination = new URL(sites.urls[siteName(req, sites) || "home"]);
  if (!destination) return null;
  destination.search = url.search;
  if (destination.host === String(req.headers.host || "").toLowerCase() && destination.pathname === url.pathname) return null;
  return destination.href;
}

function handleSiteRequest(req, res, sites = COMPANION_SITES) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/companion-sites.js" && ["GET", "HEAD"].includes(req.method)) {
    const config = { subdomains: !!sites, urls: sites?.urls || FALLBACK_URLS, current: siteName(req, sites) };
    const source = "window.KT_SITES = " + JSON.stringify(config) + ";\n";
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(source) });
    res.end(req.method === "HEAD" ? undefined : source);
    return true;
  }
  const destination = pageDestination(req, sites);
  if (!destination) return false;
  // Temporary redirects allow a local preview's hostname/port to change. The
  // browser carries any legacy hash over to the destination automatically.
  res.writeHead(302, { ...SECURITY_HEADERS, Location: destination, "Cache-Control": "no-store" });
  res.end();
  return true;
}

module.exports = { handleSiteRequest, rootDocument, siteName, siteOrigin, pageDestination };
