const { createHash } = require("node:crypto");
const { inflateSync } = require("node:zlib");
const { HttpError } = require("../http/io");

const MAX_BYTES = 64 * 1024 * 1024;
const fail = message => { throw new HttpError(400, message); };
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// Only raster images and a small declarative manifest cross the trust boundary.
// Clients cannot supply Lua, TTS object data, external URLs, or arbitrary files.
function png(value) {
  if (typeof value !== "string" || value.length > 24 * 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) fail("Ожидалось изображение PNG.");
  const bytes = Buffer.from(value.slice(22), "base64");
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail("Повреждённое изображение PNG.");
  let position = 8, width, height, ended = false;
  const data = [];
  while (position + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(position), kind = bytes.toString("ascii", position + 4, position + 8);
    if (length > bytes.length - position - 12) fail("Повреждённое изображение PNG.");
    if (position === 8) {
      if (kind !== "IHDR" || length !== 13) fail("Повреждённый заголовок PNG.");
      width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
      if (!integer(width, 16, 4096) || !integer(height, 16, 4096) || bytes[24] !== 8 || ![2,6].includes(bytes[25]) || bytes[26] || bytes[27] || bytes[28]) fail("Неподдерживаемый размер или формат PNG.");
    } else if (kind === "IDAT") data.push(bytes.subarray(position + 8, position + 8 + length));
    else if (kind === "IEND") { ended = length === 0 && position + 12 === bytes.length; break; }
    else if (!["sRGB", "gAMA", "cHRM", "pHYs", "iCCP", "sBIT"].includes(kind)) fail("Неподдерживаемые данные PNG.");
    position += length + 12;
  }
  if (!ended || !data.length) fail("Изображение PNG не завершено.");
  const expected = height * (1 + width * (bytes[25] === 6 ? 4 : 3));
  try { if (inflateSync(Buffer.concat(data), { maxOutputLength: expected }).length !== expected) fail("Повреждённые пиксели PNG."); }
  catch { fail("Повреждённые пиксели PNG."); }
  return { bytes, width, height, hash: createHash("sha256").update(bytes).digest("hex") };
}

function validatePack(body) {
  if (!body || body.version !== 1 || !text(body.team?.id, 100) || !/^[a-zA-Z0-9_-]+$/.test(body.team.id) || !text(body.team.name, 200) || typeof body.team.version !== "string" || body.team.version.length > 100) fail("Проверьте название команды.");
  const diceInput = body.dice ?? [];
  if (!Array.isArray(diceInput) || diceInput.length > 1) fail("В наборе может быть один дизайн D6.");
  if (!Array.isArray(body.cards) || body.cards.length > 690 || !Array.isArray(body.sheets) || body.sheets.length > 10 || !Array.isArray(body.tokens) || body.tokens.length > 300 || !body.cards.length && !body.tokens.length && !diceInput.length) fail("Добавьте карты, жетоны или кубик D6.");
  if (!Array.isArray(body.assets) || body.assets.length > 320) fail("Слишком много изображений.");
  const assets = new Map(); let byteSize = 0;
  for (const item of body.assets) {
    if (!item || !/^[a-z0-9-]{1,80}\.png$/.test(item.name) || assets.has(item.name)) fail("Некорректное имя изображения.");
    const image = png(item.data); byteSize += image.bytes.length;
    if (byteSize > MAX_BYTES) throw new HttpError(413, "Набор TTS больше 64 МБ. Уменьшите изображения.");
    assets.set(item.name, { name: item.name, ...image });
  }
  const used = new Set(), use = name => { const asset = assets.get(name); if (!asset) fail("Не хватает изображения для набора."); used.add(name); return asset; };
  const sheets = body.sheets.map(sheet => {
    if (!sheet || !integer(sheet.columns, 2, 10) || !integer(sheet.rows, 2, 7)) fail("Некорректный лист колоды.");
    const face = use(sheet.face), back = use(sheet.back);
    if (face.width !== back.width || face.height !== back.height || face.width % sheet.columns || face.height % sheet.rows) fail("Размеры листов колоды не совпадают.");
    return { columns: sheet.columns, rows: sheet.rows, face: sheet.face, back: sheet.back };
  });
  const slots = new Set();
  const cards = body.cards.map(card => {
    if (!card || !text(card.name, 240) || !integer(card.sheet, 0, sheets.length - 1) || !integer(card.slot, 0, sheets[card.sheet].columns * sheets[card.sheet].rows - 2) || typeof card.landscape !== "boolean" || slots.has(card.sheet + ":" + card.slot)) fail("Некорректная карта в колоде.");
    slots.add(card.sheet + ":" + card.slot);
    return { name: card.name, sheet: card.sheet, slot: card.slot, landscape: card.landscape };
  });
  if (sheets.some((_, index) => !cards.some(card => card.sheet === index))) fail("Пустой лист колоды.");
  const keys = new Set();
  const tokens = body.tokens.map(token => {
    if (!token || !text(token.key, 330) || keys.has(token.key) || !text(token.name, 200) || !Number.isFinite(token.sizeMm) || token.sizeMm < 5 || token.sizeMm > 60 || !["marker", "effect", "both"].includes(token.mode) || typeof token.stackable !== "boolean") fail("Некорректный жетон.");
    const mode = token.mode === "both" ? "effect" : token.mode;
    const shape = token.shape ?? "circle", rangeInches = token.rangeInches ?? (mode === "effect" ? 0 : 1);
    if (!["circle", "trapezoid", "diamond", "octagon"].includes(shape) || !Number.isFinite(rangeInches) || rangeInches < 0 || rangeInches > 12) fail("Проверьте форму и дистанцию жетона.");
    keys.add(token.key);
    const image = use(token.image);
    if (image.width !== image.height || image.width > 1024) fail("Изображение жетона должно быть квадратным, до 1024 пикселей.");
    return { key: token.key, name: token.name, sizeMm: token.sizeMm, mode, stackable: mode === "effect" && token.stackable, image: token.image, shape, rangeInches: mode === "effect" ? 0 : rangeInches };
  });
  const dice = diceInput.map(die => {
    if (!die || !text(die.name, 200) || !Number.isFinite(die.sizeMm) || die.sizeMm < 12 || die.sizeMm > 30 || !integer(die.quantity, 1, 24)) fail("Проверьте название, размер и количество кубиков D6.");
    const image = use(die.image);
    if (image.width !== 2048 || image.height !== 2048) fail("Развёртка D6 должна быть PNG 2048 × 2048.");
    return { name: die.name.trim(), sizeMm: die.sizeMm, quantity: die.quantity, image: die.image };
  });
  if (used.size !== assets.size || !byteSize) fail("В наборе есть лишние изображения.");
  return { manifest: { version: 1, team: { id: body.team.id, name: body.team.name.trim(), version: body.team.version }, sheets, cards, tokens, ...(dice.length ? { dice } : {}) }, assets: [...assets.values()], byteSize };
}

module.exports = { validatePack, MAX_BYTES };
