// Only expressions supplied by repository code may reach ORDER BY.
function sqlOrder(columns, sort, direction, fallback, tie) {
  if (!Object.hasOwn(columns, sort) || (direction && direction !== "asc" && direction !== "desc")) return fallback;
  const order = direction || (["rank", "name", "leaderName", "player", "opponent", "faction", "tournament", "rosterA", "rosterB", "status"].includes(sort) ? "asc" : "desc");
  return `${columns[sort]} ${order.toUpperCase()} NULLS LAST, ${tie}`;
}

function compareValues(a, b, direction = "asc") {
  const missing = value => value === null || value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value));
  if (missing(a) || missing(b)) return Number(missing(a)) - Number(missing(b));
  const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return direction === "desc" ? -result : result;
}

module.exports = { sqlOrder, compareValues };
