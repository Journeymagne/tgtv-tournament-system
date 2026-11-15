import Ability from "src/Ability";

export default class DieProbs {
  public crit: number;
  public norm: number;
  public fail: number;
  // Odds for a die that is re-rolled later (Balanced, Ceaseless). Normally the same as the first
  // roll; after Curse of Rot the first roll is conditioned on "not a 3" but a re-roll is a fresh D6.
  public rerollProbs: DieProbs;
  // How many faces fail on the first roll; Ceaseless spreads fails evenly across them.
  public failFaces: number;

  public constructor(
    crit: number,
    norm: number,
    fail: number = -1,
    rerollProbs?: DieProbs,
    failFaces?: number,
  ) {
    this.crit = crit;
    this.norm = norm;
    this.fail = fail === -1 ? 1 - crit - norm : fail;
    this.rerollProbs = rerollProbs ?? this;
    this.failFaces = failFaces ?? Math.round(this.fail * 6);
  }

  // Curse of Rot: every 3 on the first roll is a fail that can't be re-rolled. The engines split
  // those dice off (one in six, binomially) and use these odds for the dice that did NOT roll a 3.
  // Re-rolls that happen inside the first-roll odds (Ones, Relentless, CritFishRelentless) use a
  // fresh D6, and so does any later Balanced or Ceaseless re-roll (rerollProbs).
  // RerollOnesPlusBalanced keeps its Balanced step's closed-form 7/6 maths, so it is approximate here.
  public static fromSkillsAfterCurse(critSkill: number, normSkill: number, reroll: Ability): DieProbs {
    const cursedFace = 3;
    const effCritSkill = Math.max(critSkill, normSkill);
    const fresh = DieProbs.fromSkills(critSkill, normSkill, Ability.None);
    const isCrit = (face: number) => face >= effCritSkill;
    const isNorm = (face: number) => !isCrit(face) && face >= normSkill;
    const isFail = (face: number) => !isCrit(face) && !isNorm(face);
    const rerolledInFirstRoll = (face: number): boolean => {
      switch (reroll) {
        case Ability.RerollOnes:
        case Ability.RerollOnesPlusBalanced:
          return face === 1;
        case Ability.Relentless:
          return isFail(face);
        case Ability.CritFishRelentless:
          return !isCrit(face);
        default:
          return false;
      }
    };

    const faces = [1, 2, 3, 4, 5, 6].filter(face => face !== cursedFace);
    const faceProb = 1 / faces.length;
    let crit = 0;
    let norm = 0;
    let failFaces = 0;
    for (const face of faces) {
      if (isFail(face)) {
        failFaces++;
      }
      if (rerolledInFirstRoll(face)) {
        crit += faceProb * fresh.crit;
        norm += faceProb * fresh.norm;
      }
      else if (isCrit(face)) {
        crit += faceProb;
      }
      else if (isNorm(face)) {
        norm += faceProb;
      }
    }
    return new DieProbs(crit, norm, 1 - crit - norm, fresh, failFaces);
  }

  public static fromSkills(critSkill: number, normSkill: number, reroll: Ability) {
    // lethal must not promote a die that would have failed: clamp critSkill >= normSkill
    // (e.g. BS=6+, lethal=5+ → a 5 still fails; only a 6 crits)
    const effCritSkill = Math.max(critSkill, normSkill);
    // BEFORE taking RerollOnes and relentless into account
    let critHitProb = (7 - effCritSkill) / 6;
    let normHitProb = Math.max(0, (effCritSkill - normSkill) / 6);
    let failHitProb = 1 - critHitProb - normHitProb;

    // now to take RerollOnes and relentless into account...
    // (balanced can not be taken into account at this layer and is handled later)
    if (reroll === Ability.RerollOnes
      || reroll === Ability.Relentless
      || reroll === Ability.RerollOnesPlusBalanced
    ) {
      // The 7/6 factor assumes a rolled 1 is a failure. On a 1+ stat nothing can
      // fail (fail is 0, or a float residue of 0), so that factor pushes crit+norm
      // above 1. Relentless only rerolls fails, so it is already a no-op here.
      // RerollOnes still rerolls the face: a normal 1 can come up a crit.
      const oneIsAlreadyASuccess = reroll !== Ability.Relentless
        && normSkill <= 1
        && Math.abs(failHitProb) <= 1e-9;
      if (oneIsAlreadyASuccess) {
        if (effCritSkill > 1) {
          const pOne = 1 / 6;
          critHitProb += pOne * critHitProb;
          normHitProb = (normHitProb - pOne) + pOne * normHitProb;
        }
        const kept = critHitProb + normHitProb;
        critHitProb /= kept;
        normHitProb /= kept;
        failHitProb = 0;
      }
      else {
        const rerollMultiplier = reroll === Ability.Relentless
          ? 1 + failHitProb
          : 7 / 6;
        critHitProb *= rerollMultiplier;
        normHitProb *= rerollMultiplier;
        failHitProb = 1 - critHitProb - normHitProb;
      }
    }
    else if (reroll === Ability.CritFishRelentless) {
      const noncritProb = 1 - critHitProb;
      failHitProb *= noncritProb;
      normHitProb *= noncritProb;
      critHitProb *= 2 - critHitProb;
    }

    return new DieProbs(critHitProb, normHitProb, failHitProb);
  }

  public toCritNormFail(): number[] {
    return [this.crit, this.norm, this.fail];
  }

}
