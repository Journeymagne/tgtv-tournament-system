const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
// Media is already stored on its object. History records its identity, not a copy.
function snapshot(value, depth = 0) {
  if (typeof value === 'string') {
    if (/^data:/i.test(value)) return { mediaSha256: hash(value), encodedBytes: Buffer.byteLength(value) };
    if (value.length > 12000) return { excerpt: value.slice(0, 12000), sha256: hash(value), characters: value.length };
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  if (depth > 32) return '[nested data omitted]';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 1000).map(item => snapshot(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, depth + 1)]));
}
function auditJson(value) {
  if (value == null) return null;
  const json = JSON.stringify(snapshot(value));
  return Buffer.byteLength(json) <= 256 * 1024 ? json : JSON.stringify({ sha256: hash(json), bytes: Buffer.byteLength(json), summary: 'Large audit snapshot omitted' });
}
function unchanged(before, patch) {
  return Object.entries(patch).every(([key, value]) => JSON.stringify(before[key] ?? null) === JSON.stringify(value ?? null));
}
module.exports = { snapshot, auditJson, unchanged };
