import React, { useEffect, useState } from 'react';
import { Container } from 'react-bootstrap';

import 'src/components/AuspexPromo.css';

// Cross-promo strip for Auspex Fatalis, the Kill Team league app from the same
// author. Sits directly under the header on every route. Dismissal is a
// per-browser convenience only, so storage failures (private mode, blocked
// site data) just mean the strip shows again.
const DISMISS_KEY = 'auspexPromoDismissed';
const AUSPEX_URL = 'https://auspexfatalis.com/?utm_source=ktcalc&utm_medium=banner';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

const AuspexPromo: React.FC = () => {
  // Start visible to match the react-snap prerendered HTML, then apply a
  // stored dismissal after hydration so the first client render agrees.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (readDismissed()) {
      setDismissed(true);
    }
  }, []);

  if (dismissed) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore: the strip is hidden for this visit either way
    }
  };

  return (
    <aside className='AuspexPromo' aria-label='Auspex Fatalis'>
      <Container className='AuspexPromo-container'>
        <span className='AuspexPromo-badge'>New</span>
        <span className='AuspexPromo-text'>
          <strong>Auspex Fatalis</strong>
          <span className='AuspexPromo-pitch'>
            {' '}runs your Kill Team league: schedule, scores, standings and finals.
          </span>
        </span>
        <a
          className='AuspexPromo-link'
          href={AUSPEX_URL}
          target='_blank'
          rel='noopener noreferrer'
        >
          Start a league &rarr;
          <span className='sr-only'> (opens in a new tab)</span>
        </a>
        <button
          type='button'
          className='AuspexPromo-close'
          aria-label='Hide the Auspex Fatalis banner'
          onClick={dismiss}
        >
          &times;
        </button>
      </Container>
    </aside>
  );
};

export default AuspexPromo;
