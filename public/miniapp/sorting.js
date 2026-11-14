(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KTMiniSorting = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const columns = {
    standings: { rank: 'number', name: 'text', points: 'number', totalVp: 'number', strengthOfSchedule: 'number' },
    operations: { name: 'text', crit: 'number', kill: 'number', tac: 'number', primaryBonus: 'number' },
    games: { round: 'number', name: 'text', status: 'text', score: 'number' },
    pairings: { name: 'text', round: 'number' }
  };
  function sortRows(rows, view, fields, locale) {
    if (!view.key || !Object.hasOwn(fields, view.key)) return rows.slice();
    const type = fields[view.key], sign = view.direction === 'asc' ? 1 : -1;
    const value = row => {
      const raw = row[view.key];
      if (raw == null || String(raw).trim() === '' || ['—', '–', '-'].includes(String(raw).trim())) return null;
      if (type === 'text') return String(raw);
      const number = Number(raw);
      return Number.isFinite(number) ? number : null;
    };
    return rows.map((row, index) => ({ row, index, value: value(row) })).sort((a, b) => {
      if (a.value === null || b.value === null) return a.value === b.value ? a.index - b.index : a.value === null ? 1 : -1;
      const difference = type === 'text' ? a.value.localeCompare(b.value, locale, { numeric: true, sensitivity: 'base' }) : a.value - b.value;
      return difference * sign || a.index - b.index;
    }).map(item => item.row);
  }
  function toggle(view, key, fields) {
    if (!Object.hasOwn(fields, key)) return;
    view.direction = view.key === key ? (view.direction === 'asc' ? 'desc' : 'asc') : fields[key] === 'text' || key === 'rank' ? 'asc' : 'desc';
    view.key = key;
  }
  return { columns, sortRows, toggle };
});
