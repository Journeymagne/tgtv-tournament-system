const { configuration } = require("./config");

async function call(method, body = {}, { signal, timeout = 15000 } = {}) {
  const config = configuration();
  if (!["polling", "webhook"].includes(config.mode)) throw Error("Telegram network delivery is disabled");
  let response, data;
  try {
    response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
    });
    data = await response.json();
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
