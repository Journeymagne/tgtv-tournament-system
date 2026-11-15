import React from 'react';
import { Link } from 'react-router-dom';
import * as T from 'src/theme';

const GITHUB_URL = 'https://github.com/jfreal/ktcalc';
const UPSTREAM_URL = 'https://jmegner.github.io/KT21Calculator/';

const githubLine = (
  <span>
    <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">Open source on GitHub</a> — Pull requests welcome!
  </span>
);

const forkedLine = (
  <span>
    Forked from <a href={UPSTREAM_URL} target="_blank" rel="noopener noreferrer">jmegner.github.io/KT21Calculator</a>
  </span>
);

interface AltTool {
  name: string;
  href: string;
  blurb: string;
}

const altTools: AltTool[] = [
  {
    name: 'Ballistica Imperialis',
    href: 'https://brandongreen00.github.io/ballistica-imperialis/',
    blurb: 'Alternative KT math tool with preloaded weapon & defence profiles and a cool design.',
  },
  {
    name: 'NemesisForge',
    href: 'https://nemesisforge.netlify.app/',
    blurb: 'Build your own nemesis operatives.',
  },
];

interface FooterProps {
  // Docs pages (/help, /rules, /notes) get a one-line footer without the tools box.
  compact?: boolean;
}

const Footer: React.FC<FooterProps> = ({ compact = false }) => {
  if (compact) {
    return (
      <footer
        style={{
          maxWidth: '1040px',
          margin: '28px auto 0',
          padding: '16px',
          borderTop: `1px solid ${T.borderFaint}`,
          fontSize: '12px',
          color: T.textMuted,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '6px 20px',
        }}
      >
        {githubLine}
        {forkedLine}
      </footer>
    );
  }

  return (
    <footer
      style={{
        maxWidth: '1320px',
        margin: '20px auto 0',
        padding: '16px 12px 24px',
        borderTop: `1px solid ${T.borderFaint}`,
        fontSize: '12px',
        color: T.textMuted,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '16px 40px',
      }}
    >
      <div style={{ maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Link
          to="/help"
          target="_blank"
          rel="noopener noreferrer"
          title="How KT Calc works (opens in a new tab)"
          style={{ fontSize: '14px', fontWeight: 600 }}
        >
          How KT Calc works &rarr;
          <span className="sr-only"> (opens in a new tab)</span>
        </Link>
        <span>Deep-dive notes and the Kill Team rules the calculator is built on.</span>
        <span style={{ marginTop: '8px' }}>{githubLine}</span>
        {forkedLine}
      </div>
      <div style={{ width: '380px', maxWidth: '100%', border: `1px solid ${T.borderSoft}`, borderRadius: '4px', overflow: 'hidden', background: T.panelBg }}>
        <div style={{ background: T.subtleBg, fontSize: '13px', fontWeight: 700, color: T.textInk, padding: '6px 10px', borderBottom: `1px solid ${T.borderSoft}` }}>
          ⚔️ Alternative Tools
        </div>
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {altTools.map(tool => (
            <div key={tool.href}>
              <a href={tool.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', fontWeight: 600 }}>
                {tool.name} →
              </a>
              <div style={{ fontSize: '12px', color: T.textMuted, marginTop: '2px' }}>{tool.blurb}</div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
