const crypto = require("node:crypto");
const { canManageTournament } = require("../domain/access");

const tournamentsRepo = require("../db/repositories/tournaments");
const { SECURITY_HEADERS } = require("./io");
const { siteOrigin } = require("./sites");
const { SERVICE_PATHS } = require("../domain/sites");

const dictionaries = {
  en: require("../../public/i18n/en"),
  ru: require("../../public/i18n/ru")
};

const SITE_NAME = "KT Companion";
const DEFAULT_DESCRIPTION =
  "Kill Team rankings, tournament standings, matchmaking, match results, and All Kill Team Challenge tracking.";
const ASSET_VERSION = "1.8.7.1";
const { version: SHARED_ASSET_VERSION } = require("./shared-assets.json");

function requestOrigin(req) {
  const serviceOrigin = siteOrigin(req);
  if (serviceOrigin) return serviceOrigin;
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

function tournamentFormatSummary(tournament, format, labels) {
  if (tournament.participantMode !== "team") return format;
  const pairing = {
    doubles: "doubles.name",
    wtc_doubles: "wtcDoubles.name",
    sword_shield_classic: "classic.name"
  }[tournament.pairingType] || "tournaments.pairingType.shieldSword";
  const size = ["doubles", "wtc_doubles"].includes(tournament.pairingType)
    ? "doubles.teamSize" : "tournaments.teamVariant.teamsOfThree";
  return [format, labels[size], labels[pairing]].join(" · ");
}

function eventStatusUrl(status) {
  if (status === "cancelled") return "https://schema.org/EventCancelled";
  return "https://schema.org/EventScheduled";
}

function jsonLdForTournament(origin, tournament) {
  const event = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: tournament.name || "Kill Team tournament",
    description: metaDescription(tournament.description || tournament.rulesSummary),
    url: tournamentPublicUrl(origin, tournament),
    eventStatus: eventStatusUrl(tournament.status),
    organizer: {
      "@type": "Organization",
      name: "KT Companion"
    },
    sport: "Warhammer 40k Kill Team"
  };
  if (tournament.startsAt) event.startDate = tournament.startsAt;
  return JSON.stringify(event).replace(/</g, "\\u003c");
}

function jsonLdForTournamentBreadcrumb(origin, tournament) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "KT Companion", item: `${origin}/` },
      { name: "Kill Team tournaments", item: `${origin}/tournament` },
      { name: tournament.name || "Kill Team tournament", item: tournamentPublicUrl(origin, tournament) }
    ].map((item, index) => ({ "@type": "ListItem", position: index + 1, ...item }))
  }).replace(/</g, "\\u003c");
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
    <script src="/theme-boot.js?v=${SHARED_ASSET_VERSION}"></script>
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="${escapeHtml(robots)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <link rel="icon" type="image/x-icon" href="/brand/kt-companion/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/brand/kt-companion/icon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/brand/kt-companion/apple-touch-icon.png">
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
    <link rel="stylesheet" href="/companion-tokens.css?v=${SHARED_ASSET_VERSION}">
    <link rel="stylesheet" href="/companion-tabs.css?v=${SHARED_ASSET_VERSION}">
    <link rel="stylesheet" href="/styles.css?v=${SHARED_ASSET_VERSION}">
    <link rel="stylesheet" href="/team-picker.css?v=${SHARED_ASSET_VERSION}">
    <script src="/team-picker.js?v=${SHARED_ASSET_VERSION}" defer></script>
    <link rel="stylesheet" href="/map-catalog-ui.css?v=${ASSET_VERSION}">
    <link rel="stylesheet" href="/tournament-results.css?v=${SHARED_ASSET_VERSION}">
    <link rel="stylesheet" href="/training/journey-shared.css?v=${SHARED_ASSET_VERSION}">
    <link rel="stylesheet" href="/companion-shell.css?v=${SHARED_ASSET_VERSION}">
    <script src="/companion-sites.js?v=${SHARED_ASSET_VERSION}" defer></script>
    <script src="/companion-i18n.js?v=${SHARED_ASSET_VERSION}" defer></script>
    <script src="/companion-shell.js?v=${SHARED_ASSET_VERSION}" defer></script>`;
}

// No locale dictionaries here: theme-boot.js in baseHead() writes a tag for the
// one the visitor is in, and app.js fetches the other only if they switch.
function appScript() {
  return ["maps/catalog-data.js", "map-catalog.js", "map-catalog-ui.js", "game-data.js", "i18n.js", "live-refresh.js", "pairing-warnings.js", "tournament-tables.js", "table-layout.js", "tournament-results.js", "training/journey-ui.js", "resource-quotas.js", "pairing-instructions.js", "app.js"]
    .map((file) => `<script src="/${file}?v=${['tournament-tables.js', 'tournament-results.js', 'table-layout.js'].includes(file) ? SHARED_ASSET_VERSION : ASSET_VERSION}" defer></script>`)
    .join("\n");
}

function tournamentHtml(origin, tournament, locale) {
  const labels = dictionaries[locale];
  const nonce = crypto.randomBytes(16).toString("base64");
  const url = tournamentPublicUrl(origin, tournament);
  const title = `${tournament.name || "Kill Team tournament"} | ${SITE_NAME}`;
  const description = metaDescription(tournament.description || tournament.rulesSummary);
  const imageUrl = `${origin}/brand/kt-companion/social.png`;
  const team = tournament.participantMode === "team";
  const formatKey = team ? "tournaments.participantMode.team" : {
    swiss: "tournaments.format.swiss", single_elimination: "tournaments.format.singleElimination"
  }[tournament.format];
  const format = labels[formatKey] || tournament.format || "";
  const statusKey = String(tournament.status || "").replace(/_(\w)/g, (_, char) => char.toUpperCase());
  const status = labels[`tournaments.status.${statusKey}`] || tournament.status || "";
  const facts = [
    [labels["tournaments.field.format"], format],
    [labels["stats.sort.status"], status],
    [labels["admin.tournament.field.gameSystem"], tournament.gameSystem || "Warhammer 40k Kill Team"],
    [labels["tournaments.card.rating"], labels[tournament.ratingPolicy === "ranked" ? "tournaments.card.ranked" : "tournaments.card.unranked"]]
  ];
  const starts = tournament.startsAt && new Date(tournament.startsAt);
  if (starts && Number.isFinite(starts.getTime())) {
    facts.splice(2, 0, [labels["tournaments.card.starts"], starts.toLocaleString(locale, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      hourCycle: "h23", timeZone: "UTC", timeZoneName: "short"
    })]);
  }
  if (tournament.registrationLimit) facts.push([labels[team ? "tournaments.rosterLimit" : "calendar.participantLimit"], tournament.registrationLimit]);
  return `<!doctype html>
<html lang="${locale}">
  <head>
    ${baseHead({ title, description, canonical: url, imageUrl, robots: tournament.status === "draft" ? "noindex, nofollow" : undefined })}
    <script type="application/ld+json" nonce="${escapeHtml(nonce)}">${jsonLdForTournament(origin, tournament)}</script>
    <script type="application/ld+json" nonce="${escapeHtml(nonce)}">${jsonLdForTournamentBreadcrumb(origin, tournament)}</script>
  </head>
  <body data-companion-section="tournament">
    <div data-companion-nav></div>
    <div id="app" class="app-shell">
      <main class="public-tournament-layout">

        <section class="card panel public-tournament-shell">
          <div class="panel-header public-tournament-header">
            <div>
              <p class="profile-label">${escapeHtml(tournamentFormatSummary(tournament, format, labels))}</p>
              <h1>${escapeHtml(tournament.name || "Kill Team tournament")}</h1>
              <p class="muted">${escapeHtml(status)}</p>
            </div>
          </div>
          ${textFromMarkdown(tournament.description || tournament.rulesSummary) ? `<p>${escapeHtml(description)}</p>` : ""}
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

function notFoundHtml(origin, slug, locale) {
  const heading = dictionaries[locale]["tournaments.notFound.title"];
  const title = `${heading} | ${SITE_NAME}`;
  const canonical = `${origin}/tournaments/${encodeURIComponent(slug || "")}`;
  const description = "This tournament page is not available.";
  return `<!doctype html>
<html lang="${locale}">
  <head>
    ${baseHead({
      title,
      description,
      canonical,
      imageUrl: `${origin}/brand/kt-companion/social.png`,
      robots: "noindex, follow"
    })}
  </head>
  <body data-companion-section="tournament">
    <div data-companion-nav></div>
    <div id="app" class="app-shell">
      <main class="public-tournament-layout">
        <section class="card panel public-tournament-shell">
          <h1>${escapeHtml(heading)}</h1>
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
    ...Object.values(SERVICE_PATHS).map((pathname) => ({ loc: `${origin}${pathname}`, lastmod: null })),
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
    const locale = /(?:^|;\s*)tgtv-locale=(en|ru)(?:;|$)/.exec(req.headers.cookie || "")?.[1] || "ru";
    const tournament = await withClient(async (client) => {
      const found = await tournamentsRepo.findBySlug(client, slug);
      if (!found || tournamentsRepo.PUBLISHED_STATUSES.includes(found.status)) return found;
      if (found.status !== "draft" || !req.headers.cookie) return null;
      try {
        const viewer = await require("../api/auth").loadUserFromRequest(client, req);
        return canManageTournament(viewer, found) ? found : null;
      } catch (err) {
        if (err.status === 403) return null;
        throw err;
      }
    });
    if (req.renewedSessionCookie) res.setHeader("Set-Cookie", req.renewedSessionCookie);
    if (!tournament) {
      sendHtml(res, 404, notFoundHtml(origin, slug, locale), {
        ...SECURITY_HEADERS,
        "Cache-Control": "no-store, max-age=0"
      });
      return true;
    }
    const html = tournamentHtml(origin, tournament, locale);
    const nonce = html.match(/nonce="([^"]+)"/)?.[1] || "";
    sendHtml(res, 200, html, {
      ...securityHeadersWithNonce(nonce),
      "Cache-Control": tournament.status === "draft" ? "private, no-store" : "no-store, max-age=0"
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
