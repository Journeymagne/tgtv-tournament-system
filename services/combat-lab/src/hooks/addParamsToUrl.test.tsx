import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Model from 'src/Model';
import ShootOptions from 'src/ShootOptions';
import FightOptions from 'src/FightOptions';
import {ModeSwitch} from 'src/lab/LabUi';
import {CalculatorViewChoice,calculatorViewLocation,getCalculatorView,FIGHT_CALCULATOR_PATH} from 'src/CalculatorViewChoice';
import { getFightStateFromUrl, getStateFromUrl, useFightUrlState, useUrlState } from './useUrlState';

afterEach(() => window.history.replaceState({}, '', '/'));

const INITIAL = '/?view=shoot&fa=old-fight&extra=keep';

function ShootShareButton({ attacker }: { attacker: Model }) {
  const defender = Model.basicDefender();
  const options = new ShootOptions();
  const { addParamsToUrl } = useUrlState(
    attacker,
    defender,
    options,
    new Model(),
    Model.basicDefender(),
    new ShootOptions(),
  );
  return <button type="button" onClick={addParamsToUrl}>Add Shoot Params</button>;
}

function FightShareButton({ fighterA, fighterB }: { fighterA: Model; fighterB: Model }) {
  const { addParamsToUrl } = useFightUrlState(fighterA, fighterB, new FightOptions());
  return <button type="button" onClick={addParamsToUrl}>Add Fight Params</button>;
}

function ModeNav(){const loc=useLocation(),navigate=useNavigate();const [params]=useSearchParams();return <ModeSwitch mode={getCalculatorView(loc.pathname,params.get('view'))===CalculatorViewChoice.KtFight?'fight':'shoot'} onChange={mode=>navigate(calculatorViewLocation(mode==='fight'?CalculatorViewChoice.KtFight:CalculatorViewChoice.KtShoot,params.toString()))}/>;}
function searchOf(router: ReturnType<typeof createMemoryRouter>): URLSearchParams {
  return new URLSearchParams(router.state.location.search);
}

it('merges share params through the router so a view switch keeps both calculators', async () => {
  const attacker = new Model(4, 3, 5, 9);
  const fighterA = new Model().setProp('wounds', 8);
  const fighterB = new Model().setProp('wounds', 9);
  const router = createMemoryRouter(
    [{
      path: '*',
      element: <>
        <ModeNav/>
        <ShootShareButton attacker={attacker} />
        <FightShareButton fighterA={fighterA} fighterB={fighterB} />
      </>,
    }],
    { initialEntries: [INITIAL] },
  );
  const view = render(<RouterProvider router={router} />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Add Shoot Params' }));

    let params = searchOf(router);
    expect(params.get('view')).toBe('shoot');
    expect(params.get('a1')).toContain(':5:9:');
    expect(params.get('fa')).toBe('old-fight');
    expect(params.get('extra')).toBe('keep');
    expect(router.state.historyAction).toBe('REPLACE');

    // Replace must not push a history entry that the next Back would undo.
    await act(async () => {
      await router.navigate(-1);
    });
    params = searchOf(router);
    expect(params.get('a1')).toContain(':5:9:');
    expect(params.get('fa')).toBe('old-fight');

    fireEvent.click(screen.getByRole('button', { name: /Ближний бой/ }));
    params = searchOf(router);
    expect(router.state.location.pathname).toBe(FIGHT_CALCULATOR_PATH);
    expect(params.has('view')).toBe(false);
    expect(params.get('a1')).toContain(':5:9:');
    expect(params.get('fa')).toBe('old-fight');
    expect(params.get('extra')).toBe('keep');

    fireEvent.click(screen.getByRole('button', { name: 'Add Fight Params' }));
    params = searchOf(router);
    expect(router.state.location.pathname).toBe(FIGHT_CALCULATOR_PATH);
    expect(params.has('view')).toBe(false);
    expect(params.get('a1')).toContain(':5:9:');
    expect(params.get('fa')).toMatch(/^8:/);
    expect(params.get('fb')).toMatch(/^9:/);
    expect(params.get('extra')).toBe('keep');
    expect(router.state.historyAction).toBe('REPLACE');

    window.history.replaceState({}, '', `${router.state.location.pathname}${router.state.location.search}`);
    expect(getStateFromUrl().s1!.attacker.normDmg).toBe(5);
    expect(getStateFromUrl().s1!.attacker.critDmg).toBe(9);
    expect(getFightStateFromUrl()!.fighterA.wounds).toBe(8);
    expect(getFightStateFromUrl()!.fighterB.wounds).toBe(9);

    fireEvent.click(screen.getByRole('button', { name: /Стрельба/ }));
    params = searchOf(router);
    expect(router.state.location.pathname).toBe('/');
    expect(params.get('view')).toBe('shoot');
    expect(params.get('a1')).toContain(':5:9:');
    expect(params.get('fa')).toMatch(/^8:/);
    expect(params.get('extra')).toBe('keep');
  } finally {
    view.unmount();
    router.dispose();
  }
});
