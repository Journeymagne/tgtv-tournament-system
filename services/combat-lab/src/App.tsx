import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { CalculatorViewChoice, calculatorCanonicalPath, calculatorViewLocation, getCalculatorView } from 'src/CalculatorViewChoice';
import LegacyFightViewRedirect from 'src/LegacyFightViewRedirect';
import FightSection from 'src/components/FightSection';
import HelpPage from 'src/components/HelpPage';
import Layout from 'src/components/Layout';
import RuleDocPage from 'src/components/RuleDocPage';
import Seo from 'src/components/Seo';
import LethalRelentlessNote from 'src/components/notes/LethalRelentlessNote';
import MysticScryBuffNote from 'src/components/notes/MysticScryBuffNote';
import PunishingNote from 'src/components/notes/PunishingNote';
import ShootMassAnalysisSection from 'src/components/ShootMassAnalysisSection';
import ShootSection from 'src/components/ShootSection';
import CalculatorActions from 'src/lab/CalculatorActions';
import {ModeSwitch,PageHeading} from 'src/lab/LabUi';
import { ShareProvider } from 'src/context/ShareContext';

const Simulation = React.lazy(() => import('src/simulation/Simulation'));

// Per-view <head> + on-page heading copy. Keyed off the same view the
// calculator switches on (`/fight`, or ?view= everywhere else), so the title,
// description, canonical, and H1 can never disagree about which tool is showing.
const VIEW_SEO: Record<CalculatorViewChoice, { title: string; description: string; h1: string }> = {
  [CalculatorViewChoice.KtShoot]: {
    title: 'Kill Team 2024 Shooting Calculator — Ranged Odds | ktcalc',
    description:
      'Calculate Kill Team 2024 shooting odds. Enter BS, attacks, and weapon rules to get the chance of hits, crits, damage, and kills against any defensive profile.',
    h1: 'Kill Team 2024 Shooting Calculator',
  },
  [CalculatorViewChoice.KtFight]: {
    title: 'Kill Team 2024 Fight Calculator — Melee Odds | ktcalc',
    description:
      'Calculate Kill Team 2024 fighting odds. Model the alternating strike-and-parry melee sequence between two fighters and see who is likely to win the combat.',
    h1: 'Kill Team 2024 Fight Calculator',
  },
  [CalculatorViewChoice.KtShootMassAnalysis]: {
    title: 'Kill Team 2024 Mass Analysis — Compare Weapons vs Profiles | ktcalc',
    description:
      'Compare one Kill Team 2024 attacker across many defensive profiles at once. A matrix of expected damage and kill odds for fast weapon-vs-profile matchup analysis.',
    h1: 'Kill Team 2024 Mass Matchup Analysis',
  },
};

function fallbackRender({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

const AppContent = () => {
  const location = useLocation();
  const navigate=useNavigate();
  const [urlParams] = useSearchParams();
  // Derived fresh on every render — never cached in state — so this can never
  // disagree with AppHeader's own read of the same location.
  const currentView = getCalculatorView(location.pathname, urlParams.get('view'));
  const viewSeo = VIEW_SEO[currentView];
  const canonicalPath = calculatorCanonicalPath(currentView);

  function sectionDiv(
    view: CalculatorViewChoice,
    child: JSX.Element,
  ) : JSX.Element {
    return (
      <ErrorBoundary fallbackRender={fallbackRender}>
        <div style={{ display: currentView === view ? 'block' : 'none' }}>
          {child}
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <main className="lab-shell">
      <Seo title={viewSeo.title.replace('| ktcalc','| Companion Combat Lab')} description={viewSeo.description} path={canonicalPath} />
      <PageHeading eyebrow="KILL TEAM 2024 / КАЛЬКУЛЯТОР" title="Рассчитайте шансы" description="Настройте профили. Добавьте правила. Сравните результаты." actions={<CalculatorActions/>}/>
      <div className="lab-toolbar"><ModeSwitch mode={currentView===CalculatorViewChoice.KtFight?'fight':'shoot'} onChange={mode=>navigate(calculatorViewLocation(mode==='fight'?CalculatorViewChoice.KtFight:CalculatorViewChoice.KtShoot,urlParams.toString()))}/><span className="lab-toolbar-hint">Ручная настройка профилей · ядро ktcalc</span></div>
      {sectionDiv(CalculatorViewChoice.KtShoot, <ShootSection isActive={currentView === CalculatorViewChoice.KtShoot} />)}
      {sectionDiv(CalculatorViewChoice.KtFight, <FightSection isActive={currentView === CalculatorViewChoice.KtFight} />)}
      {currentView===CalculatorViewChoice.KtShootMassAnalysis&&<ShootMassAnalysisSection/>}
    </main>
  );
};

const App = () => (
  <ShareProvider>
    <Routes>
      <Route element={<Layout />}>
      <Route path="/simulation" element={<ErrorBoundary fallbackRender={fallbackRender}><React.Suspense fallback={<div className="lab-loading">Загрузка оперативников…</div>}><Simulation /></React.Suspense></ErrorBoundary>} />
      <Route
        path="/notes/lethal-relentless"
        element={
          <ErrorBoundary fallbackRender={fallbackRender}>
            <LethalRelentlessNote />
          </ErrorBoundary>
        }
      />
      <Route
        path="/notes/mystic-scry-buff"
        element={
          <ErrorBoundary fallbackRender={fallbackRender}>
            <MysticScryBuffNote />
          </ErrorBoundary>
        }
      />
      <Route
        path="/notes/punishing"
        element={
          <ErrorBoundary fallbackRender={fallbackRender}>
            <PunishingNote />
          </ErrorBoundary>
        }
      />
      <Route
        path="/help"
        element={
          <ErrorBoundary fallbackRender={fallbackRender}>
            <HelpPage />
          </ErrorBoundary>
        }
      />
      <Route
        path="/rules/combat"
        element={
          <ErrorBoundary fallbackRender={fallbackRender}>
            <RuleDocPage file="COMBAT_RULES.md" />
          </ErrorBoundary>
        }
      />
      <Route
        path="/rules/fight"
        element={
          <ErrorBoundary fallbackRender={fallbackRender}>
            <RuleDocPage file="FIGHT_RULES.md" />
          </ErrorBoundary>
        }
      />
      <Route
        path="/rules/weapon"
        element={
          <ErrorBoundary fallbackRender={fallbackRender}>
            <RuleDocPage file="WEAPON_RULES.md" />
          </ErrorBoundary>
        }
      />
      <Route
        path="/rules/cover-saves"
        element={
          <ErrorBoundary fallbackRender={fallbackRender}>
            <RuleDocPage file="COVER_SAVES.md" />
          </ErrorBoundary>
        }
      />
      <Route
        path="/rules/weapon-balance"
        element={
          <ErrorBoundary fallbackRender={fallbackRender}>
            <RuleDocPage file="WEAPON_BALANCE.md" />
          </ErrorBoundary>
        }
      />
      <Route
        path="/rules/retained-vs-modified"
        element={
          <ErrorBoundary fallbackRender={fallbackRender}>
            <RuleDocPage file="RETAINED_VS_MODIFIED_DICE.md" />
          </ErrorBoundary>
        }
      />
      <Route path="*" element={<LegacyFightViewRedirect><AppContent /></LegacyFightViewRedirect>} />
      </Route>
    </Routes>
  </ShareProvider>
);

export default App;