import { FC, ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { legacyFightViewRedirect } from 'src/CalculatorViewChoice';

// Old fight links are `/?view=fight&fa=…`. Those still open the fight
// calculator, but on `/fight`, which react-snap snapshots with fight <head> tags.
const LegacyFightViewRedirect: FC<{ children: ReactElement }> = ({ children }) => {
  const location = useLocation();
  const target = legacyFightViewRedirect(location.pathname, location.search);
  if (target !== null) {
    return <Navigate to={target} replace />;
  }
  return children;
};

export default LegacyFightViewRedirect;
