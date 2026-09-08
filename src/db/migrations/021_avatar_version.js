// Avatars stop travelling inside JSON and become a cacheable HTTP resource.
// Every response that mentions a player used to inline the whole base64 image --
// once per mention -- so a single games list carried megabytes of duplicated
// picture. The URL has to change when the picture does, and computing that from
// avatar_data on every read would mean selecting the base64 anyway, which is the
// cost we are removing. So the fingerprint is stored beside the image and the
// base64 is read only by the route that actually serves the bytes.
//
// The expression matches contentVersion() in src/domain/data-url.js: the first
// 16 hex characters of the SHA-256 of the stored string.
module.exports = {
  version: 21,
  name: "avatar_version",
  async up(client) {
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_version TEXT;

      UPDATE users
      SET avatar_version = substr(encode(sha256(convert_to(avatar_data, 'UTF8')), 'hex'), 1, 16)
      WHERE avatar_data IS NOT NULL AND avatar_version IS NULL;

      UPDATE users SET avatar_version = NULL WHERE avatar_data IS NULL AND avatar_version IS NOT NULL;
    `);
  }
};
