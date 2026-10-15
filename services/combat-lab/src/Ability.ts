import { extractFromSet } from "src/Util";

export enum Ability {
    None = 'X',

    // rerolls
    Balanced = "Balanced", // reroll 1 die; also used for Extended Chitin during defense
    DoubleBalanced = "DoubleBalanced", // reroll 2 dice; basicially single reroll ability from two different sources
    RerollOnes = "Ones", // reroll all 1s, was called ceaseless in 2021
    Relentless = "Relentless", // reroll any of your choosing; we choose to reroll all fails; we never fish for crits
    CritFishRelentless = "CritFishRelentless", // reroll all non-crits, aka crit fishing
    RerollOnesPlusBalanced = "BothOnesAndBalanced", // ex: in 2021, Auto Bolt Rifle and Devastator Doctrine
    RerollMostCommonFail = "Ceaseless", // "can re-roll any or all of your attack dice results of one result (e.g. results of 2)"
    RerollMostCommonFailPlusBalanced = "CeaselessPlusBalanced", // reroll most common fail, then reroll 1 additional die that wasn't rerolled

    // fail/norm/crit manipulation
    Severe = "Severe", // if no crits, promote one normal hit to crit
    Rending = "Rending", // if have crit, promote one normal hit to crit
    Punishing = "Punishing", // crit triggers promotion of fail to norm; 2024 Punishing; 2021: Starfire, DakkaDakkaDakka, Toxin Sacs
    JustAScratch = "JustAScratch", // cancel one attack die just before damage; both shoot and fight; shoot picks the die that minimizes damage
    JustAScratchNorms = "JustAScratchNorms", // cancel one normal hit just before damage
    HalfDamageFirstStrike = "HalfDamageFirstStrike", // first strike damage is halved and rounded up, never below 2 and never above the strike; a 0 or 1 is unchanged
    ObscuredTarget = "ObscuredTarget", // all crits become norms; can't do crit-triggered abilities; discard a success at the end
    PuritySeal = "PuritySeal", // 2024; if at least 2 dice fail, discard one fail and change another fail to a normal success; attack only. Rule strictly requires two unmodified 1s; implementation triggers on any 2 fails.
    MysticScryBuff = "MysticScryBuff", // attack only; retain one fail as a norm OR one norm as a crit, attacker's choice (best per damage). In-game: the "Mystic Scry" ability.
    CurseOfRot = "CurseOfRot", // Plague Marines firefight ploy; set on the PLAGUE MARINE: each 3 the ENEMY rolls on its attack or defence dice is a fail it can't re-roll, and inflicts 1 damage on that enemy
    Indomitus = "Indomitus", // 2024; if at least 2 dice fail, discard one fail and change another fail to a normal success; defense only (Space Marines defending ANGEL OF DEATH). Rule strictly requires two unmodified 1s; implementation triggers on any 2 fails.

    // fight stuff relevant to 2024
    Brutal = "Brutal", // opponent can only parry with crit
    Shock = "Shock", // first crit strike discards one unresolved enemy normal, or a crit if there are none

    Dueller = "Dueller", // normal successes can block critical successes, except against Brutal
    PreParry = "PreParry",
    StrikeOnDeath = "StrikeOnDeath",
    CegorachsJest = "CegorachsJest",
    DoubleBlock = "DoubleBlock", // one enhanced block per fight: normal blocks crit, or crit blocks two
    BlessingsOfInfection = "BlessingsOfInfection",
    CritDamageBonus = "CritDamageBonus", // +1 damage on one chosen critical strike
    FirstStrikeBonus = "FirstStrikeBonus", // +1 damage on the first normal OR critical strike
    StealthAssault = "StealthAssault",
    TiltingShields = "TiltingShields", // enemy cannot retain rolled results below 6 as critical successes
    CriticalStrike = "Critical+Strike",
    StrikeStrike = "Strike+Strike", // after the first strike, immediately strike with another success

};

export const rerollAbilities = [
  Ability.Balanced,
  Ability.DoubleBalanced,
  Ability.RerollMostCommonFail,
  Ability.Relentless,
  Ability.CritFishRelentless,
  Ability.RerollOnes,
  Ability.RerollOnesPlusBalanced,
  Ability.RerollMostCommonFailPlusBalanced,
];

export const mutuallyExclusiveFightAbilities = [
  Ability.None,
  Ability.CriticalStrike,
  Ability.StrikeStrike,
  Ability.StealthAssault,
];

export const fightAbilityLabels: Readonly<Record<string, string>> = {
  [Ability.CriticalStrike]: 'Critical+Strike',
  [Ability.StealthAssault]: 'Stealth Assault',
  [Ability.StrikeOnDeath]: 'Strike On Death',
  [Ability.CegorachsJest]: "Cegorach's Jest",
  [Ability.DoubleBlock]: 'Double Block or Norm Blocks Crit',
  [Ability.BlessingsOfInfection]: 'Blessings of Infection',
  [Ability.CritDamageBonus]: '+1 DMG on 1 Crit',
  [Ability.FirstStrikeBonus]: '+1 DMG on First Strike',
  [Ability.TiltingShields]: 'Tilting Shields',
};

// Only equivalent, neutrally named effects migrate. Removed rules must not silently
// turn into a different 2024 rule (in particular Dueller2021 != Dueller).
export function currentAbility(value: string): Ability | undefined {
  const aliases: Record<string, Ability> = {
    MurderousEntrance2021: Ability.CriticalStrike,
    Hammerhand2021: Ability.FirstStrikeBonus,
    Duelist2021: Ability.PreParry,
  };
  return aliases[value] ?? (Object.values(Ability).includes(value as Ability) ? value as Ability : undefined);
}

export const rendingAndSevereAbilities = [
  Ability.None,
  Ability.Rending,
  Ability.Severe,
];

export function extractAbility(desiredAbility: Ability, abilities: Set<Ability>): Ability | null {
  return extractFromSet([desiredAbility], Ability.None, abilities);
}

export default Ability;
