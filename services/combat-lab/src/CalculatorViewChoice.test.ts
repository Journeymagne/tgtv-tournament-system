import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  CalculatorViewChoice,
  FIGHT_CALCULATOR_PATH,
  calculatorCanonicalPath,
  calculatorViewLocation,
  getCalculatorView,
  legacyFightViewRedirect,
} from './CalculatorViewChoice';

describe('fight calculator path', () => {
  it('treats /fight as the fight calculator and / as shoot', () => {
    expect(getCalculatorView('/fight', null)).toBe(CalculatorViewChoice.KtFight);
    expect(getCalculatorView('/fight/', null)).toBe(CalculatorViewChoice.KtFight);
    expect(getCalculatorView('/fight', 'shoot')).toBe(CalculatorViewChoice.KtFight);
    expect(getCalculatorView('/', null)).toBe(CalculatorViewChoice.KtShoot);
    expect(getCalculatorView('/', 'shoot')).toBe(CalculatorViewChoice.KtShoot);
    expect(getCalculatorView('/', 'mass')).toBe(CalculatorViewChoice.KtShootMassAnalysis);
    expect(getCalculatorView('/rules/fight', null)).toBe(CalculatorViewChoice.KtShoot);
  });

  it('canonicalizes fight to /fight/ and shoot to /', () => {
    expect(calculatorCanonicalPath(CalculatorViewChoice.KtFight)).toBe('/fight/');
    expect(calculatorCanonicalPath(CalculatorViewChoice.KtShoot)).toBe('/');
    expect(calculatorCanonicalPath(CalculatorViewChoice.KtShootMassAnalysis)).toBe('/?view=mass');
  });

  it.each(['fight', 'KtFight', 'ktfight'])('redirects /?view=%s to /fight/', (view) => {
    expect(legacyFightViewRedirect('/', `?view=${view}`)).toBe('/fight/');
  });

  it('keeps fight share params and drops view', () => {
    expect(legacyFightViewRedirect('/', '?view=fight&fa=12%3A4&fb=8&fo=1')).toBe('/fight/?fa=12%3A4&fb=8&fo=1');
  });

  it('does not redirect shoot, mass, or non-root paths', () => {
    expect(legacyFightViewRedirect('/', '?view=shoot&a1=4')).toBeNull();
    expect(legacyFightViewRedirect('/', '?view=mass')).toBeNull();
    expect(legacyFightViewRedirect('/', '')).toBeNull();
    expect(legacyFightViewRedirect('/fight', '?view=fight&fa=1')).toBeNull();
    expect(legacyFightViewRedirect('/rules/fight', '?view=fight')).toBeNull();
    expect(legacyFightViewRedirect('/help', '?view=fight')).toBeNull();
  });

  it('sends the fight header to /fight/ and other views to /?view=', () => {
    expect(calculatorViewLocation(CalculatorViewChoice.KtFight, '?view=shoot&a1=4%3A3&fa=12%3A4')).toEqual({
      pathname: '/fight/',
      search: '?a1=4%3A3&fa=12%3A4',
    });
    expect(calculatorViewLocation(CalculatorViewChoice.KtShoot, '?a1=4%3A3&fa=12%3A4')).toEqual({
      pathname: '/',
      search: '?view=shoot&a1=4%3A3&fa=12%3A4',
    });
    expect(calculatorViewLocation(CalculatorViewChoice.KtFight, '')).toEqual({
      pathname: FIGHT_CALCULATOR_PATH,
      search: '',
    });
  });

  it('react-snap snapshots /fight so a fight link is not the shoot page', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));
    // react-snap routes are listed without the trailing slash; it still writes fight/index.html.
    expect(pkg.reactSnap.include).toContain(FIGHT_CALCULATOR_PATH.replace(/\/$/, ''));
  });
});
