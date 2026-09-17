// Prefer the achievement name; descriptions may mention unrelated numbers.
function tournamentNumber(name, description = "") {
  for (const text of [name, description]) {
    const event = String(text || "").split(/\s+в составе\s+/i)[0];
    const edition = event.match(/\bE(\d+)\b/i)
      || event.match(/(?:^|\s)(\d+)(?=\s*(?:$|Champ\b|Чамп(?:\s|$)))/i);
    if (edition) return Number(edition[1]);
    const roman = event.match(/\b[IVXLCDM]+\b/g)?.at(-1);
    if (roman && /^(?=[IVXLCDM]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(roman)) {
      const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
      return [...roman].reduce((sum, ch, i) => sum + (values[ch] < (values[roman[i + 1]] || 0) ? -values[ch] : values[ch]), 0);
    }
  }
  return null;
}
module.exports = { tournamentNumber };
