export enum CalculatorViewChoice {
  KtShoot = 'KtShoot',
  KtFight = 'KtFight',
  KtShootMassAnalysis = 'KtShootMassAnalysis',
}

// Path react-snap can snapshot. Fight share links and the fight canonical use
// this instead of `/?view=fight`, which is served as the `/` (shoot) snapshot
// and unfurls as the shooting calculator. Keep `/fight` in package.json
// `reactSnap.include`. The trailing slash matters: Netlify serves the snapshot
// (fight/index.html) at `/fight/` and 301-redirects `/fight` there, like /help/.
export const FIGHT_CALCULATOR_PATH = '/fight/';

// The canonical ?view= text for each view, and the single source of truth for
// resolving a raw ?view= param back to a view. Anything that needs to read or
// write the calculator view (AppContent, AppHeader) must go through these so
// the active view can never disagree between the URL and the UI.
export const viewToUrlText = new Map<CalculatorViewChoice, string>([
  [CalculatorViewChoice.KtShoot, 'shoot'],
  [CalculatorViewChoice.KtFight, 'fight'],
  [CalculatorViewChoice.KtShootMassAnalysis, 'mass'],
]);

const _urlTextToView = new Map<string, CalculatorViewChoice>();
for (const [view, text] of viewToUrlText) {
  _urlTextToView.set(text, view);
  _urlTextToView.set(view, view);
  _urlTextToView.set(view.toLowerCase(), view);
}

// Resolves a raw ?view= param (any recognized alias/enum spelling, or null/absent)
// to a view, defaulting to KtShoot. Always derive the active view through this —
// never cache it in state — so the UI can't get out of sync with the URL.
export function getViewFromUrlText(raw: string | null): CalculatorViewChoice {
  if (raw === null) return CalculatorViewChoice.KtShoot;
  return _urlTextToView.get(raw) ?? CalculatorViewChoice.KtShoot;
}

export function isFightCalculatorPath(pathname: string): boolean {
  return pathname === FIGHT_CALCULATOR_PATH || pathname === '/fight';
}

// `/fight` is the fight calculator even with no ?view= param (that's the
// snapshotted URL). Everywhere else, ?view= still decides, defaulting to shoot.
export function getCalculatorView(pathname: string, viewParam: string | null): CalculatorViewChoice {
  if (isFightCalculatorPath(pathname)) return CalculatorViewChoice.KtFight;
  return getViewFromUrlText(viewParam);
}

// Canonical path for <head>. Fight is `/fight` so crawlers that ignore query
// strings still get the fight snapshot. Share-state params are not included.
export function calculatorCanonicalPath(view: CalculatorViewChoice): string {
  if (view === CalculatorViewChoice.KtFight) return FIGHT_CALCULATOR_PATH;
  if (view === CalculatorViewChoice.KtShoot) return '/';
  return `/?view=${viewToUrlText.get(view)}`;
}

// `/?view=fight` (and the KtFight / ktfight aliases) is a legacy alias of
// `/fight`. Returns the replacement URL, or null when the location should stay.
// Other query params are preserved; `view` is dropped so the alias doesn't stick.
export function legacyFightViewRedirect(pathname: string, search: string): string | null {
  if (pathname !== '/') return null;
  const params = new URLSearchParams(search);
  const raw = params.get('view');
  if (raw === null || getViewFromUrlText(raw) !== CalculatorViewChoice.KtFight) return null;
  params.delete('view');
  const qs = params.toString();
  return qs ? `${FIGHT_CALCULATOR_PATH}?${qs}` : FIGHT_CALCULATOR_PATH;
}

// Header navigation target. Fight leaves the query-only alias; other views stay
// on `/` and keep `view` first so existing shoot URLs don't get reshuffled.
export function calculatorViewLocation(
  view: CalculatorViewChoice,
  search: string,
): { pathname: string; search: string } {
  const params = new URLSearchParams(search);
  params.delete('view');
  if (view === CalculatorViewChoice.KtFight) {
    const qs = params.toString();
    return { pathname: FIGHT_CALCULATOR_PATH, search: qs ? `?${qs}` : '' };
  }
  const rest = params.toString();
  const viewText = viewToUrlText.get(view) as string;
  return {
    pathname: '/',
    search: rest ? `?view=${viewText}&${rest}` : `?view=${viewText}`,
  };
}
