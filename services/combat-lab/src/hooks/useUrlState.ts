import { useCallback, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Model from 'src/Model';
import ShootOptions from 'src/ShootOptions';
import FightOptions from 'src/FightOptions';
import FightStrategy from 'src/FightStrategy';
import Ability, { mutuallyExclusiveFightAbilities } from 'src/Ability';
import { parseRelicMode } from 'src/SaintlyRelics';
import { CalculatorViewChoice, FIGHT_CALCULATOR_PATH, viewToUrlText } from 'src/CalculatorViewChoice';

interface SituationState {
  attacker: Model;
  defender: Model;
  shootOptions: ShootOptions;
}

interface FightState {
  fighterA: Model;
  fighterB: Model;
  fightOptions: FightOptions;
}

// Encode attacker to URL param string
function encodeAttacker(atk: Model): string {
  const abilities: string[] = [];
  if (atk.has(Ability.Rending)) abilities.push('rend');
  if (atk.has(Ability.Severe)) abilities.push('sev');
  if (atk.has(Ability.Punishing)) abilities.push('pun');
  if (atk.has(Ability.PuritySeal)) abilities.push('purity');
  if (atk.has(Ability.MysticScryBuff)) abilities.push('mscry');
  if (atk.has(Ability.FailToNormIfAtLeastTwoSuccesses)) abilities.push('close');
  if (atk.has(Ability.CurseOfRot)) abilities.push('curse');

  return [
    atk.numDice,
    atk.diceStat,
    atk.normDmg,
    atk.critDmg,
    atk.mwx,
    atk.apx,
    atk.px,
    atk.reroll,
    atk.lethal,
    atk.autoNorms,
    atk.autoCrits,
    atk.failsToNorms,
    atk.normsToCrits,
    abilities.join('')
  ].join(':');
}

// Encode defender to URL param string
function encodeDefender(def: Model): string {
  const abilities: string[] = [];
  if (def.has(Ability.Indomitus)) abilities.push('ind');
  if (def.has(Ability.ObscuredTarget)) abilities.push('obs');
  if (def.has(Ability.JustAScratch)) abilities.push('jasc');
  if (def.has(Ability.JustAScratchNorms)) abilities.push('jasn');
  if (def.has(Ability.Punishing)) abilities.push('pun');
  if (def.has(Ability.CurseOfRot)) abilities.push('curse');

  return [
    def.diceStat,
    def.wounds,
    def.autoNorms,
    def.autoCrits,
    def.normsToCrits,
    def.failsToNorms,
    def.hardyx,
    def.fnp,
    def.reroll,
    abilities.join(''),
    def.saintlyRelics
  ].join(':');
}

// Encode shoot options to URL param string
function encodeShootOptions(opts: ShootOptions): string {
  return `${opts.numRounds}`;
}

// Decode shoot options from URL param string
function decodeShootOptions(param: string): ShootOptions {
  const opts = new ShootOptions();
  opts.numRounds = parseInt(param) || 1;
  return opts;
}

// Decode attacker from URL param string
function decodeAttacker(param: string): Model {
  const parts = param.split(':');
  // Support old 11-field format and new 14-field format
  if (parts.length < 11) return new Model();

  const atk = new Model();
  atk.numDice = parseInt(parts[0]) || 4;
  atk.diceStat = parseInt(parts[1]) || 3;
  const normDmg = parseInt(parts[2]);
  const critDmg = parseInt(parts[3]);
  atk.normDmg = Number.isNaN(normDmg) ? 3 : normDmg;
  atk.critDmg = Number.isNaN(critDmg) ? 4 : critDmg;
  atk.mwx = parseInt(parts[4]) || 0;
  atk.apx = parseInt(parts[5]) || 0;
  atk.px = parseInt(parts[6]) || 0;
  atk.reroll = (parts[7] as Ability) || Ability.None;
  atk.lethal = parseInt(parts[8]) || 0;
  atk.autoNorms = parseInt(parts[9]) || 0;

  if (parts.length >= 14) {
    // New format with all fields
    atk.autoCrits = parseInt(parts[10]) || 0;
    atk.failsToNorms = parseInt(parts[11]) || 0;
    atk.normsToCrits = parseInt(parts[12]) || 0;

    const abilities = parts[13] || '';
    if (abilities.includes('rend')) atk.abilities.add(Ability.Rending);
    if (abilities.includes('sev')) atk.abilities.add(Ability.Severe);
    if (abilities.includes('pun')) atk.abilities.add(Ability.Punishing);
    if (abilities.includes('purity')) atk.abilities.add(Ability.PuritySeal);
    if (abilities.includes('mscry')) atk.abilities.add(Ability.MysticScryBuff);
    if (abilities.includes('close')) atk.abilities.add(Ability.FailToNormIfAtLeastTwoSuccesses);
    if (abilities.includes('curse')) atk.abilities.add(Ability.CurseOfRot);
  } else {
    // Old 11-field format (backward compat)
    const abilities = parts[10] || '';
    if (abilities.includes('rend')) atk.abilities.add(Ability.Rending);
    if (abilities.includes('sev')) atk.abilities.add(Ability.Severe);
    if (abilities.includes('pun')) atk.abilities.add(Ability.Punishing);
  }

  return atk;
}

// Decode defender from URL param string
function decodeDefender(param: string): Model {
  const parts = param.split(':');
  if (parts.length < 3) return Model.basicDefender();

  const def = Model.basicDefender();
  def.diceStat = parseInt(parts[0]) || 3;
  def.wounds = parseInt(parts[1]) || 12;
  def.autoNorms = parseInt(parts[2]) || 0;

  if (parts.length >= 10) {
    // New format with all fields
    def.autoCrits = parseInt(parts[3]) || 0;
    def.normsToCrits = parseInt(parts[4]) || 0;
    def.failsToNorms = parseInt(parts[5]) || 0;
    def.hardyx = parseInt(parts[6]) || 0;
    def.fnp = parseInt(parts[7]) || 0;
    def.reroll = (parts[8] as Ability) || Ability.None;

    const abilities = parts[9] || '';
    if (abilities.includes('ind')) def.abilities.add(Ability.Indomitus);
    if (abilities.includes('obs')) def.abilities.add(Ability.ObscuredTarget);
    if (abilities.includes('jasc')) def.abilities.add(Ability.JustAScratch);
    if (abilities.includes('jasn')) def.abilities.add(Ability.JustAScratchNorms);
    if (abilities.includes('pun')) def.abilities.add(Ability.Punishing);
    if (abilities.includes('curse')) def.abilities.add(Ability.CurseOfRot);
  } else {
    // Old 4-field format (backward compat)
    const abilities = parts[3] || '';
    if (abilities.includes('ind')) def.abilities.add(Ability.Indomitus);
  }

  // appended after abilities; absent in older URLs and sanitized to off for unrecognized values
  def.saintlyRelics = parseRelicMode(parts[10]);

  return def;
}

// Encode fighter to URL param string (fight page)
function encodeFighter(f: Model): string {
  const abilities: string[] = [];
  if (f.has(Ability.Rending)) abilities.push('rend');
  if (f.has(Ability.Severe)) abilities.push('sev');
  if (f.has(Ability.Brutal)) abilities.push('bru');
  if (f.has(Ability.Punishing)) abilities.push('pun');
  if (f.has(Ability.PuritySeal)) abilities.push('purity');
  if (f.has(Ability.MysticScryBuff)) abilities.push('mscry');
  if (f.has(Ability.Duelist)) abilities.push('duelist');
  if (f.has(Ability.JustAScratch)) abilities.push('jas');
  if (f.has(Ability.Shock)) abilities.push('shock');
  // Keep this token distinct from 'jas', which enables the other scratch ability.
  if (f.has(Ability.JustAScratchNorms)) abilities.push('scratchnorm');
  if (f.has(Ability.HalfDamageFirstStrike)) abilities.push('halfstrike');
  if (f.has(Ability.CurseOfRot)) abilities.push('curse');

  // Niche ability (mutually exclusive fight abilities)
  const nicheAbility = mutuallyExclusiveFightAbilities.find(a => a !== Ability.None && f.abilities.has(a));

  return [
    f.wounds,
    f.numDice,
    f.diceStat,
    f.normDmg,
    f.critDmg,
    f.reroll,
    f.lethal,
    f.autoNorms,
    f.autoCrits,
    f.normsToCrits,
    f.failsToNorms,
    nicheAbility || '',
    abilities.join(''),
    f.saintlyRelics,
    f.fnp
  ].join(':');
}

// Decode fighter from URL param string (fight page)
function decodeFighter(param: string): Model {
  const parts = param.split(':');
  if (parts.length < 12) return new Model();

  const f = new Model();
  f.wounds = parseInt(parts[0]) || 12;
  f.numDice = parseInt(parts[1]) || 4;
  f.diceStat = parseInt(parts[2]) || 3;
  f.normDmg = parseInt(parts[3]) || 3;
  f.critDmg = parseInt(parts[4]) || 4;
  f.reroll = (parts[5] as Ability) || Ability.None;
  f.lethal = parseInt(parts[6]) || 0;
  f.autoNorms = parseInt(parts[7]) || 0;
  f.autoCrits = parseInt(parts[8]) || 0;
  f.normsToCrits = parseInt(parts[9]) || 0;
  f.failsToNorms = parseInt(parts[10]) || 0;

  // Niche ability
  const nicheStr = parts[11] || '';
  if (nicheStr) {
    const nicheAbility = mutuallyExclusiveFightAbilities.find(a => a === nicheStr);
    if (nicheAbility) f.abilities.add(nicheAbility);
  }

  // Boolean abilities
  const abilities = parts[12] || '';
  if (abilities.includes('rend')) f.abilities.add(Ability.Rending);
  if (abilities.includes('sev')) f.abilities.add(Ability.Severe);
  if (abilities.includes('bru')) f.abilities.add(Ability.Brutal);
  if (abilities.includes('pun')) f.abilities.add(Ability.Punishing);
  if (abilities.includes('purity')) f.abilities.add(Ability.PuritySeal);
  if (abilities.includes('mscry')) f.abilities.add(Ability.MysticScryBuff);
  if (abilities.includes('duelist')) f.abilities.add(Ability.Duelist);
  if (abilities.includes('jas')) f.abilities.add(Ability.JustAScratch);
  if (abilities.includes('shock')) f.abilities.add(Ability.Shock);
  if (abilities.includes('scratchnorm')) f.abilities.add(Ability.JustAScratchNorms);
  if (abilities.includes('halfstrike')) f.abilities.add(Ability.HalfDamageFirstStrike);
  if (abilities.includes('curse')) f.abilities.add(Ability.CurseOfRot);

  // appended after abilities; absent in older URLs and sanitized to off for unrecognized values
  f.saintlyRelics = parseRelicMode(parts[13]);
  // Append FNP so older links retain their field positions and default to off.
  // Legal thresholds match Shoot and the rules: 4+, 5+, and 6+. A 2+ or 3+
  // from an older fight link degrades to off rather than a value the control
  // no longer offers.
  const fnp = Number(parts[14]);
  f.fnp = Number.isInteger(fnp) && fnp >= 4 && fnp <= 6 ? fnp : 0;

  return f;
}

// Encode fight options to URL param string
function encodeFightOptions(opts: FightOptions): string {
  return [
    opts.strategyFighterA,
    opts.strategyFighterB,
    opts.firstFighter,
    opts.numRounds,
  ].join(':');
}

// Decode fight options from URL param string
function decodeFightOptions(param: string): FightOptions {
  const parts = param.split(':');
  const opts = new FightOptions();
  if (parts.length < 4) return opts;

  const stratA = parts[0] as FightStrategy;
  if (Object.values(FightStrategy).includes(stratA)) opts.strategyFighterA = stratA;
  const stratB = parts[1] as FightStrategy;
  if (Object.values(FightStrategy).includes(stratB)) opts.strategyFighterB = stratB;
  if (parts[2] === 'A' || parts[2] === 'B') opts.firstFighter = parts[2];
  opts.numRounds = parseInt(parts[3]) || 1;

  return opts;
}

export function getFightStateFromUrl(): FightState | null {
  const params = new URLSearchParams(window.location.search);
  const fa = params.get('fa');
  const fb = params.get('fb');
  if (!fa && !fb) return null;

  const fo = params.get('fo');
  return {
    fighterA: fa ? decodeFighter(fa) : new Model(),
    fighterB: fb ? decodeFighter(fb) : new Model(),
    fightOptions: fo ? decodeFightOptions(fo) : new FightOptions(),
  };
}

export function getStateFromUrl(): { s1?: SituationState; s2?: SituationState } {
  const params = new URLSearchParams(window.location.search);
  const result: { s1?: SituationState; s2?: SituationState } = {};

  const a1 = params.get('a1');
  const d1 = params.get('d1');
  const so1 = params.get('so1');
  if (a1 || d1) {
    result.s1 = {
      attacker: a1 ? decodeAttacker(a1) : new Model(),
      defender: d1 ? decodeDefender(d1) : Model.basicDefender(),
      shootOptions: so1 ? decodeShootOptions(so1) : new ShootOptions(),
    };
  }

  const a2 = params.get('a2');
  const d2 = params.get('d2');
  const so2 = params.get('so2');
  if (a2 || d2) {
    result.s2 = {
      attacker: a2 ? decodeAttacker(a2) : new Model(),
      defender: d2 ? decodeDefender(d2) : Model.basicDefender(),
      shootOptions: so2 ? decodeShootOptions(so2) : new ShootOptions(),
    };
  }

  return result;
}

// Merge into the router's current query and replace the history entry.
// history.replaceState updates the address bar without updating useSearchParams,
// so the next Shoot/Fight toggle rebuilds the query from stale router state and
// drops these params, including the other calculator's.
// The router state lives in a ref so the returned callback is stable and always
// merges into the query as of the latest render, even when it was registered
// with ShareContext while this section was inactive.
function useMergeIntoSearch() {
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const latest = useRef({ searchParams, pathname, navigate });
  // Updated after commit, not during render: a render React discards must not leak its
  // router state into the callback. Layout effect so it lands before any click handler runs.
  useLayoutEffect(() => {
    latest.current = { searchParams, pathname, navigate };
  }, [searchParams, pathname, navigate]);
  return useCallback((
    updates: Record<string, string>,
    options: { pathname?: string; drop?: string[] } = {},
  ) => {
    const next = new URLSearchParams(latest.current.searchParams);
    for (const key of options.drop ?? []) {
      next.delete(key);
    }
    for (const [key, value] of Object.entries(updates)) {
      next.set(key, value);
    }
    latest.current.navigate(
      { pathname: options.pathname ?? latest.current.pathname, search: `?${next.toString()}` },
      { replace: true },
    );
  }, []);
}

function toShareUrl(params: Record<string, string>, pathname = window.location.pathname): string {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${window.location.origin}${pathname}?${query}`;
}

export function useUrlState(
  attacker1: Model,
  defender1: Model,
  shootOptions1: ShootOptions,
  attacker2: Model,
  defender2: Model,
  shootOptions2: ShootOptions,
) {
  const shareParams = useCallback((): Record<string, string> => ({
    view: viewToUrlText.get(CalculatorViewChoice.KtShoot)!,
    a1: encodeAttacker(attacker1),
    d1: encodeDefender(defender1),
    so1: encodeShootOptions(shootOptions1),
    a2: encodeAttacker(attacker2),
    d2: encodeDefender(defender2),
    so2: encodeShootOptions(shootOptions2),
  }), [attacker1, defender1, shootOptions1, attacker2, defender2, shootOptions2]);

  const getShareUrl = useCallback(() => toShareUrl(shareParams()), [shareParams]);

  const mergeIntoSearch = useMergeIntoSearch();
  const addParamsToUrl = useCallback(() => mergeIntoSearch(shareParams()), [mergeIntoSearch, shareParams]);

  return { getShareUrl, addParamsToUrl };
}

export function useFightUrlState(
  fighterA: Model,
  fighterB: Model,
  fightOptions: FightOptions,
) {
  const shareParams = useCallback((): Record<string, string> => ({
    fa: encodeFighter(fighterA),
    fb: encodeFighter(fighterB),
    fo: encodeFightOptions(fightOptions),
  }), [fighterA, fighterB, fightOptions]);

  // Always /fight, not the current path. `/?view=fight` is served as the
  // shoot snapshot, so a fight link unfurls as the shooting calculator. The
  // path decides the view there, so `view` is dropped rather than written.
  const getShareUrl = useCallback(
    () => toShareUrl(shareParams(), FIGHT_CALCULATOR_PATH), [shareParams]);

  const mergeIntoSearch = useMergeIntoSearch();
  const addParamsToUrl = useCallback(
    () => mergeIntoSearch(shareParams(), { pathname: FIGHT_CALCULATOR_PATH, drop: ['view'] }),
    [mergeIntoSearch, shareParams]);

  return { getShareUrl, addParamsToUrl };
}
