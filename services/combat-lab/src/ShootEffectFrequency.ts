import Ability, {currentAbility} from 'src/Ability';
import type Model from 'src/Model';

export const scopedWeaponRules = ['lethal', 'apx', 'px'] as const;
export type ScopedWeaponRule = typeof scopedWeaponRules[number];
export type ShootWeaponRounds = Partial<Record<ScopedWeaponRule, 'first' | 'second'>>;

export function parseShootWeaponRounds(raw: unknown): ShootWeaponRounds {
  const rounds: ShootWeaponRounds = {};
  if (!raw || typeof raw !== 'object') return rounds;
  for (const key of scopedWeaponRules) {
    const value = (raw as ShootWeaponRounds)[key];
    if (value === 'first' || value === 'second') rounds[key] = value;
  }
  return rounds;
}

export function hasScopedWeaponRule(model: Model): boolean {
  return scopedWeaponRules.some(key => model[key] > 0 && model.shootWeaponRounds[key] !== undefined);
}

// Round numbers are one-based. A rule assigned to a single shot is also
// inactive on rounds three and up when a longer series is selected.
export function attackerForShoot(model: Model, round: number): Model {
  let result = model;
  for (const key of scopedWeaponRules) {
    const scope = model.shootWeaponRounds[key];
    if (model[key] && scope && round !== (scope === 'first' ? 1 : 2))
      result = result.withProp(key, 0);
  }
  return result;
}

export const attackerFrequencyAbilities: readonly Ability[] = [
  Ability.Rending, Ability.Severe, Ability.Punishing, Ability.PuritySeal,
  Ability.MysticScryBuff, Ability.CurseOfRot, Ability.CriticalShot,
];

export const defenderFrequencyAbilities: readonly Ability[] = [
  Ability.Punishing, Ability.Indomitus, Ability.TranshumanPhysiology,
  Ability.JustAScratchNorms, Ability.CurseOfRot, Ability.ObscuredTarget,
  Ability.SurvivalInstincts, Ability.DominoField, Ability.AerialAgility, Ability.Sturdy,
  Ability.ScryProtection, Ability.OmnissiahsImperative,
];

// These last for the whole first Shoot action instead of waiting for a trigger.
export const passiveShootAbilities: readonly Ability[] = [Ability.CurseOfRot, Ability.ObscuredTarget, Ability.OmnissiahsImperative];

export function parseShootOnceAbilities(values: unknown): Ability[] {
  if (!Array.isArray(values)) return [];
  const supported = [...attackerFrequencyAbilities, ...defenderFrequencyAbilities];
  return [...new Set(values.map(value => typeof value === 'string' ? currentAbility(value) : undefined)
    .filter((value): value is Ability => value !== undefined && supported.includes(value)))];
}
