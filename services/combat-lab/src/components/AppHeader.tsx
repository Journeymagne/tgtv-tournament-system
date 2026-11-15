import React from 'react';
import {Link,useLocation} from 'react-router-dom';
import {appBase,appPath} from 'src/lab/appPath';
const StandaloneHeader=({simulation}:{simulation:boolean})=>{
  const [theme,setTheme]=React.useState(()=>localStorage.getItem('companion-theme')==='light'?'light':'dark');
  React.useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('companion-theme',theme);},[theme]);
  return <header className="lab-header">
    <div className="lab-brand">
      <a href="/" className="lab-logo-link" aria-label="На главную KT Companion"><img src={appPath(`/brand/logo-${theme}.png`)} alt=""/></a>
      <Link to="/" className="lab-service-link"><span>KT COMPANION<small>COMBAT LAB</small></span></Link>
    </div>
    <nav aria-label="Сервисы"><Link to="/" className={!simulation?'active':''}>Калькулятор</Link><Link to="/simulation" className={simulation?'active':''}>Симуляция</Link></nav>
    <div className="lab-header-actions"><Link to="/help" className="lab-help" aria-label="Как это работает">?</Link>{!appBase&&<span className="demo-badge">LOCAL DEMO</span>}<button type="button" className="theme-button" aria-label={theme==='dark'?'Светлая тема':'Тёмная тема'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'☀':'☾'}</button></div>
  </header>;
};
const AppHeader=()=>{
  const simulation=useLocation().pathname.startsWith('/simulation');
  if (!appBase) return <StandaloneHeader simulation={simulation}/>;
  return <div className="lab-module-bar">
    <nav aria-label="Сервисы"><Link to="/" className={!simulation?'active':''}>Калькулятор</Link><Link to="/simulation" className={simulation?'active':''}>Симуляция</Link></nav>
    <Link to="/help" className="lab-help" aria-label="Как это работает" title="Как это работает">?</Link>
  </div>;
};
export default AppHeader;
