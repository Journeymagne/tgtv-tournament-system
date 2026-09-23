const test = require("node:test");
const assert = require("node:assert/strict");
const Model = require("../../public/studio/model");
const Cards = require("../../public/studio/card-renderer");
const { buildTeamPDF } = require("../../public/studio/pdf-template");

function project(lore = "") {
  const team = Model.newProject("lore-test", "Lore test");
  team.operatives.push({ ...Model.blank("operative", "operative"), name: "THE BLADED BLESSING", lore,
    stats: { APL: 3, MOVE: '7″', SAVE: '5+', WOUNDS: 9 }, keywords: ["CHAOS"], loadouts: [],
    weapons: [{ id: "weapon", name: "Throwing knives", kind: "ranged", attacks: 4, hit: "2+", damage: "3/4", special: "Range 6″", critical: "" }],
    abilities: [{ id: "ability", name: "Rule heading", body: "Rule body remains separate." }] });
  return team;
}
const headerHeight = svg => Number(svg.match(/<rect x="0" y="0" width="[^"]+" height="([^"]+)" fill="#141718"/)[1]);
const loreGroups = svg => [...svg.matchAll(/<g class="operative-lore">([\s\S]*?)<\/g>/g)].map(match => match[1]);

test("operative lore is in the dark header above weapons, without a duplicate in the rules", () => {
  const team = project("Художественный текст"), card = Cards.renderCard(team.operatives[0], team)[0];
  assert(loreGroups(card.svg).join("").includes("Художественный текст"));
  assert.equal(card.svg.split("Художественный текст").length - 1, 1);
  const bottom = headerHeight(card.svg);
  assert(bottom > 33);
  for (const box of card.boxes) {
    if (box.kind === "operative-lore") assert(box.y >= 27 && box.y + box.h < bottom);
    else assert(box.y >= bottom, "weapons and rules must be below the header");
  }
  assert(card.svg.includes("Throwing knives"));
  assert(card.svg.includes("Rule body remains separate."));
});

test("long operative lore paginates without clipping, losing text or covering rules", () => {
  const lines = Array.from({ length: 90 }, (_, i) => "LoreLine" + String(i).padStart(3, "0"));
  const team = project(lines.join("\n")), cards = Cards.renderCard(team.operatives[0], team);
  assert(cards.length > 1 && cards.length < 20);
  const text = cards.flatMap(card => loreGroups(card.svg)).join("");
  for (const line of lines) assert.equal(text.split(line).length - 1, 1, line);
  for (const card of cards) {
    const bottom = headerHeight(card.svg);
    assert(bottom < card.height - 22);
    for (const box of card.boxes) {
      assert(box.x >= 0 && box.x + box.w <= card.width);
      assert(box.y >= 0 && box.y + box.h < card.height - 22);
      assert(box.kind === "operative-lore" ? box.y + box.h < bottom : box.y >= bottom);
    }
  }
  assert(cards.at(-1).svg.includes("Rule body remains separate."));
});

test("header lore preserves formatting and is rendered identically in the PDF definition", () => {
  const team = project("**Жирный**\n[size=24]Крупный[/size]\n<script>literal</script>");
  const card = Cards.renderCard(team.operatives[0], team)[0], lore = loreGroups(card.svg).join("");
  assert(lore.includes('font-weight="bold"'));
  assert(lore.includes('font-style="italic"'));
  assert(lore.includes('font-size="24"'));
  assert(lore.includes("&lt;script&gt;literal&lt;/script&gt;"));
  assert(!card.svg.includes("<script>"));
  const pdf = buildTeamPDF(team, {}, { section: "operatives", index: 0 });
  assert.equal(pdf.content.find(item => item.svg).svg, card.svg);
});

test("operatives without lore retain their header and other card kinds retain their lore placement", () => {
  const team = project(), operative = Cards.renderCard(team.operatives[0], team)[0];
  assert.equal(headerHeight(operative.svg), 33);
  assert.equal(loreGroups(operative.svg).length, 0);
  const ploy = team.strategicPloys[0];ploy.name = "Ploy";ploy.lore = "Ploy lore";ploy.body = "Ploy rule";
  const card = Cards.renderCard(ploy, team)[0];
  assert(card.svg.includes("Ploy lore"));
  assert.equal(loreGroups(card.svg).length, 0);
});

test("inline card instances keep their own clipping masks beside hidden previews and other sides", () => {
  const team = project("Lore line.\n".repeat(90)), operative = team.operatives[0];
  operative.image = 'data:image/png;base64,AAAA';
  operative.imageWidth = operative.imageHeight = 100;
  operative.imageCrop = { x: .1, y: .2, width: .5, height: .4 };
  const cards = Cards.renderCard(operative, team);
  assert(cards.length > 1);
  const standalone = cards.map(card => card.svg);
  const mounted = [Cards.inlineSVG(cards[0].svg, "editor-preview"),
    ...cards.map((card, side) => Cards.inlineSVG(card.svg, "publication-operatives-0-" + side)),
    Cards.inlineSVG(cards[0].svg, "publication-operatives-1-0")];
  const allIds = new Set();
  for (const svg of mounted) {
    const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
    assert.equal(ids.size, 3, "card outline, header and crop masks are all retained");
    for (const id of ids) { assert(!allIds.has(id), "IDs must differ even for copies of the same card");allIds.add(id); }
    for (const match of svg.matchAll(/clip-path="url\(#([^)]*)\)"/g)) assert(ids.has(match[1]), "clip references resolve within this instance");
    assert(!svg.includes('url(#headerclip)'));
  }
  assert.deepEqual(cards.map(card => card.svg), standalone, "mounting does not change standalone export SVGs");
  const pdf = buildTeamPDF(team, {}, { section: "operatives", index: 0 });
  assert.deepEqual(pdf.content.filter(item => item.svg).map(item => item.svg), standalone);
});

test("dense operative rules fill both columns below compact weapons without losing paragraphs", () => {
  const team = project(), operative = team.operatives[0];
  operative.weapons = Array.from({ length: 5 }, (_, i) => ({ ...operative.weapons[0], id: 'weapon-' + i, name: 'Weapon ' + i }));
  const paragraphs = Array.from({ length: 11 }, (_, i) => 'RuleLine' + String(i).padStart(3, '0') + ' remains visible.');
  operative.abilities = [{ id: 'ability', name: 'Dense ability', body: paragraphs.slice(0, 7).join('\n') }, { id: 'second', name: 'Second ability', body: paragraphs.slice(7).join('\n\n') }];
  const cards = Cards.renderCard(operative, team);
  assert.equal(cards.length, 1, 'a block may continue in the second column below the weapons');
  for (const line of paragraphs) assert.equal(cards[0].svg.split(line).length - 1, 1);
  assert(cards[0].svg.includes('Dense ability:'));
  const weapons = cards[0].boxes.filter(box => box.kind === 'weapon');
  assert(Math.max(...weapons.map(box => box.y + box.h)) - Math.min(...weapons.map(box => box.y)) < 62);
  assert(cards[0].boxes.filter(box => !box.kind).some(box => box.x > cards[0].width / 2));
  for (const box of cards[0].boxes) assert(box.x >= 0 && box.x + box.w <= cards[0].width && box.y + box.h < cards[0].height - 18);
});

test("wide portraits use the top row while long lore keeps its own wider text area", () => {
  const team = project('Lore below the portrait.\n'.repeat(10)), operative = team.operatives[0];
  operative.image = 'data:image/png;base64,AAAA';
  const card = Cards.renderCard(operative, team)[0];
  assert.match(card.svg, /class="operative-portrait"[^>]*><image[^>]+width="110" height="31"/);
  const clip = /id="headerclip"><rect[^>]+height="([^"]+)"/.exec(card.svg);
  assert.equal(Number(clip[1]), 33, 'lore must not expand the portrait beyond the top row');
  assert(card.boxes.filter(box => box.kind === 'operative-lore').every(box => box.y >= 37));
  assert.equal((card.svg.match(/class="stat-icon"/g) || []).length, 4);
});
