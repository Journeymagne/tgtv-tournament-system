const { Readable } = require("stream");
const { ensureDb, handleApi } = require("../../server");

let dbReady;

function queryString(event) {
  if (event.rawQuery) return event.rawQuery;
  const params = event.multiValueQueryStringParameters || event.queryStringParameters || {};
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== undefined && item !== null) search.append(key, item);
    }
  }
  return search.toString();
}

function apiPath(event) {
  const path = event.path || "/api";
  const functionPrefix = "/.netlify/functions/api";
  if (path.startsWith(functionPrefix)) {
    return `/api${path.slice(functionPrefix.length) || ""}`;
  }
  return path.startsWith("/api") ? path : `/api${path}`;
}

function requestFromEvent(event) {
  const body = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
    : Buffer.alloc(0);
  const req = Readable.from(body.length ? [body] : []);
  const qs = queryString(event);
  req.method = event.httpMethod || "GET";
  req.url = `${apiPath(event)}${qs ? `?${qs}` : ""}`;
  req.headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  req.headers.host = req.headers.host || "netlify.local";
  return req;
}

function responseCollector() {
  const chunks = [];
  const headers = {};
  return {
    res: {
      writeHead(statusCode, head = {}) {
        this.statusCode = statusCode;
        Object.assign(headers, head);
      },
      setHeader(key, value) {
        headers[key] = value;
      },
      end(chunk = "") {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        this.finished = true;
      },
      statusCode: 200,
      finished: false
    },
    result(res) {
      return {
        statusCode: res.statusCode || 200,
        headers,
        body: Buffer.concat(chunks).toString("utf8")
      };
    }
  };
}

exports.handler = async (event) => {
  dbReady ||= ensureDb();
  await dbReady;

  const req = requestFromEvent(event);
  const { res, result } = responseCollector();
  await handleApi(req, res);
  return result(res);
};
