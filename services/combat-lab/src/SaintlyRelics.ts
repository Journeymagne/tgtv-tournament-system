import { thickX } from 'src/Util';

// Saintly Relics: whenever an attack dice would inflict damage on an operative, you may
// roll for it; if any rolled D6 is a 6, ignore all of that attack dice's damage. At most
// one attack dice can be ignored per action. Two modes:
//   Normal    => roll one D6
//   Inspiring => roll two D6 (the operative is INSPIRING)
export const SaintlyRelicsOff = 0;
export const SaintlyRelicsNormal = 1; // roll one D6
export const SaintlyRelicsInspiring = 2; // roll two D6 (INSPIRING)

// at most this many attack dice can be ignored across a whole battle
export const maxRelicIgnoresPerBattle = 2;

// number of D6 rolled per attempt (per damaging attack dice).
// Unknown/off modes return 0 so the fight engine ignores nothing — keeping it consistent with
// relicIgnoreProb (which returns 0 for those), so the two engines never disagree on an odd value.
export function relicDiceCount(mode: number): number {
  if (mode === SaintlyRelicsInspiring) return 2;
  if (mode === SaintlyRelicsNormal) return 1;
  return 0;
}

// probability a single attempt ignores that attack dice's damage:
// the chance of at least one 6 across the rolled D6.
// normal: 1/6; inspiring: 1 - (5/6)^2 = 11/36
export function relicIgnoreProb(mode: number): number {
  if (mode === SaintlyRelicsInspiring) return 11 / 36;
  if (mode === SaintlyRelicsNormal) return 1 / 6;
  return 0;
}

// decode a mode from URL text, treating anything unrecognized as off (so a corrupted share link
// can't make the Shoot and Fight engines interpret an out-of-range value differently)
export function parseRelicMode(raw: string | undefined): number {
  // Number() (unlike parseInt) rejects partially-numeric junk like "2x" as NaN, so malformed
  // URL state falls back to off instead of mapping to a valid mode.
  const mode = Number(raw);
  return Number.isInteger(mode) && (mode === SaintlyRelicsNormal || mode === SaintlyRelicsInspiring)
    ? mode
    : SaintlyRelicsOff;
}

// IncDecSelect labels; first entry (off) must be the default so the control hides when unused
export const relicModeToLabel = new Map<number, string>([
  [SaintlyRelicsOff, thickX],
  [SaintlyRelicsNormal, '1D6'],
  [SaintlyRelicsInspiring, '2D6'],
]);
