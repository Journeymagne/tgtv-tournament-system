const { HttpError, readBody, sendJson } = require("./io");
const { logRequest, logError } = require("./logger");
const { createRateLimiter } = require("./rate-limit");
const { LOGIN_RATE_LIMIT } = require("../config");

// Module-level singleton by default (one counter per process, see
// rate-limit.js). createRouter accepts an override through deps.authLimiter
// so callers that need an isolated instance - e.g. tests that drive many
// auth requests through the real router - can inject one instead of reaching
// into this module's internals. Every production call site (server.js)
// passes nothing extra and keeps getting this shared instance.
const defaultAuthLimiter = createRateLimiter(LOGIN_RATE_LIMIT);

// Behind a reverse proxy, remoteAddress is the proxy's address, not the
// client's. X-Forwarded-For is deliberately not consulted: trusting that
// header without a configured list of trusted proxies would let any client
// spoof its address and bypass the limit entirely, which is worse than not
// limiting at all.
function clientKey(req) {
  return req.socket?.remoteAddress || null;
}

function normalizeApiPath(pathname) {
  let normalized = pathname || "/";
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function segmentsOf(path) {
  return path.split("/").filter(Boolean);
}

function matchSegments(routeSegments, pathSegments) {
  if (routeSegments.length !== pathSegments.length) return null;
  const params = {};
  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index];
    const pathSegment = pathSegments[index];
    if (routeSegment.startsWith(":")) {
      // A malformed percent-encoding (e.g. "%zz") is bad client input, not
      // a server fault: treat it as no-match so the request falls through
      // to the normal 404 instead of throwing inside the router's try block.
      let decoded;
      try {
        decoded = decodeURIComponent(pathSegment);
      } catch {
        return null;
      }
      params[routeSegment.slice(1)] = decoded;
      continue;
    }
    if (routeSegment !== pathSegment) return null;
  }
  return params;
}

function dynamicCount(path) {
  return segmentsOf(path).filter((segment) => segment.startsWith(":")).length;
}

// Orders routes so the more specific one wins a match. Fewer dynamic
// segments wins first; if that ties, break it by positional specificity
// (leftmost differing segment) rather than declaration order, so route
// table order never silently decides which endpoint handles a request.
function compareSpecificity(a, b) {
  const countDiff = dynamicCount(a.path) - dynamicCount(b.path);
  if (countDiff !== 0) return countDiff;

  const segsA = segmentsOf(a.path);
  const segsB = segmentsOf(b.path);
  const len = Math.min(segsA.length, segsB.length);
  for (let index = 0; index < len; index += 1) {
    const aDynamic = segsA[index].startsWith(":");
    const bDynamic = segsB[index].startsWith(":");
    if (aDynamic !== bDynamic) return aDynamic ? 1 : -1;
  }
  return 0;
}

function matchRoute(routes, method, pathname) {
  const pathSegments = segmentsOf(pathname);
  const candidates = routes
    .filter((route) => route.method === method)
    .sort(compareSpecificity);

  for (const route of candidates) {
    const params = matchSegments(segmentsOf(route.path), pathSegments);
    if (params) return { route, params };
  }
  return null;
}

const METHODS_WITH_BODY = new Set(["POST", "PATCH", "PUT"]);

function createRouter(routes, deps) {
  const { withClient, withTransaction, loadUser, authLimiter = defaultAuthLimiter } = deps;

  async function runRoute(route, params, req, url) {
    // Checked before any connection is acquired: a request the limiter is
    // about to reject must not cost a pool checkout or a BEGIN/ROLLBACK
    // round trip (that cost is exactly what the limiter exists to prevent
    // under a burst).
    if (route.rateLimit === "auth") authLimiter.check(clientKey(req));

    const runner = route.tx ? withTransaction : withClient;
    return runner(async (client) => {
      const auth = route.auth || "none";
      let user = null;

      if (auth !== "none") {
        user = await loadUser(client, req);
        if (!user) throw new HttpError(401, "You need to sign in");
        if (auth === "admin" && !user.isAdmin) {
          throw new HttpError(403, "Administrator rights required");
        }
      } else if (route.loadUser) {
        user = await loadUser(client, req);
      }

      const body = METHODS_WITH_BODY.has(route.method) ? await readBody(req) : {};

      return route.handler({
        params,
        query: url.searchParams,
        body,
        user,
        client,
        req
      });
    });
  }

  return async function router(req, res) {
    const startedAt = Date.now();
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = normalizeApiPath(url.pathname);
    const method = req.method || "GET";
    let status = 500;

    try {
      const match = matchRoute(routes, method, pathname);
      if (!match) {
        status = 404;
        sendJson(res, 404, { error: "Route not found" });
        return;
      }

      const result = await runRoute(match.route, match.params, req, url);

      if (result === undefined) {
        status = 204;
        sendJson(res, 204, {});
        return;
      }
      if (result && typeof result === "object" && "body" in result) {
        status = result.status || 200;
        sendJson(res, status, result.body, result.headers || {});
        return;
      }
      status = 200;
      sendJson(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) {
        status = err.status;
        sendJson(res, err.status, { error: err.message });
      } else {
        status = 500;
        logError(`unhandled error on ${method} ${pathname}`, err);
        sendJson(res, 500, { error: "Server error" });
      }
    } finally {
      logRequest({ method, path: pathname, status, durationMs: Date.now() - startedAt });
    }
  };
}

module.exports = { matchRoute, normalizeApiPath, createRouter };
