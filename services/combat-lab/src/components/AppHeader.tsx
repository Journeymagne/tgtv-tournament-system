import React from 'react';
import {Link,useLocation} from 'react-router-dom';
const AppHeader=()=>{
  const location=useLocation();const simulation=location.pathname.startsWith('/simulation');
  const [theme,setTheme]=React.useState(()=>localStorage.getItem('companion-theme')==='light'?'light':'dark');
  React.useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('companion-theme',theme);},[theme]);
  return <header className="lab-header">
    <Link to="/" className="lab-brand"><img src={`/brand/logo-${theme}.png`} alt="KT Companion"/><span>KT COMPANION<small>COMBAT LAB</small></span></Link>
    <nav aria-label="Сервисы"><Link to="/" className={!simulation?'active':''}>Калькулятор</Link><Link to="/simulation" className={simulation?'active':''}>Симуляция</Link></nav>
    <div className="lab-header-actions"><Link to="/help" className="lab-help" aria-label="Как это работает">?</Link><span className="demo-badge">LOCAL DEMO</span><button type="button" className="theme-button" aria-label={theme==='dark'?'Светлая тема':'Тёмная тема'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'☀':'☾'}</button></div>
  </header>;
};
export default AppHeader;
