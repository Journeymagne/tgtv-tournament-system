const team = 'https://wahapedia.ru/kill-team3/kill-teams/hand-of-the-archon/';
const core = 'https://wahapedia.ru/kill-team3/the-rules/core-rules/';
const appendix = 'https://wahapedia.ru/kill-team3/the-rules/appendix/';
// Section anchors are present in the source pages. Text fragments target rules
// without their own anchor; browsers without fragment support open the section.
const link = (base, anchor, title, text) => ({title, url: `${base}#${anchor}${text ? ':~:text=' + encodeURIComponent(text) : ''}`});
const faction = (anchor, title, text) => link(team, anchor, title, text);
const inv = name => faction('Invigorations', name, name);
const pain = faction('Power-From-Pain', 'Power From Pain');
const rifles = faction('Rifles', 'Rifles');
const strategy = name => faction('Strategy-Ploys', name, name.toUpperCase());
const firefight = name => faction('Firefight-Ploys', name, name.toUpperCase());
const equipment = name => faction('Faction-Equipment', name, name.toUpperCase());
const operative = (name, rule) => faction('Kabalite-' + name.replaceAll(' ', '-'), rule, rule);
const basic = (anchor, title = anchor) => link(core, anchor, title);
const weapon = name => link(appendix, 'WEAPON-RULES', name, name);
const assassin = rule => operative('Skysplinter Assassin', rule);
const flayer = rule => operative('Flayer', rule);
const duellist = rule => operative('Crimson Duellist', rule);
const disciple = rule => operative('Disciple of Yaelindra', rule);
const elixicant = rule => operative('Elixicant', rule);
const merciless = strategy('Merciless Sadists');
const prey = firefight('Prey on the Wounded');
const darkness = strategy('From Darkness, Death');
const toxin = equipment('Toxin Coating');
const refined = equipment('Refined Poison');
const snare = equipment('Chain Snare');
const counteract = basic('Counteract');

module.exports = {
  'hoa-001': [pain, inv('Dark Animus'), inv('Stimulated Senses'), inv('Accelerated Rejuvenation')],
  'hoa-002': [inv('Stimulated Senses')],
  'hoa-003': [inv('Dark Animus')],
  'hoa-004': [pain],
  'hoa-005': [operative('Agent', 'Sadistic Competition'), pain],
  'hoa-006': [flayer('Flay'), basic('Fight')],
  'hoa-007': [flayer('Flay'), basic('Fight')],
  'hoa-008': [flayer('Flay')],
  'hoa-009': [rifles, basic('Dash')],
  'hoa-010': [rifles, counteract],
  'hoa-011': [merciless, prey, basic('Damage', 'Damage · wounded / injured')],
  'hoa-012': [merciless, prey],
  'hoa-013': [strategy('Blade Artists'), merciless, toxin, basic('Fight')],
  'hoa-014': [darkness, basic('Orders')],
  'hoa-015': [darkness, assassin('Merciless Hunter')],
  'hoa-016': [darkness, strategy('Blade Artists'), weapon('Rending')],
  'hoa-017': [strategy('Denizens of Night')],
  'hoa-018': [strategy('Denizens of Night')],
  'hoa-019': [firefight('Devious Scheme')],
  'hoa-020': [firefight('Devious Scheme')],
  'hoa-021': [snare],
  'hoa-022': [snare],
  'hoa-023': [snare, basic('Fall-Back', 'Fall Back')],
  'hoa-024': [duellist('Tangle'), weapon('Brutal'), basic('Fight')],
  'hoa-025': [duellist('Tangle'), basic('Fight')],
  'hoa-026': [duellist('Brutal Display')],
  'hoa-027': [duellist('Brutal Display'), basic('Markers')],
  'hoa-028': [disciple('Stinger')],
  'hoa-029': [disciple('Stinger')],
  'hoa-030': [disciple('Torment Grenade')],
  'hoa-031': [disciple('Torment Grenade')],
  'hoa-032': [disciple('Torment Grenade'), counteract],
  'hoa-033': [elixicant('Hypex'), basic('Damage', 'Damage · injured')],
  'hoa-034': [elixicant('Administer Drug'), elixicant('Combat Drugs')],
  'hoa-035': [elixicant('Painbringer')],
  'hoa-036': [flayer('Insensible to Pain'), weapon('Devastating')],
  'hoa-037': [assassin('Merciless Hunter'), assassin('MARK')],
  'hoa-038': [assassin('Merciless Hunter'), weapon('Silent')],
  'hoa-039': [assassin('MARK'), weapon('Seek'), basic('Cover')],
  'hoa-040': [assassin('MARK')],
  'hoa-041': [assassin('Omen'), basic('Dice-D6-D3-', 'Dice · повторные броски')],
  'hoa-042': [assassin('Omen'), weapon('Lethal')],
  'hoa-043': [refined, assassin('Shardcarbine'), weapon('Devastating')],
  'hoa-044': [refined, operative('Heavy Gunner', 'Splinter cannon (sweeping)'), weapon('Torrent')],
  'hoa-045': [toxin, duellist('Crimson Duellist')],
  'hoa-046': [equipment('Wicked Blades'), operative('Agent', 'Array of blades'), duellist('Razorflail'), flayer('Pain sculptors')],
  'hoa-047': [firefight('Cruel Deception'), rifles, basic('Fall-Back', 'Fall Back')],
  'hoa-048': [faction('Operatives', 'Состав команды · darklight weapons')],
  'hoa-049': [inv('Vitalised Surge'), basic('Charge'), basic('Dash')],
  'hoa-050': [inv('Vitalised Surge'), basic('Dash'), basic('Control-Range', 'Control Range')],
  'hoa-051': [inv('Vitalised Surge'), counteract, weapon('Heavy')],
  'hoa-052': [pain, inv('Stimulated Senses'), assassin('Merciless Hunter')],
};
