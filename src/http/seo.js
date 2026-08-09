const crypto = require("node:crypto");

const tournamentsRepo = require("../db/repositories/tournaments");
const { SECURITY_HEADERS } = require("./io");

const SITE_NAME = "TGTV Ranking Tournament System";
const DEFAULT_DESCRIPTION =
  "Kill Team rankings, tournament standings, matchmaking, match results, and All Kill Team Challenge tracking.";
const ASSET_VERSION = "20260808-seo";

function requestOrigin(req) {
  const configured = String(process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[^/]+$/i.test(configured)) return configured;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || req.headers.host || "localhost";
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const proto = ["http", "https"].includes(forwardedProto)
    ? forwardedProto
    : req.socket?.encrypted
      ? "https"
      : isLocalHost
        ? "http"
        : "https";
  return `${proto}://${host}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function textFromMarkdown(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaDescription(value) {
  const text = textFromMarkdown(value);
  if (!text) return DEFAULT_DESCRIPTION;
  return text.length > 155 ? `${text.slice(0, 152).trim()}...` : text;
}

function tournamentPublicUrl(origin, tournament) {
  return `${origin}/tournaments/${encodeURIComponent(tournament.slug || "")}`;
}

function tournamentStatusLabel(status) {
  const labels = {
    draft: "Draft",
    registration_open: "Registration open",
    registration_closed: "Registration closed",
    in_progress: "In progress",
    completed: "Completed",
    cancelled: "Cancelled"
  };
  return labels[status] || status || "";
}

function formatLabel(format) {
  return format === "single_elimination" ? "Single elimination" : format === "swiss" ? "Swiss" : format || "";
}

function eventStatusUrl(status) {
  if (status === "cancelled") return "https://schema.org/EventCancelled";
  if (status === "completed") return "https://schema.org/EventCompleted";
  return "https://schema.org/EventScheduled";
}

function jsonLdForTournament(origin, tournament) {
  const event = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: tournament.name || "Kill Team tournament",
    description: metaDescription(tournament.description || tournament.rulesSummary),
    url: tournamentPublicUrl(origin, tournament),
    eventStatus: eventStatusUrl(tournament.status),
    organizer: {
      "@type": "Organization",
      name: "TGTV Ranking"
    },
    sport: "Warhammer 40k Kill Team"
  };
  if (tournament.startsAt) event.startDate = tournament.startsAt;
  return JSON.stringify(event).replace(/</g, "\\u003c");
}

function securityHeadersWithNonce(nonce) {
  const headers = { ...SECURITY_HEADERS };
  headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace(
    "script-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`
  );
  return headers;
}

function sendHtml(res, status, html, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    ...headers
  });
  res.end(html);
}

function sendText(res, status, text, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...SECURITY_HEADERS,
    ...headers
  });
  res.end(text);
}

function sendXml(res, status, xml, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "application/xml; charset=utf-8",
    "Content-Length": Buffer.byteLength(xml),
    ...SECURITY_HEADERS,
    ...headers
  });
  res.end(xml);
}

function tournamentSlugFromPath(pathname) {
  const match = String(pathname || "").match(/^\/tournaments\/([^/?#]+)\/?$/);
  if (!match) return "";
  try {
    const slug = decodeURIComponent(match[1]);
    return slug === "admin" ? "" : slug;
  } catch {
    return "";
  }
}

function baseHead({ title, description, canonical, imageUrl, robots = "index, follow" }) {
  return `
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="${escapeHtml(robots)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <link rel="icon" type="image/png" href="/logo.png?v=20260808-favicon">
    <link rel="apple-touch-icon" href="/logo.png?v=20260808-favicon">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}">`;
}

function appScript() {
  return `<script src="/app.js?v=${ASSET_VERSION}" defer></script>`;
}

function tournamentHtml(origin, tournament) {
  const nonce = crypto.randomBytes(16).toString("base64");
  const url = tournamentPublicUrl(origin, tournament);
  const title = `${tournament.name || "Kill Team tournament"} | ${SITE_NAME}`;
  const description = metaDescription(tournament.description || tournament.rulesSummary);
  const imageUrl = `${origin}/logo.png`;
  const facts = [
    ["Format", formatLabel(tournament.format)],
    ["Status", tournamentStatusLabel(tournament.status)],
    ["Game system", tournament.gameSystem || "Warhammer 40k Kill Team"],
    ["Rating", tournament.ratingPolicy === "ranked" ? "Ranked" : "Unranked"]
  ];
  if (tournament.startsAt) facts.splice(2, 0, ["Starts", new Date(tournament.startsAt).toISOString()]);
  return `<!doctype html>
<html lang="en">
  <head>
    ${baseHead({ title, description, canonical: url, imageUrl })}
    <script type="application/ld+json" nonce="${escapeHtml(nonce)}">${jsonLdForTournament(origin, tournament)}</script>
  </head>
  <body>
    <div id="app" class="app-shell">
      <main class="public-tournament-layout">
        <section class="card panel public-tournament-shell">
          <div class="panel-header public-tournament-header">
            <div>
              <p class="profile-label">${escapeHtml(formatLabel(tournament.format))}</p>
              <h1>${escapeHtml(tournament.name || "Kill Team tournament")}</h1>
              <p class="muted">${escapeHtml(tournamentStatusLabel(tournament.status))}</p>
            </div>
          </div>
          <p>${escapeHtml(description)}</p>
          <dl class="tournament-card-facts">
            ${facts.map(([label, value]) => `
              <div>
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(value)}</dd>
              </div>
            `).join("")}
          </dl>
        </section>
      </main>
    </div>
    ${appScript()}
  </body>
</html>`;
}

function notFoundHtml(origin, slug) {
  const title = `Tournament not found | ${SITE_NAME}`;
  const canonical = `${origin}/tournaments/${encodeURIComponent(slug || "")}`;
  const description = "This tournament page is not available.";
  return `<!doctype html>
<html lang="en">
  <head>
    ${baseHead({
      title,
      description,
      canonical,
      imageUrl: `${origin}/logo.png`,
      robots: "noindex, follow"
    })}
  </head>
  <body>
    <div id="app" class="app-shell">
      <main class="public-tournament-layout">
        <section class="card panel public-tournament-shell">
          <h1>Tournament not found</h1>
          <p>${escapeHtml(description)}</p>
        </section>
      </main>
    </div>
    ${appScript()}
  </body>
</html>`;
}

function robotsTxt(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    ""
  ].join("\n");
}

function sitemapXml(origin, tournaments) {
  const urls = [
    { loc: `${origin}/`, lastmod: null },
    ...tournaments.map((tournament) => ({
      loc: tournamentPublicUrl(origin, tournament),
      lastmod: tournament.completedAt || tournament.publishedAt || tournament.createdAt || null
    }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>${item.lastmod ? `
    <lastmod>${escapeXml(new Date(item.lastmod).toISOString())}</lastmod>` : ""}
  </url>`).join("\n")}
</urlset>
`;
}

async function handleSeoRequest(req, res, { withClient }) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const origin = requestOrigin(req);

  if (url.pathname === "/robots.txt") {
    sendText(res, 200, robotsTxt(origin), { "Cache-Control": "public, max-age=3600" });
    return true;
  }

  if (url.pathname === "/sitemap.xml") {
    const tournaments = await withClient((client) => tournamentsRepo.listPublished(client));
    sendXml(res, 200, sitemapXml(origin, tournaments), { "Cache-Control": "public, max-age=300" });
    return true;
  }

  const slug = tournamentSlugFromPath(url.pathname);
  if (slug) {
    const tournament = await withClient((client) => tournamentsRepo.findBySlug(client, slug));
    if (!tournament || !tournamentsRepo.PUBLISHED_STATUSES.includes(tournament.status)) {
      sendHtml(res, 404, notFoundHtml(origin, slug), {
        ...SECURITY_HEADERS,
        "Cache-Control": "no-store, max-age=0"
      });
      return true;
    }
    const html = tournamentHtml(origin, tournament);
    const nonce = html.match(/nonce="([^"]+)"/)?.[1] || "";
    sendHtml(res, 200, html, {
      ...securityHeadersWithNonce(nonce),
      "Cache-Control": "no-store, max-age=0"
    });
    return true;
  }

  return false;
}

module.exports = {
  handleSeoRequest,
  metaDescription,
  robotsTxt,
  sitemapXml,
  tournamentPublicUrl,
  tournamentSlugFromPath
};
