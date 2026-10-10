import React from 'react';
import {Outlet,useLocation} from 'react-router-dom';
import AppHeader from './AppHeader';
export default function Layout(){
  const simulation=useLocation().pathname.startsWith('/simulation');
  return <><AppHeader/><div className={simulation?'simulation-workspace':'calc-workspace'}><Outlet/></div><footer className="lab-footer"><span>KT COMPANION <b> / </b> COMBAT LAB</span><span>Расчёты на <a href="https://github.com/jfreal/ktcalc" target="_blank" rel="noreferrer">ktcalc</a> · Kill Team 2024 · <a href="/LICENSE.txt" target="_blank" rel="noreferrer">Unlicense</a></span></footer></>;
}
