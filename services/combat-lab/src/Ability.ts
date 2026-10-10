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
    FailToNormIfAtLeastTwoSuccesses = "CloseAssault", // if at least two successes, promote fail to norm; from Imperial Navy Breachers Close Assault
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

    // fight stuff relevant to only 2021 or I have not checked for 2024
    StormShield2021 = "StormShield2021", // each parry cancels two successes
    Hammerhand2021 = "Hammerhand2021", // first strike does one extra dmg
    Dueller = "Dueller2021", // each crit parry cancels extra normal success
    Duelist = "Duelist2021", // parry before usual dice resolution
    NormToCritIfAtLeastTwoNorms = "Waaagh2021", // if at least two norms, promote norm to crit; from Kommandos Waaagh; fight only
    MurderousEntrance2021 = "MurderousEntrance2021", // after a crit strike, do another strike (tactical ploy, so just once)

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
  Ability.FailToNormIfAtLeastTwoSuccesses,
  Ability.Dueller,
  Ability.Hammerhand2021,
  Ability.StormShield2021,
  Ability.NormToCritIfAtLeastTwoNorms,
  Ability.MurderousEntrance2021,
];

export const rendingAndSevereAbilities = [
  Ability.None,
  Ability.Rending,
  Ability.Severe,
];

export function extractAbility(desiredAbility: Ability, abilities: Set<Ability>): Ability | null {
  return extractFromSet([desiredAbility], Ability.None, abilities);
}

export default Ability;