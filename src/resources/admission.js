const { HttpError } = require('../http/io');
const { MiB } = require('./policy');
function busy(message = 'Слишком много одновременных запросов. Повторите через 2 сек.') {
  const error = new HttpError(429, message); error.headers = { 'Retry-After': '2' }; return error;
}
function createAdmission({ maxRequests = 64, maxBytes = 128 * MiB, maxKeys = 10000, clock = Date.now } = {}) {
  let requests = 0, bytes = 0;
  const buckets = new Map();
  function rate(key, max, seconds) {
    const now = clock();
    if (buckets.size >= maxKeys) for (const [id, bucket] of buckets) if (bucket.until <= now) buckets.delete(id);
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (!bucket && buckets.size >= maxKeys) throw busy();
      bucket = { hits: 0, until: now + seconds * 1000 }; buckets.set(key, bucket);
    }
    if (++bucket.hits > max) {
      const retry = Math.max(1, Math.ceil((bucket.until - now) / 1000));
      const error = new HttpError(429, `Слишком частые запросы. Повторите через ${retry} сек.`);
      error.headers = { 'Retry-After': String(retry) }; throw error;
    }
  }
  function enter(weight = 0) {
    if (requests >= maxRequests || bytes + weight > maxBytes) throw busy();
    requests++; bytes += weight; let released = false;
    return () => { if (!released) { released = true; requests--; bytes -= weight; } };
  }
  return { enter, rate };
}
const positiveSetting = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const admission = createAdmission({
  maxRequests: positiveSetting(process.env.API_MAX_INFLIGHT, 64),
  maxBytes: positiveSetting(process.env.UPLOAD_MEMORY_BUDGET_MIB, 128) * MiB
});
module.exports = { createAdmission, admission, busy };
