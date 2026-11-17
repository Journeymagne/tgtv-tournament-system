import Ability from 'src/Ability';

export const attackerFrequencyAbilities: readonly Ability[] = [
  Ability.Rending, Ability.Severe, Ability.Punishing, Ability.PuritySeal,
  Ability.MysticScryBuff, Ability.CurseOfRot,
];

export const defenderFrequencyAbilities: readonly Ability[] = [
  Ability.Punishing, Ability.Indomitus, Ability.TranshumanPhysiology,
  Ability.JustAScratch, Ability.JustAScratchNorms, Ability.CurseOfRot, Ability.ObscuredTarget,
];

// These last for the whole first Shoot action instead of waiting for a trigger.
export const passiveShootAbilities: readonly Ability[] = [Ability.CurseOfRot, Ability.ObscuredTarget];

export function parseShootOnceAbilities(values: unknown): Ability[] {
  if (!Array.isArray(values)) return [];
  const supported = [...attackerFrequencyAbilities, ...defenderFrequencyAbilities];
  return [...new Set(values.filter((value): value is Ability => supported.includes(value)))];
}
