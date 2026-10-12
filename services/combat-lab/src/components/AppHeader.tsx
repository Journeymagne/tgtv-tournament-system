import React from 'react';
import {Link,useLocation} from 'react-router-dom';
import {appBase,appPath} from 'src/lab/appPath';
const AppHeader=()=>{
  const location=useLocation();const simulation=location.pathname.startsWith('/simulation');
  const [theme,setTheme]=React.useState(()=>localStorage.getItem('companion-theme')==='light'?'light':'dark');
  React.useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('companion-theme',theme);},[theme]);
  const brand=<><img src={appPath(`/brand/logo-${theme}.png`)} alt="KT Companion"/><span>KT COMPANION<small>COMBAT LAB</small></span></>;
  return <header className="lab-header">
    {appBase?<a href="/" className="lab-brand" aria-label="На главную KT Companion">{brand}</a>:<Link to="/" className="lab-brand">{brand}</Link>}
    <nav aria-label="Сервисы"><Link to="/" className={!simulation?'active':''}>Калькулятор</Link><Link to="/simulation" className={simulation?'active':''}>Симуляция</Link></nav>
    <div className="lab-header-actions"><Link to="/help" className="lab-help" aria-label="Как это работает">?</Link>{!appBase&&<span className="demo-badge">LOCAL DEMO</span>}<button type="button" className="theme-button" aria-label={theme==='dark'?'Светлая тема':'Тёмная тема'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'☀':'☾'}</button></div>
  </header>;
};
export default AppHeader;
