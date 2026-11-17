import Ability, {mutuallyExclusiveFightAbilities} from 'src/Ability';

// These alter the entire duel rather than spending a resource at a particular trigger.
export const passiveFightAbilities: readonly Ability[] = [
  Ability.Brutal, Ability.Dueller, Ability.TiltingShields, Ability.CurseOfRot,
];

// These rules can either refresh per Fight action or share one use across the sequence.
export const frequencyLimitedFightAbilities: readonly Ability[] = [
  Ability.JustAScratch,
  Ability.JustAScratchNorms,
  Ability.PreParry,
  Ability.PuritySeal,
  Ability.Rending,
  Ability.Severe,
  Ability.Punishing,
  Ability.MysticScryBuff,
  Ability.BlessingsOfInfection,
  Ability.StrikeOnDeath,
  Ability.CegorachsJest,
  Ability.DoubleBlock,
  Ability.CritDamageBonus,
  Ability.FirstStrikeBonus,
  Ability.Shock,
  Ability.HalfDamageFirstStrike,
  ...passiveFightAbilities,
  ...mutuallyExclusiveFightAbilities.filter(ability => ability !== Ability.None),
];

export function parseFightOnceAbilities(values: unknown): Ability[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is Ability =>
    frequencyLimitedFightAbilities.includes(value)))];
}
