function line(level, payload) {
  const record = { level, time: new Date().toISOString(), ...payload };
  const text = JSON.stringify(record);
  if (level === "error") {
    console.error(text);
  } else {
    console.log(text);
  }
}

function logRequest({ method, path, status, durationMs }) {
  line("info", { msg: "request", method, path, status, durationMs });
}

function logError(message, err) {
  line("error", {
    msg: message,
    error: err?.message || String(err),
    stack: err?.stack || null
  });
}

module.exports = { logRequest, logError };
