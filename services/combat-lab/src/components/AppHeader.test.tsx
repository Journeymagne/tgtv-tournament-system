import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter,useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import AppHeader from './AppHeader';
import {ModeSwitch} from 'src/lab/LabUi';
import {CalculatorViewChoice,calculatorViewLocation,getCalculatorView} from 'src/CalculatorViewChoice';
function Harness(){const loc=useLocation();return <><AppHeader/><output data-testid="location">{loc.pathname}{loc.search}</output></>;}
it.each(['/help','/rules/fight','/notes/punishing'])('opens calculator and simulation from %s',path=>{
 render(<MemoryRouter initialEntries={[path]}><Harness/></MemoryRouter>);
 fireEvent.click(screen.getByRole('link',{name:'Симуляция'}));expect(screen.getByTestId('location').textContent).toBe('/simulation');
 fireEvent.click(screen.getByRole('link',{name:'Калькулятор'}));expect(screen.getByTestId('location').textContent).toBe('/');
});
it('keeps calculator share parameters when changing the mode',()=>{
 function Modes(){const loc=useLocation(),navigate=useNavigate();const [params]=useSearchParams();return <><ModeSwitch mode={getCalculatorView(loc.pathname,params.get('view'))===CalculatorViewChoice.KtFight?'fight':'shoot'} onChange={mode=>navigate(calculatorViewLocation(mode==='fight'?CalculatorViewChoice.KtFight:CalculatorViewChoice.KtShoot,params.toString()))}/><output data-testid="location">{loc.pathname}{loc.search}</output></>;}
 render(<MemoryRouter initialEntries={['/?view=shoot&a1=4%3A3&fa=12%3A4']}><Modes/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:/Ближний бой/}));expect(screen.getByTestId('location').textContent).toBe('/fight/?a1=4%3A3&fa=12%3A4');
 fireEvent.click(screen.getByRole('button',{name:/Стрельба/}));expect(screen.getByTestId('location').textContent).toBe('/?view=shoot&a1=4%3A3&fa=12%3A4');
});
