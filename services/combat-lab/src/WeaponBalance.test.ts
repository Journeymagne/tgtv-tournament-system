import fs from 'fs';
import Model from 'src/Model';
import Ability from 'src/Ability';
import FightStrategy from 'src/FightStrategy';
import { calcRemainingWoundPairProbs, consolidateWoundPairProbs } from 'src/CalcEngineFightInternal';
import { calcDmgProbs } from 'src/CalcEngineShoot';

// Harness behind /rules/weapon-balance: scores real weapon profiles against a fixed slate of
// defenders, plain and with the buff that upgrades them, so "are these weapons the same power
// level?" has a reproducible answer instead of an argument.
//
// Skipped unless BALANCE_OUT is set, so it costs nothing in the normal suite. Run with:
//   CI=true BALANCE_OUT=/tmp/balance.json npx react-scripts test --watchAll=false \
//     --testPathPattern WeaponBalance
//
// Fixed seed and fixed simulation count on the Fight side, so a re-run reproduces the published
// numbers exactly rather than landing somewhere within sampling noise of them.
const OUT = process.env.BALANCE_OUT;
const maybeDescribe = OUT ? describe : describe.skip;

const FIGHT_SIMS = 40_000;
const FIGHT_SEED = 24601;
const ATTACKER_WOUNDS = 13; // the operative holding the melee weapon, held constant across weapons

type MeleeWep = {
  name: string; atk: number; hit: number; nd: number; cd: number;
  lethal?: number; reroll?: Ability; abilities?: Ability[];
};

const meleeWeapons: MeleeWep[] = [
  { name: 'Chain weapon', atk: 4, hit: 3, nd: 5, cd: 6, abilities: [Ability.Brutal, Ability.Rending] },
  { name: 'Close Combat Weapon', atk: 3, hit: 4, nd: 4, cd: 5 },
  { name: 'Dread Saw', atk: 5, hit: 3, nd: 4, cd: 5, abilities: [Ability.Rending] },
  { name: 'Flesh Mower', atk: 5, hit: 2, nd: 4, cd: 5, abilities: [Ability.Brutal] },
  { name: 'Power Fist', atk: 4, hit: 3, nd: 6, cd: 8, abilities: [Ability.Brutal, Ability.Shock] },
  { name: 'Power Scourge', atk: 6, hit: 3, nd: 3, cd: 5, lethal: 5 },
  { name: 'Power Talon', atk: 4, hit: 3, nd: 5, cd: 6, lethal: 5, abilities: [Ability.Rending] },
  { name: 'Power Weapon', atk: 4, hit: 3, nd: 5, cd: 7, lethal: 5 },
  { name: 'Scything Talons', atk: 5, hit: 3, nd: 4, cd: 6, reroll: Ability.RerollMostCommonFail },
  { name: 'Thunder Hammer', atk: 4, hit: 3, nd: 6, cd: 8, abilities: [Ability.Shock] },
];

// Melee defenders fight back, so each one is a whole operative: dice, WS, damage, wounds.
const meleeDefenders = [
  { name: 'Horde', atk: 3, hit: 5, nd: 2, cd: 3, wounds: 7 },
  { name: 'Chaff', atk: 3, hit: 4, nd: 3, cd: 4, wounds: 8 },
  { name: 'Trooper', atk: 3, hit: 4, nd: 4, cd: 5, wounds: 10 },
  { name: 'Marine', atk: 4, hit: 3, nd: 4, cd: 5, wounds: 13 },
  { name: 'Elite', atk: 5, hit: 3, nd: 5, cd: 6, wounds: 15 },
];

type ShootWep = {
  name: string; atk: number; hit: number; nd: number; cd: number;
  px?: number;   // Piercing
  apx?: number;  // Piercing Crits
  mwx?: number;  // Devastating
  lethal?: number;
  saturate?: boolean;
  reroll?: Ability;
  abilities?: Ability[];
};

// Supercharge ("hot") profiles are used wherever a weapon has one.
const shootWeapons: ShootWep[] = [
  { name: 'Autocannon', atk: 5, hit: 3, nd: 5, cd: 6 },
  { name: 'Burst Cannon', atk: 5, hit: 3, nd: 3, cd: 4, reroll: Ability.RerollMostCommonFail },
  { name: 'Cyclic Ion Raker', atk: 5, hit: 3, nd: 4, cd: 5, px: 1 },
  { name: 'Flamestorm Cannon', atk: 6, hit: 2, nd: 3, cd: 3 },
  { name: 'Havoc Launcher', atk: 4, hit: 3, nd: 4, cd: 6 },
  { name: 'Heavy Bolter', atk: 5, hit: 3, nd: 4, cd: 5, apx: 1 },
  { name: 'Heavy Flamer', atk: 5, hit: 2, nd: 3, cd: 3, saturate: true },
  { name: 'Heavy Onslaught Gatling Cannon', atk: 6, hit: 3, nd: 4, cd: 5 },
  { name: 'Heavy Phosphor Blaster', atk: 5, hit: 3, nd: 4, cd: 5, saturate: true, abilities: [Ability.Severe] },
  { name: 'Heavy Rail Rifle', atk: 5, hit: 3, nd: 6, cd: 7, px: 2 },
  { name: 'Heavy Stubber', atk: 5, hit: 3, nd: 4, cd: 5 },
  { name: 'Lascannon', atk: 4, hit: 3, nd: 6, cd: 7, px: 2 },
  { name: 'Macro Plasma Incinerator (supercharge)', atk: 5, hit: 3, nd: 5, cd: 6, px: 1, lethal: 5 },
  { name: 'Meltagun', atk: 4, hit: 3, nd: 6, cd: 3, mwx: 4, px: 2 },
  { name: 'Missile Launcher (krak)', atk: 4, hit: 3, nd: 5, cd: 7, px: 1 },
  { name: 'Missile Launcher (frag)', atk: 4, hit: 3, nd: 3, cd: 5 },
  { name: 'Multi-melta', atk: 4, hit: 3, nd: 6, cd: 3, mwx: 4, px: 2 },
  { name: 'Plasma Cannon (supercharge)', atk: 4, hit: 3, nd: 5, cd: 6, px: 1, lethal: 5 },
  { name: 'Plasma Gun (supercharge)', atk: 4, hit: 3, nd: 5, cd: 6, px: 1, lethal: 5 },
  { name: 'Rocket Launcher', atk: 6, hit: 4, nd: 4, cd: 5 },
  { name: 'Shuriken Cannon', atk: 5, hit: 3, nd: 4, cd: 5, abilities: [Ability.Rending] },
  { name: 'Splinter Cannon', atk: 5, hit: 3, nd: 5, cd: 6, lethal: 5 },
  { name: 'Starcannon', atk: 4, hit: 3, nd: 5, cd: 6, px: 1, lethal: 5 },
  { name: 'Stranglethorn Cannon', atk: 4, hit: 3, nd: 3, cd: 5, lethal: 5 },
  { name: 'Thermal Spear', atk: 5, hit: 3, nd: 6, cd: 3, mwx: 4, px: 2 },
];

// Shooting defenders don't shoot back, so each one is a save, a wounds total, and whether it
// is holding cover.
const shootDefenders = [
  { name: 'Horde', save: 5, wounds: 7, cover: 0 },
  { name: 'Chaff', save: 4, wounds: 8, cover: 0 },
  { name: 'Trooper', save: 4, wounds: 10, cover: 1 },
  { name: 'Marine', save: 3, wounds: 13, cover: 0 },
  { name: 'Elite', save: 3, wounds: 15, cover: 1 },
];

function meleeModel(w: MeleeWep, wounds: number): Model {
  const m = new Model(w.atk, w.hit, w.nd, w.cd);
  m.wounds = wounds;
  if (w.lethal) m.lethal = w.lethal;
  if (w.reroll) m.reroll = w.reroll;
  m.abilities = new Set(w.abilities ?? []);
  return m;
}

function shootModel(w: ShootWep): Model {
  const m = new Model(w.atk, w.hit, w.nd, w.cd);
  m.px = w.px ?? 0;
  m.apx = w.apx ?? 0;
  m.mwx = w.mwx ?? 0;
  if (w.lethal) m.lethal = w.lethal;
  if (w.reroll) m.reroll = w.reroll;
  m.abilities = new Set(w.abilities ?? []);
  return m;
}

function expectedWounds(map: Map<number, number>): number {
  let e = 0;
  for (const [w, p] of map) e += w * p;
  return e;
}

function scoreMelee(w: MeleeWep) {
  const targets: Record<string, { dealt: number; taken: number; kill: number }> = {};
  let dealt = 0, taken = 0, kill = 0;

  for (const d of meleeDefenders) {
    const def = new Model(d.atk, d.hit, d.nd, d.cd);
    def.wounds = d.wounds;
    const probs = calcRemainingWoundPairProbs(
      meleeModel(w, ATTACKER_WOUNDS), def,
      FightStrategy.MaxDmgToEnemy, FightStrategy.MaxDmgToEnemy,
      1, FIGHT_SIMS, FIGHT_SEED);
    const [meWounds, themWounds] = consolidateWoundPairProbs(probs);
    const dmgDealt = d.wounds - expectedWounds(themWounds);
    const dmgTaken = ATTACKER_WOUNDS - expectedWounds(meWounds);
    const killProb = themWounds.get(0) ?? 0;
    targets[d.name] = {
      dealt: +dmgDealt.toFixed(3),
      taken: +dmgTaken.toFixed(3),
      kill: +killProb.toFixed(4),
    };
    dealt += dmgDealt; taken += dmgTaken; kill += killProb;
  }

  const n = meleeDefenders.length;
  return {
    name: w.name,
    avgDealt: +(dealt / n).toFixed(3),
    avgTaken: +(taken / n).toFixed(3),
    avgKill: +(kill / n).toFixed(4),
    targets,
  };
}

function scoreShoot(w: ShootWep) {
  const atk = shootModel(w);
  const targets: Record<string, { dmg: number; kill: number }> = {};
  let dmg = 0, kill = 0;

  for (const d of shootDefenders) {
    const def = Model.basicDefender(d.save, d.wounds);
    def.autoNorms = w.saturate ? 0 : d.cover; // Saturate denies the cover save
    const dmgs = calcDmgProbs(atk, def);
    let expDmg = 0, killProb = 0;
    for (const [dmgValue, prob] of dmgs) {
      expDmg += dmgValue * prob;
      if (dmgValue >= d.wounds) killProb += prob;
    }
    targets[d.name] = { dmg: +expDmg.toFixed(3), kill: +killProb.toFixed(4) };
    dmg += expDmg; kill += killProb;
  }

  const n = shootDefenders.length;
  return {
    name: w.name,
    avgDmg: +(dmg / n).toFixed(3),
    avgKill: +(kill / n).toFixed(4),
    targets,
  };
}

maybeDescribe('weapon balance', () => {
  it('scores the melee and shooting profiles, plain and buffed', () => {
    // Melee buff: Paired Weapon adds 1 to the Atk stat of another melee weapon.
    const melee = meleeWeapons.flatMap((w) => [
      { buff: 'none', ...scoreMelee(w) },
      { buff: '+1 Atk', ...scoreMelee({ ...w, atk: w.atk + 1 }) },
    ]);

    // Shooting buff: Twinned grants Ceaseless, except on a Burst Cannon, which adds 1 to Atk.
    const shoot = shootWeapons.flatMap((w) => [
      { buff: 'none', ...scoreShoot(w) },
      w.name === 'Burst Cannon'
        ? { buff: '+1 Atk', ...scoreShoot({ ...w, atk: w.atk + 1 }) }
        : { buff: 'Ceaseless', ...scoreShoot({ ...w, reroll: Ability.RerollMostCommonFail }) },
    ]);

    fs.writeFileSync(OUT!, JSON.stringify({
      fightSims: FIGHT_SIMS,
      fightSeed: FIGHT_SEED,
      attackerWounds: ATTACKER_WOUNDS,
      meleeDefenders,
      shootDefenders,
      melee,
      shoot,
    }, null, 1));

    expect(melee.length).toBe(meleeWeapons.length * 2);
    expect(shoot.length).toBe(shootWeapons.length * 2);
  });
});
