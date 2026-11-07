const { configuration } = require("./config");
const https = require('node:https');

function throughTunnel(port, token, method, body, signal) {
  return new Promise((resolve, reject) => {
    // The SSH tunnel only transports TCP. TLS still authenticates Telegram itself.
    const req = https.request({ hostname: '127.0.0.1', port, servername: 'api.telegram.org',
      method: 'POST', path: `/bot${token}/${method}`, signal,
      headers: { Host: 'api.telegram.org', 'Content-Type': 'application/json' }
    }, res => {
      const chunks = []; let size = 0;
      res.on('error', reject);
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) { res.destroy(); reject(Error('Response too large')); }
        else chunks.push(chunk);
      });
      res.on('end', () => {
        try { resolve({ response: { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

async function call(method, body = {}, { signal, timeout = 15000 } = {}) {
  const config = configuration();
  if (!["polling", "webhook"].includes(config.mode)) throw Error("Telegram network delivery is disabled");
  let response, data;
  try {
    const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    if (config.tunnelPort) {
      ({ response, data } = await throughTunnel(config.tunnelPort, config.token, method, body, deadline));
    } else {
      response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: deadline
      });
      data = await response.json();
    }
  } catch {
    // Never propagate fetch errors: their URLs may contain the bot token.
    const err = Error("telegram_network_error"); err.retryable = true; throw err;
  }
  if (!response.ok || !data.ok) {
    const code = Number(data.error_code) || response.status;
    const err = Error(`telegram_http_${code}`);
    err.code = code; err.retryable = code === 429 || code >= 500;
    err.retryAfter = Math.min(86400, Math.max(1, Number(data.parameters?.retry_after) || 1));
    throw err;
  }
  return data.result;
}
module.exports = { call };
