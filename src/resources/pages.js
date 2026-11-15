const { ValidationError } = require('../http/io');
function options(query = new URLSearchParams()) {
  const value = (key, fallback, max) => {
    if (!query.has(key)) return fallback;
    const n = Number(query.get(key));
    if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new ValidationError(`Invalid ${key}`);
    return n;
  };
  return { page: value('page', 1, 1000000), limit: value('limit', 20, 100) };
}
// SQL and values come only from repository code; request parameters stay bound.
async function select(client, sql, values = [], query) {
  const { page, limit } = options(query);
  const count = await client.query(`SELECT count(*) AS total FROM (${sql}) page_source`, values);
  const total = Number(count.rows[0].total), totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages), start = (currentPage - 1) * limit;
  const { rows } = await client.query(`${sql} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, start]);
  return { rows, pagination: { currentPage, totalPages, total, start, end: Math.min(start + rows.length, total) } };
}
module.exports = { options, select };
