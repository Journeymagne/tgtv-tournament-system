const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pngImage } = require("../helpers/png");
const { validateTableImage } = require("../../src/api/tournament-table-images");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
function sourceOf(name) {
  const value = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(value, name);
  return value;
}

test("killzone images preserve proportions with an exact 200px short side, without cropping", async () => {
  let dimensions, drawn;
  const render = new Function("t", "loadImage", "document", "canvasToBlob", "blobToDataUrl",
    `${sourceOf("tableImageDimensions")}\n${sourceOf("resizeTableImage")};return resizeTableImage;`)(
    key => key, async file => ({ naturalWidth: file.width, naturalHeight: file.height }),
    { createElement: () => ({ getContext: () => ({ drawImage: (...args) => { drawn = args; } }) }) },
    async (canvas, type) => { assert.equal(type, "image/png"); dimensions = [canvas.width, canvas.height]; return { size: 100 }; }, async () => "RESIZED");
  for (const [width, height, expected] of [[1200, 800, [300, 200]], [600, 1200, [200, 400]], [100, 100, [200, 200]]]) {
    assert.equal(await render({ type: "image/jpeg", size: 5000, width, height }), "RESIZED");
    assert.deepEqual(dimensions, expected);
    assert.equal(drawn.length, 5, "use the whole source image, not a cropped region");
    assert.deepEqual(drawn.slice(1), [0, 0, ...expected]);
  }
  for (const invalid of [{ type: "image/svg+xml", size: 10 }, { type: "image/png", size: 21 * 1024 * 1024 },
    { type: "image/png", size: 10, width: 1, height: 50 }, { type: "image/png", size: 10, width: 0, height: 0 }]) {
    await assert.rejects(() => render(invalid));
  }
});

test("server accepts resized PNGs and rejects wrong dimensions, types and oversized uploads", () => {
  const data = bytes => `data:image/png;base64,${bytes.toString("base64")}`;
  assert.equal(validateTableImage(data(pngImage(300, 200))).contentType, "image/png");
  assert.equal(validateTableImage(data(pngImage(200, 400))).contentType, "image/png");
  for (const invalid of [data(pngImage(600, 400)), data(Buffer.alloc(70)), "data:image/svg+xml;base64,PHN2Zz4=",
    data(Buffer.concat([pngImage(300, 200), Buffer.alloc(1024 * 1024)]))]) assert.throws(() => validateTableImage(invalid));
});

test("round payload distinguishes keeping, replacing and removing a table image", () => {
  const payload = new Function(`${sourceOf("teamTableSetupPayload")};return teamTableSetupPayload;`)();
  const elements = {};
  for (let i = 0; i < 3; i++) {
    elements[`teamKillzone-${i}`] = { value: "Volkus" };
    elements[`teamLayout-${i}`] = { value: "4" };
    elements[`teamImageId-${i}`] = { value: i === 0 ? "17" : "" };
    elements[`teamImageData-${i}`] = { value: i === 1 ? "NEW IMAGE" : "" };
  }
  assert.deepEqual(payload({ elements }).map(({ imageId, imageData }) => ({ imageId, imageData })), [
    { imageId: 17, imageData: null }, { imageId: null, imageData: "NEW IMAGE" }, { imageId: null, imageData: null }
  ]);
});
