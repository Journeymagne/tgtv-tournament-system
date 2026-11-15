const { ValidationError } = require("../../http/io");

// Store an absolute instant; browsers convert the organizer's local date/time.
function normalizeRoundDeadline(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new ValidationError("Round deadline must be a date and time with a timezone");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ValidationError("Invalid round deadline");
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() + 1 !== month || calendarDate.getUTCDate() !== day) {
    throw new ValidationError("Invalid round deadline");
  }
  return date.toISOString();
}

module.exports = { normalizeRoundDeadline };
