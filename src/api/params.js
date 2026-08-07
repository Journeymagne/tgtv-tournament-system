const { HttpError } = require("../http/io");

// Converts a caller-supplied path/body/query value into a positive integer id.
// Throws `HttpError(status, message)` for anything that is not one -- missing,
// non-numeric, zero, negative, or fractional -- instead of letting `Number(x)`
// produce NaN and flow into a parameterized query. Postgres rejects a NaN
// parameter with "invalid input syntax for type integer" (22P02), which is not
// an HttpError, so without this guard the router reports a generic 500 and
// logs a stack for what is really a client error.
function requirePositiveIntId(value, status, message) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new HttpError(status, message);
  }
  return num;
}

module.exports = { requirePositiveIntId };
