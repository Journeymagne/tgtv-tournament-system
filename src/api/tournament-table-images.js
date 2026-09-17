const crypto = require("node:crypto");
const { HttpError, ValidationError } = require("../http/io");
const { decodeDataUrl } = require("../domain/data-url");
const { requirePositiveIntId } = require("./params");
const { PUBLISHED_STATUSES } = require("../db/repositories/tournaments");

function validateTableImage(value) {
  const file = decodeDataUrl(value);
  const bytes = file?.bytes;
  if (!bytes || file.contentType !== "image/png" || bytes.length < 45 || bytes.length > 1024 * 1024
      || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new ValidationError("Upload a valid resized PNG killzone image up to 1 MiB");
  }
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (Math.min(width, height) !== 200 || Math.max(width, height) > 8192) {
    throw new ValidationError("Killzone images must have a 200 pixel short side and a long side of at most 8192 pixels");
  }
  return file;
}

async function saveTableImage(client, tournamentId, selection, previous) {
  if (selection.imageData) {
    const file = validateTableImage(selection.imageData);
    const hash = crypto.createHash("sha256").update(file.bytes).digest("hex");
    const { rows } = await client.query(`INSERT INTO tournament_table_images (tournament_id, image_data, content_hash)
      VALUES ($1, $2, $3) ON CONFLICT (tournament_id, content_hash) DO UPDATE SET content_hash = EXCLUDED.content_hash RETURNING id`,
    [tournamentId, `data:image/png;base64,${file.bytes.toString("base64")}`, hash]);
    return rows[0].id;
  }
  const supplied = Object.hasOwn(selection, "imageId") || Object.hasOwn(selection, "imageData");
  const imageId = supplied ? selection.imageId : previous?.killzone === selection.killzone
    && Number(previous?.deployment) === Number(selection.deployment) ? previous.imageId : null;
  if (imageId === null || imageId === undefined || imageId === "") return null;
  const id = requirePositiveIntId(imageId, 400, "Invalid killzone image");
  const { rowCount } = await client.query("SELECT id FROM tournament_table_images WHERE id = $1 AND tournament_id = $2", [id, tournamentId]);
  if (!rowCount) throw new ValidationError("Killzone image does not belong to this tournament");
  return id;
}

async function image({ client, params, user }) {
  const id = requirePositiveIntId(params.id, 404, "Killzone image not found");
  const { rows: [row] } = await client.query(`SELECT i.image_data, i.content_hash, t.status
    FROM tournament_table_images i JOIN tournaments t ON t.id = i.tournament_id WHERE i.id = $1`, [id]);
  if (!row || (!user?.isAdmin && !PUBLISHED_STATUSES.includes(row.status))) throw new HttpError(404, "Killzone image not found");
  const file = decodeDataUrl(row.image_data);
  return { buffer: file.bytes, contentType: file.contentType,
    headers: { ETag: `"${row.content_hash}"`, "Cache-Control": "private, max-age=3600" } };
}

module.exports = { validateTableImage, saveTableImage, image };
