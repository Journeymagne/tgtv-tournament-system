(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./maps/catalog.json') : root.TGTVMapCatalogData);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TGTVMapCatalog = api;
})(globalThis, function (data) {
  'use strict';
  // Unversioned Volkus is deliberately not resolved: its historical edition is unknown.
  const aliases = { 'Bheta-Decima': 'Bheta-Decima 2025', Octarius: 'Octarius 2025',
    'WTC ITD': 'WTC ITD 2026', 'WTC Open': 'WTC Open 2025', 'Non-specific': 'Non-Specific Killzone' };
  function mapsFor(set) { return data.maps.filter(map => map.set === (aliases[set] || set)); }
  function find(table) { return mapsFor(table?.killzone).find(map => map.slot === Number(table?.deployment || table?.layout)); }
  function validLayout(set, value) {
    const number = Number(value), maps = mapsFor(set);
    return Number.isInteger(number) && (maps.length ? maps.some(map => map.slot === number) : number >= 1 && number <= 6);
  }
  return { ...data, mapsFor, find, validLayout };
});
