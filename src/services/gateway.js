const http = require('node:http');
const https = require('node:https');
const { sendJson, SECURITY_HEADERS } = require('../http/io');
const { apiService, pageService, SERVICES, DEFAULT_PORTS } = require('./catalog');
const { TRUST_PROXY } = require('../config');
const { clientKey } = require('../http/io');

function upstreams() {
  return Object.fromEntries(SERVICES.map(name => {
    const value = process.env[name.toUpperCase() + '_URL'] || `http://127.0.0.1:${DEFAULT_PORTS[name]}`;
    const url = new URL(value);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Invalid upstream for ' + name);
    return [name, url];
  }));
}
const HOP_HEADERS = ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'];
function cleanHeaders(headers) {
  const result = { ...headers };
  for (const name of [...HOP_HEADERS, ...String(headers.connection || '').toLowerCase().split(',').map(s => s.trim())]) delete result[name];
  return result;
}
function createGateway() {
  const targets = upstreams();
  return function gateway(req, res) {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { sendJson(res, 400, { error: 'Invalid URL' }); return true; }
    if (pathname.includes('\\') || pathname.includes('\0')) { sendJson(res, 400, { error: 'Invalid URL' }); return true; }
    let service = pathname.startsWith('/api/') ? apiService(pathname.replace(/\/$/, ''), req.method) : pageService(pathname);
    if (!service) return false;
    let release = () => {};
    try {
      const { admission } = require('../resources/admission');
      admission.rate('gateway:' + clientKey(req, TRUST_PROXY), 1200, 60);
      const bytes = Number(req.headers['content-length'] || 0);
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 100 * 1024 * 1024) {
        sendJson(res, 413, { error: 'Request exceeds 100 MiB' }, { Connection: 'close' }); req.resume(); return true;
      }
      release = admission.enter();
    } catch (error) {
      sendJson(res, error.status || 429, { error: error.message }, { ...error.headers, Connection: 'close' }); req.resume(); return true;
    }
    res.once('close', release); res.once('finish', release);
    const target = targets[service];
    const headers = cleanHeaders(req.headers);
    // Preserve the public Host for cookies, origin/CSRF checks and hosted TTS URLs.
    // Never forward caller-supplied hop or identity headers as trusted metadata.
    delete headers.forwarded;
    delete headers['x-forwarded-host'];
    delete headers['x-kt-user'];
    headers['x-forwarded-for'] = clientKey(req, TRUST_PROXY);
    headers['x-forwarded-proto'] = TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? 'https' : 'http';
    const upstream = (target.protocol === 'https:' ? https : http).request({
      hostname: target.hostname, port: target.port, method: req.method, path: req.url,
      headers, timeout: 90000
    }, response => {
      res.writeHead(response.statusCode, { ...cleanHeaders(response.headers), 'X-KT-Service': service });
      response.pipe(res);
      response.on('error', () => res.destroy());
    });
    upstream.on('timeout', () => upstream.destroy(Error('Upstream timeout')));
    upstream.on('error', () => {
      if (res.headersSent) res.destroy();
      else if (pathname.startsWith('/api/') || pathname.endsWith('/api/health')) sendJson(res, 503, { error: 'Сервис временно недоступен. Остальные разделы продолжают работать.', service }, { 'Cache-Control': 'no-store', 'Retry-After': '5', 'X-KT-Service':service });
      else {
        res.writeHead(503,{...SECURITY_HEADERS,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Retry-After':'5','X-KT-Service':service});
        res.end(req.method==='HEAD'?undefined:'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Сервис временно недоступен</title><body><main><h1>Сервис временно недоступен</h1><p>Остальные разделы KT Companion продолжают работать.</p><p><a href="/">Открыть главное меню</a></p></main></body></html>');
      }
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    let received = 0;
    req.on('data', chunk => {
      received += chunk.length;
      if (received > 100 * 1024 * 1024) {
        if (!res.headersSent) sendJson(res, 413, { error: 'Request exceeds 100 MiB' }, { Connection: 'close' });
        upstream.destroy(); req.unpipe(upstream); req.resume();
      }
    });
    req.pipe(upstream);
    return true;
  };
}
module.exports = { createGateway };
