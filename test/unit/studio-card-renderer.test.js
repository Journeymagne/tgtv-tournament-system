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
