const { randomBytes, randomInt, createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const script = name => readFileSync(path.join(__dirname, "../tts", name + ".lua"), "utf8");
const containerScript = script("container"), tokenScript = script("token"), importerScript = script("importer");
const dispenserScript = script("dispenser");
const diceScript = script("dice");

function factory() {
  const guids = new Set();
  return (Name, Nickname, extra = {}) => {
    let GUID; do { GUID = randomBytes(3).toString("hex"); } while (guids.has(GUID)); guids.add(GUID);
    return { GUID, Name, Nickname, Description: "", Transform: {posX:0,posY:2,posZ:0,rotX:0,rotY:180,rotZ:0,scaleX:1,scaleY:1,scaleZ:1},
      ColorDiffuse:{r:1,g:1,b:1}, Locked:false, Grid:false, Snap:false, Autoraise:true, Sticky:false, Tooltip:true, Hands:false,
      LuaScript:"", LuaScriptState:"", XmlUI:"", ...extra };
  };
}

function buildObject(manifest, assetBase) {
  const make = factory(), { team, sheets, cards, tokens } = manifest;
  // TTS shares CustomDeck keys across a table. Avoid replacing a previous import's textures.
  const deckKeys = [];
  for (const sheet of sheets) { let key; do { key = randomInt(1, 10000000); } while (deckKeys.includes(key)); deckKeys.push(key); }
  const customs = Object.fromEntries(sheets.map((sheet, index) => [deckKeys[index], { FaceURL: assetBase + sheet.face, BackURL: assetBase + sheet.back,
    NumWidth: sheet.columns, NumHeight: sheet.rows, BackIsHidden:false, UniqueBack:true, Type:0 }]));
  const cardObjects = cards.map(card => make("CardCustom", card.name, {CardID:deckKeys[card.sheet]*100 + card.slot,
    CustomDeck:{[deckKeys[card.sheet]]:customs[deckKeys[card.sheet]]}, SidewaysCard:false, Hands:true,
    Description:card.landscape?"Rotate 90 degrees to read this operative card.":""}));
  const contents = [];
  if (cardObjects.length === 1) contents.push(cardObjects[0]);
  else if (cardObjects.length) contents.push(make("DeckCustom", team.name + " — Cards", { DeckIDs:cardObjects.map(card=>card.CardID),
    CustomDeck:customs, ContainedObjects:cardObjects, Hands:true, SidewaysCard:false }));
  const dispensers = tokens.map(token => {
    const scale = 0.21 * token.sizeMm / 20;
    const tags = ["KTUIToken"];
    if (token.mode !== "effect") tags.push("KTUIMarker");
    if (token.mode !== "marker") tags.push("KTUITokenSimple");
    const stackable = token.mode !== "marker" && token.stackable === true;
    // KTUI retains an effect's stackability on first attachment. Keep counted
    // and uncounted effects distinct when a user changes the Studio preset.
    const identity = "KTStudio_" + createHash("sha256").update(team.id + ":" + token.key + (stackable ? ":counter" : "")).digest("hex").slice(0,32);
    const piece = make("Custom_Token", token.name, { Tags:tags, Description:identity,
      Transform:{posX:0,posY:2,posZ:0,rotX:0,rotY:180,rotZ:0,scaleX:scale,scaleY:1,scaleZ:scale},
      CustomImage:{ImageURL:assetBase + token.image,ImageSecondaryURL:"",ImageScalar:1,WidthScale:0,
        CustomToken:{Thickness:0.06,MergeDistancePixels:2,StandUp:false,Stackable:stackable}},
      LuaScript:tokenScript.replace("__SIZE_MM__", String(token.sizeMm))
        .replace("__IS_MARKER__", String(token.mode !== "effect"))
        .replace("__RANGE_INCHES__", String(token.rangeInches ?? 1)) });
    const meshURL = assetBase + token.image.replace(/\.png$/, ".obj");
    return make("Custom_Model_Infinite_Bag", token.name + " · " + token.sizeMm + " mm", { ContainedObjects:[piece],
      Tags:["KTStudioDispenser"], Description:token.mode === "marker"
        ? "Drag out a token. Aura only: does not attach to models. Hover and type a number; 0 hides the ring."
        : "Drag out a token and drop it on a KTUI model." + (stackable ? " Each copy increases its counter." : " Applies an effect without a counter."),
      CustomMesh:{MeshURL:meshURL,DiffuseURL:assetBase+token.image,NormalURL:"",ColliderURL:meshURL,
        Convex:true,MaterialIndex:0,TypeIndex:7,CastShadows:true},
      LuaScript:dispenserScript.replace("__SIZE_MM__",String(token.sizeMm)) });
  });
  if (dispensers.length) contents.push(make("Bag", team.name + " — Tokens", {Tags:["KTCardsTokenBag"],ContainedObjects:dispensers,LuaScript:containerScript,ColorDiffuse:{r:0.16,g:0.32,b:0.36}}));
  for (const die of manifest.dice || []) {
    for (let i = 0; i < die.quantity; i++) contents.push(make("Custom_Dice", die.name, {
      CustomImage:{ImageURL:assetBase+die.image, ImageSecondaryURL:"", ImageScalar:1, WidthScale:0, CustomDice:{Type:1}},
      RotationValues:[[-90,0,0],[0,0,0],[0,0,-90],[0,0,90],[0,0,-180],[90,0,0]].map(([x,y,z],index)=>({Value:String(index+1),Rotation:{x,y,z}})),
      LuaScript:diceScript.replace("__SIZE_MM__",String(die.sizeMm)),
      Description:"KT Companion D6 · " + die.sizeMm + " mm", Tags:["KTCompanionDice"]
    }));
  }
  return make("Bag", team.name + (team.version ? " · " + team.version : ""), {ContainedObjects:contents,LuaScript:containerScript,
    Description:"KT Companion · " + cards.length + " cards · " + tokens.length + " token types · " + (manifest.dice||[]).reduce((sum,die)=>sum+die.quantity,0) + " dice",ColorDiffuse:{r:1,g:0.28,b:0.03}});
}

function importer(origin, luaOnly = false) {
  const lua = importerScript.replace("__ORIGIN__", JSON.stringify(origin));
  if (luaOnly) return lua;
  return {ObjectStates:[factory()("BlockSquare", "KT Studio Importer", {LuaScript:lua,ColorDiffuse:{r:0.08,g:0.09,b:0.09}})]};
}

module.exports = { buildObject, importer };
