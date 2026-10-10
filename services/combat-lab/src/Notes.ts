export default class Note {
  public name: string;
  public description?: string;

  public constructor(name: string, description?: string) {
    this.name = name;
    this.description = description;
  }
}

export const Reroll = new Note(
  `Reroll`,
  `Balanced rerolls 1 die.  Relentless rerolls fails.`
    + `  Ceasless rerolls most common fail result (ex: reroll 2s); it's called "ceaseless" in KT2024.`
    + `  CritFishRelentless rerolls non-crits.`
    + `  DoubleBalanced rerolls 2 dice.`
    + `  Ones rerolls 1s ("ceaseless" in KT2021).`
    + `  BothOnesAndBalanced rerolls 1s and then rerolls 1 die that hasn't already been rerolled.`
    ,
);
export const NoCover = new Note(
  `NoCover`,
  `Defender can not use cover saves. Intercession Squad's Accurate chapter tactic triggers this only if a crit hit is retained.`,
);
export const ObscuredTarget = new Note(
  `ObscuredTarget`,
  `Attacker crits are retained as norms.  No crit-triggered abilities can trigger.  Discard an attacker success.`,
);
export const AutoNorms = new Note(
  `Accurate`,
  `How many attack dice can be automatically retained as a normal success. Much like cover saves but for attack dice. `
    + `A dice can only be retained once, so these are not promotable by NormsToCrits or Rending ("retain a normal success `
    + `as a critical success instead"); Severe, which changes a success, can still take one. The rule is "retain UP TO x", `
    + `so the calculator retains fewer when rolling those dice is worth more (a high crit chance, or a spare promotion that `
    + `a locked norm would waste), decided before the roll as at the table.`,
);
export const AutoCrits = new Note(
  `AutoCrits`,
  `How many attack dice can be automatically retained as a crit success. Much like cover saves but for attack dice.`,
);
export const FailsToNorms = new Note(
  `FailsToNorms`,
  `How many fails can be modified to normal successes. These are treated as *changed* dice, so NormsToCrits and Rending `
    + `can still promote them. If your rule instead says to *retain* a fail as a normal success, that die has been retained `
    + `and cannot be promoted afterwards. Punishing is modeled that way, but only fits if your rule shares its conditions `
    + `(needs at least one crit, and is switched off against an Obscured target); for an unconditional retain-worded rule `
    + `there is no exact input yet, and FailsToNorms will slightly overstate it whenever the new norm gets promoted.`,
);
export const NormsToCrits = new Note(
  `NormsToCrits`,
  `How many normal successes can be retained as critical successes instead. Because a dice can only be retained once, `
    + `this cannot promote a success that was already retained rather than rolled: cover saves, Accurate, or a Punishing `
    + `fail retention. Rules worded as *changing* a success (Severe, Waaagh) are modeled separately and can take those.`,
);
export const CloseAssault2021 = new Note(
  `CloseAssault2021`,
  `If you have two or more successes, promote a fail to a normal success.  Imperial Navy Breachers strategic ploy.`,
);
export const Rending = new Note(
  `Rending`,
  `If you have >=1 crit, you can retain a norm as a crit instead. Since a dice can only be retained once, it cannot `
    + `promote an Accurate or Punishing retention (only a rolled norm). Rending is optional, so the calculator `
    + `declines the promotion when it deals less damage. On a shoot that comparison is expected damage after the `
    + `defender's saves, cover, Devastating, and Piercing Crits, not the raw dice total.`,
);
export const Severe = new Note(
  `Severe`,
  `If you have no crits, you can change a norm to a crit. Because it changes (rather than retains) a success, it can `
    + `take an already-retained norm such as Accurate. The calculator declines the change when it deals less damage; `
    + `on a shoot that comparison includes saves, cover, Devastating, and Piercing Crits. When Severe does fire, `
    + `Devastating and Piercing Crits still work, but Punishing and Rending don't.`,
);
export const Punishing = new Note(
  `Punishing`,
  `Retain a failed hit as a normal hit if you had at least one critical hit; Necron equipment Starfire Core, Kommando strategic ploy "Dakka! Dakka! Dakka!", Hive Fleet equipment Toxin Sacs, Corsair Voidscarred strategic ploy Outcasts. `
    + `That die has now been retained, so Rending and NormsToCrits cannot promote it. Punishing is optional ("you can `
    + `retain"), so the calculator declines it when taking it deals less damage. On a shoot that comparison is `
    + `expected damage after the defender's saves, cover, and Piercing, not the raw dice total. The shoot score `
    + `includes saves, cover, and Piercing, and does not include Feel No Pain or Saintly Relics.`,
);
export const CoverNormSaves = new Note(
  `Cover Saves`,
  `How many saves can be automatically retained as a normal success. A dice can only be retained once, so a cover save `
    + `cannot then be retained as a critical success: NormsToCrits only promotes saves that came off the dice.`,
);
export const CoverCritSaves = new Note(
  `CoverCritSaves`,
  `How many saves can be automatically retained as a critical success. High enough APx/Px can limit these auto-saves.`,
);
export const JustAScratch2021 = new Note(
  `JaS (Crits)`,
  `Just a Scratch (JaS): Ignore damage from one attack die, choosing whichever die saves the most damage.`,
);
export const JustAScratchNorms = new Note(
  `JaS (Normals)`,
  `Just a Scratch (JaS): Ignore damage from one normal hit only (cannot ignore crits).`,
);
export const PuritySeal = new Note(
  `PuritySeal`,
  `If at least 2 dice fail, discard one fail and change another fail to a normal success; attack only. ` +
  `Note: KT2024 rule strictly requires two unmodified 1s; this calculator triggers on any 2 failed dice, ` +
  `so the benefit is slightly overstated on rolls where fails include non-1 values (e.g. 2s on a 3+ stat).`,
);
export const MysticScryBuff = new Note(
  `Mystic Scry Buff`,
  `In the Roll Attack Dice step, retain one of your fails as a normal success, OR one of your normal successes ` +
  `as a critical success. For each roll the calculator picks whichever option yields more damage, after also ` +
  `resolving Rending — so it correctly seeds a crit for Rending, or adds a norm for Rending to promote, rather ` +
  `than always favoring one. On a shoot, the score is expected damage after the defender's saves, cover, and ` +
  `Piercing. Attack only. In-game: the "Mystic Scry" ability.`,
);
export const Indomitus = new Note(
  `Indomitus`,
  `If at least 2 dice fail, discard one fail and change another fail to a normal success; defense only. ` +
  `Angels of Death Firefight ploy. ` +
  `Note: KT2024 rule strictly requires two unmodified 1s; this calculator triggers on any 2 failed dice, ` +
  `so the benefit is slightly overstated on rolls where fails include non-1 values (e.g. 2s on a 3+ save).`,
);
export const CurseOfRot = new Note(
  `Curse of Rot`,
  `Plague Marines firefight ploy. Tick it on the PLAGUE MARINE. Each 3 the enemy rolls on its attack or defence dice ` +
  `is a fail it can't re-roll, and deals 1 damage to that enemy. Shoot: on the attacker, the defender's 3s ` +
  `fail and add 1 damage each (Feel No Pain applies, Saintly Relics doesn't); on the defender, the attacker's 3s ` +
  `fail (the damage to the attacker isn't shown). Fight: the other fighter's 3s fail and deal 1 damage each before ` +
  `any strike. Only the first roll counts: a 3 on a re-roll is an ordinary result. Assumes the range condition ` +
  `(within 3", or 7" of a poisoned enemy) is met.`,
);
export const HardyX = new Note(
  `HardyX`,
  `HardyX is like Lethal (changes what values give you a critical success), but for defense. Name comes from Intercession Squad chapter tactic Hardy.`,
);
export const FeelNoPain = new Note(
  `FeelNoPain`,
  `FNP is the category of abilities where just before damage is actually resolved, you roll a die for each successful hit (strike). On a roll at or above the threshold, that hit's damage is reduced by 1. Even MWx damage can be prevented via FNP.`,
);
export const SaintlyRelics = new Note(
  `Saintly Relics`,
  `Whenever an attack dice would inflict damage, roll one D6 ("1D6"), or two D6 if the operative is INSPIRING ("2D6"); ` +
  `if any result is a 6, ignore all of that attack dice's damage. At most one attack dice is ignored per action and ` +
  `two per battle; a failed roll doesn't use up either cap. Both calculators target the highest-damage hit (crits before ` +
  `norms): Shoot does this exactly, and over multiple Rounds the two-per-battle cap is enforced across the battle; Fight ` +
  `spends the ignore on a strike only when no larger strike is still pending. ` +
  `Note: mortal (MWx) damage is never ignored, matching Just a Scratch.`,
);
export const AvgDamageUnbounded = new Note(
  `AvgDamageUnbounded`,
  `The average of damage without regard to defender's wounds.`,
);
export const Brutal = new Note(
  `Brutal`,
  `Opponent can not do norm parries.`,
);
export const Shock = new Note(
  `Shock`,
  `First crit strike discards one unresolved enemy normal, or a crit if there are none.`,
);
export const NicheAbility = new Note(
  `NicheAbility`,
  `CloseAssault is Imperial Navy Breachers strategic ploy; if you have two or more successes, promote a fail to a normal success.`
    + `  Dueller2021 is Intercession Squad chapter tactic; each crit parry discards additional 1 norm success of opponent.`
    + `  Hammerhand2021 is Grey Knights psychic power; first strike deals +1 dmg.`
    + `  StormShield2021 is a Custodes ability; each parry discards two successes of opponent instead of 1.`
    + `  Waaagh2021 is Kommandos strategic ploy; if you have two or more normal successes, promote a norm to a crit.`
    + `  MurderousEntrance2021 is a Void Troupe tactical ploy to strike again after a crit strike.`
);
export const Duelist = new Note(
  `Duelist/PreParry`,
  `Do one parry before usual dice resolution.`,
);
export const HalfDamageFirstStrike = new Note(
  `Half Dmg 1st Strike`,
  `First strike damage is halved and rounded up. Strikes of 0, 1, and 2 stay as they are, and a larger strike is not raised.`,
);
export const Dummy = new Note(
  ``,
  ``,
);