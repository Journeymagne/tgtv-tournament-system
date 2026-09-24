const { zipSync, strToU8 } = require("../../../public/studio/vendor/fflate");
const { buildStandings } = require("./standings");
const { participantScore, matchWinnerParticipantId } = require("./results");

const TIEBREAKERS = {
  strength_of_schedule: ["strengthOfSchedule", "Strength of Schedule"],
  buchholz: ["buchholz", "Бухгольц"],
  head_to_head: ["headToHeadWins", "Личная встреча"],
  total_vp: ["totalVp", "Всего VP"],
  vp_diff: ["vpDiff", "Разница VP"]
};
const ROUND_HEADERS = ["номер стола", "Crit Op", "Tac Op", "Kill Op", "Prim", "Vp", "Diff", "TP"];

function roundValues(match, participant, participants, tables) {
  if (!match) return Array(8).fill(null);
  const table = match.isBye ? "BYE" : tables.get(match.tableId)?.tableNumber ?? null;
  if (match.isBye && match.winnerParticipantId === participant.id) {
    return [table, null, null, null, null, 0, 0, 3];
  }
  // Pending submissions must not look like confirmed scores (or zero-point losses).
  if (match.status !== "completed" || !match.result) return [table, ...Array(7).fill(null)];
  const opponentId = match.participantAId === participant.id ? match.participantBId : match.participantAId;
  const own = participantScore(match.result, participant);
  const opponent = participantScore(match.result, participants.get(opponentId));
  const winnerId = matchWinnerParticipantId(match);
  const diff = own.total == null || opponent.total == null ? null : own.total - opponent.total;
  return [table, own.crit ?? null, own.tac ?? null, own.kill ?? null, own.primaryBonus ?? null,
    own.total ?? null, diff, winnerId === null ? 1 : winnerId === participant.id ? 3 : 0];
}

function tournamentExportTable({ tournament, participants = [], rounds = [], matches = [], tables = [], people = [] }) {
  const participantById = new Map(participants.map(p => [p.id, p]));
  const peopleById = new Map(people.map(p => [p.id, p]));
  const tableById = new Map(tables.map(table => [table.id, table]));
  const order = tournament.tiebreakerOrder || [];
  const tiebreakers = Array.from({ length: Math.max(3, order.length) }, (_, i) => TIEBREAKERS[order[i]]);
  const headers = ["итоговое место", "челлендж", "Ник", "Фракция", "Итоговые TP",
    ...tiebreakers.map((entry, i) => `Итоговый тайбрейкер ${i + 1}${entry ? `\n${entry[1]}` : ""}`)];
  const summaryColumns = headers.length;
  const roundList = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const groups = roundList.map(round => {
    const roundMatches = matches.filter(match => match.roundId === round.id);
    const missions = [...new Set([round.metadata?.mission?.critOp,
      ...roundMatches.map(match => match.mission?.critOp || match.result?.killzone?.critOp)].filter(Boolean))];
    headers.push(...ROUND_HEADERS);
    return { title: `Тур ${round.roundNumber}${missions.length ? ` — ${missions.join(" / ")}` : ""}`,
      matches: new Map(roundMatches.flatMap(match => [match.participantAId, match.participantBId]
        .filter(id => id != null).map(id => [id, match]))) };
  });
  const standings = buildStandings(participants, matches, order);
  // Published places may be manually ordered. Match the site's published table.
  const results = tournament.finalResults?.length
    ? tournament.finalResults.map(row => ({ ...row, participant: participantById.get(row.participantId) }))
    : standings;
  const rows = results.filter(row => row.participant).map(row => {
    const participant = row.participant;
    return [row.rank, false, participant.displayName || peopleById.get(participant.userId)?.name || "",
      participant.faction || "", row.matchPoints,
      ...tiebreakers.map(entry => entry ? row[entry[0]] ?? null : null),
      ...groups.flatMap(group => roundValues(group.matches.get(participant.id), participant, participantById, tableById))];
  });
  return { title: tournament.name || "Итоги турнира", headers, rows, summaryColumns, groups: groups.map(g => g.title) };
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const BAG = "http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag";

function escapeXml(value) {
  return String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, "")
    .replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
}

function columnName(index) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

function cell(value, row, col, style = 0) {
  const attrs = `r="${columnName(col)}${row}" s="${style}"`;
  if (value == null) return `<c ${attrs}/>`;
  if (typeof value === "boolean") return `<c ${attrs} t="b"><v>${value ? 1 : 0}</v></c>`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c ${attrs}><v>${value}</v></c>`;
  // All user text stays literal, including nicknames starting with '='.
  return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function tournamentExportXlsx(data) {
  const table = tournamentExportTable(data);
  const lastColumn = columnName(table.headers.length - 1);
  const lastRow = table.rows.length + 2;
  const merges = [`A1:${columnName(table.summaryColumns - 1)}1`];
  const top = [cell(table.title, 1, 0, 2)];
  table.groups.forEach((title, i) => {
    const start = table.summaryColumns + i * 8;
    top.push(cell(title, 1, start, 2));
    merges.push(`${columnName(start)}1:${columnName(start + 7)}1`);
  });
  const columns = table.headers.map((_, i) => {
    const width = i === 2 || i === 3 ? 28 : i >= 5 && i < table.summaryColumns ? 25 : i < 5 ? 18 : 13;
    return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
  }).join("");
  const rows = table.rows.map((values, i) => `<row r="${i + 3}" ht="26" customHeight="1">${values.map((value, col) =>
    cell(value, i + 3, col, col === 1 ? 4 : typeof value === "number" ? 3 : 0)).join("")}</row>`).join("");
  const worksheet = `<worksheet xmlns="${NS}"><dimension ref="A1:${lastColumn}${lastRow}"/>` +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="4" ySplit="2" topLeftCell="E3" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="E3" sqref="E3"/></sheetView></sheetViews>' +
    `<sheetFormatPr defaultRowHeight="26"/><cols>${columns}</cols><sheetData>` +
    `<row r="1" ht="30" customHeight="1">${top.join("")}</row>` +
    `<row r="2" ht="48" customHeight="1">${table.headers.map((value, col) => cell(value, 2, col, 1)).join("")}</row>${rows}</sheetData>` +
    `<autoFilter ref="A2:${lastColumn}${lastRow}"/><mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells></worksheet>`;
  // Native in-cell checkboxes (MS-XLSX 2.3.9). Older spreadsheet viewers retain
  // editable boolean values. No macros, drawings or server-side challenge state.
  const checkbox = `<extLst><ext uri="{C7286773-470A-42A8-94C5-96B5CB345126}" xmlns:xfpb="${BAG}"><xfpb:xfComplement i="0"/></ext></extLst>`;
  const styles = `<styleSheet xmlns="${NS}">` +
    '<fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="13"/><name val="Arial"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF243746"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>' +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/>${checkbox}</xf>` +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const bagPath = "featurePropertyBag/featurePropertyBag.xml";
  const files = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      `<Override PartName="/xl/${bagPath}" ContentType="application/vnd.ms-excel.featurepropertybag+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="Итоги" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag" Target="${bagPath}"/></Relationships>`,
    "xl/styles.xml": styles,
    "xl/worksheets/sheet1.xml": worksheet,
    [`xl/${bagPath}`]: `<FeaturePropertyBags xmlns="${BAG}"><bag type="Checkbox"/><bag type="XFControls"><bagId k="CellControl">0</bagId></bag><bag type="XFComplement"><bagId k="XFControls">1</bagId></bag><bag type="XFComplements" extRef="XFComplementsMapperExtRef"><a k="MappedFeaturePropertyBags"><bagId>2</bagId></a></bag></FeaturePropertyBags>`
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(XML + xml)])), { level: 6 }));
}

module.exports = { tournamentExportTable, tournamentExportXlsx };
