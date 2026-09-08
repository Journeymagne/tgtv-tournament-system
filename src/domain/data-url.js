const crypto = require("node:crypto");

// Attachments -- avatars, tournament rules PDFs, team logos -- are stored as
// base64 `data:` URLs. Inlining them into JSON costs a third more bytes than the
// file itself, cannot be cached separately by the browser, and repeats once per
// row that mentions the owner. These helpers turn a stored value back into the
// bytes and the ETag a dedicated HTTP route needs.
const DATA_URL = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+);base64,([a-z0-9+/]+={0,2})$/i;

function decodeDataUrl(value) {
  const match = DATA_URL.exec(String(value || "").trim());
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) return null;
  return { contentType: match[1].toLowerCase(), bytes };
}

// Content-addressed: the URL changes exactly when the stored bytes change, which
// is what lets the response be cached hard without ever going stale.
function contentVersion(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

module.exports = { decodeDataUrl, contentVersion };
