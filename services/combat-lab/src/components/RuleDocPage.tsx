import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import 'src/components/RuleDocPage.css';
import { HeadingSlugger, rehypeHeadingIds } from 'src/components/headingSlug';
import { notes as helpNotes, rulesDocs as helpRulesDocs } from 'src/components/HelpPage';
import Seo from 'src/components/Seo';
import * as T from 'src/theme';

// SEO copy per rules doc, keyed by the same file name the route passes in, so the
// <head> for each /rules/* page matches the document it renders.
const DOC_SEO: Record<string, { title: string; description: string; path: string }> = {
  'COMBAT_RULES.md': {
    title: 'Kill Team 2024 Combat & Save Rules | ktcalc',
    description:
      'How ktcalc resolves Kill Team 2024 saves: defense dice, cover, Feel No Pain, Piercing and Saintly Relics — the rules behind the shoot calculator.',
    path: '/rules/combat/',
  },
  'FIGHT_RULES.md': {
    title: 'Kill Team 2024 Fight Rules — Melee Resolution | ktcalc',
    description:
      'How ktcalc models Kill Team 2024 melee: the strike/parry sequence, what a parry cancels, how the engine chooses, and scenarios you can check by hand.',
    path: '/rules/fight/',
  },
  'WEAPON_RULES.md': {
    title: 'Kill Team 2024 Weapon Rules Reference | ktcalc',
    description:
      'Every Kill Team 2024 weapon rule ktcalc supports: Accurate, Balanced, Brutal, Ceaseless, Devastating, Lethal, Piercing, Relentless, Rending and more.',
    path: '/rules/weapon/',
  },
  'COVER_SAVES.md': {
    title: 'When Not to Take Cover Saves in Kill Team 2024 | ktcalc',
    description:
      'Cover saves are optional in Kill Team 2024. When declining cover is right (save promotions vs mostly-crit attacks), and why ktcalc always takes it.',
    path: '/rules/cover-saves/',
  },
  'WEAPON_BALANCE.md': {
    title: 'Comparing Kill Team 2024 Weapons by Power Level | ktcalc',
    description:
      'KT24 melee and heavy weapon profiles measured against a fixed set of targets, plain and buffed: which come out balanced and what the model leaves out.',
    path: '/rules/weapon-balance/',
  },
  'RETAINED_VS_MODIFIED_DICE.md': {
    title: 'Retained vs Modified Dice in Kill Team 2024 | ktcalc',
    description:
      'A dice can only be retained once. Why Rending cannot promote a cover save but Severe can, which Kill Team 2024 rules lock a dice, and how ktcalc models it.',
    path: '/rules/retained-vs-modified/',
  },
};

// Markdown links to other in-app pages ("/rules/...") must go through react-router,
// otherwise clicking one triggers a full page reload out of the SPA. External links
// (and anchors) stay plain <a>, and get the usual new-tab safety attributes.
export function MarkdownLink({ href, children }: React.ComponentPropsWithoutRef<'a'>) {
  const isInternal = !!href && href.startsWith('/') && !href.startsWith('//');
  if (isInternal) {
    return <Link to={href}>{children}</Link>;
  }
  const isExternal = !!href && /^https?:/i.test(href);
  return (
    <a href={href} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  );
}

// Rules docs in reading order: the sidebar list and the "Next" link follow it.
const RULES_SEQUENCE: { path: string; label: string }[] = [
  { path: '/rules/combat', label: 'Combat rules' },
  { path: '/rules/fight', label: 'Fight rules' },
  { path: '/rules/weapon', label: 'Weapon rules' },
  { path: '/rules/retained-vs-modified', label: 'Retained vs modified dice' },
  { path: '/rules/cover-saves', label: 'Cover saves' },
];

// The trailing "*Last updated: …*" line moves from the body into the title meta.
const LAST_UPDATED = /^\*Last updated:?\s*(.+?)\*\s*$/m;

export function splitLastUpdated(markdown: string): { body: string; lastUpdated?: string } {
  const match = LAST_UPDATED.exec(markdown);
  if (!match) return { body: markdown };
  return {
    body: (markdown.slice(0, match.index) + markdown.slice(match.index + match[0].length)).trimEnd() + '\n',
    lastUpdated: match[1].trim(),
  };
}

// Plain text of a Markdown heading: drops code ticks, emphasis, and link targets.
function headingPlainText(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    // Emphasis underscores sit at word edges; intra-word ones (snake_case) are
    // real text and the slug keeps them.
    .replace(/(^|\W)_+|_+(?=\W|$)/g, '$1')
    .replace(/\s+#+\s*$/, '')
    .trim();
}

export interface TocEntry {
  id: string;
  text: string;
}

// H2s for "On this page". Slugs every heading in document order (as
// rehypeHeadingIds does) so repeated headings get the same -1, -2 suffixes.
export function extractToc(markdown: string): TocEntry[] {
  const slugger = new HeadingSlugger();
  const toc: TocEntry[] = [];
  // CommonMark: a fence closes only on the same character, at least as long
  // as the opener, with nothing but spaces after it.
  let fence: { marker: string; length: number } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (fence === null) {
        fence = { marker, length };
        continue;
      }
      if (marker === fence.marker && length >= fence.length && fenceMatch[2].trim() === '') {
        fence = null;
        continue;
      }
    }
    if (fence !== null) continue;
    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (!heading) continue;
    const text = headingPlainText(heading[2]);
    const id = slugger.slug(text);
    if (heading[1].length === 2) toc.push({ id, text });
  }
  return toc;
}

function scrollToHeading(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  event.preventDefault();
  const top = el.getBoundingClientRect().top + window.scrollY - 12;
  window.scrollTo({ top, behavior: 'smooth' });
  window.history.replaceState(window.history.state, '', `#${id}`);
}

// Plain CSS can't import theme.ts, so the handful of theme colors this
// stylesheet needs are threaded in as custom properties instead of being
// hardcoded a second time in RuleDocPage.css.
const themeVars: React.CSSProperties = {
  ['--rule-doc-zebra-odd' as any]: T.zebraOdd,
  ['--rule-doc-accent' as any]: T.accent,
  ['--rule-doc-text-muted' as any]: T.textMuted,
  ['--rule-doc-error' as any]: T.error,
  ['--rule-doc-hairline' as any]: T.hairline,
  ['--rule-doc-text-body' as any]: T.textBody,
  ['--rule-doc-accent-ink' as any]: T.accentInk,
  ['--rule-doc-ink' as any]: T.textInk,
};

interface RuleDocPageProps {
  // Markdown file name in public/rules/ (generated from rules/ by copy-rules.js).
  file: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; text: string }
  | { status: 'error'; message: string };

const RuleDocPage: React.FC<RuleDocPageProps> = ({ file }) => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const { hash } = useLocation();

  useEffect(() => {
    // Reset to loading so a file change never leaves stale content on screen.
    setState({ status: 'loading' });
    const controller = new AbortController();
    const url = `${process.env.PUBLIC_URL || ''}/rules/${file}`;
    fetch(url, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => setState({ status: 'ok', text }))
      .catch((e) => {
        if (e.name === 'AbortError') return; // superseded/unmounted — ignore
        setState({ status: 'error', message: String(e) });
      });
    return () => controller.abort();
  }, [file]);

  // The markdown arrives after first paint, so the browser's own hash scroll
  // has already missed. Once the headings exist, scroll to one if the URL has it,
  // and again when an in-app link changes only the hash.
  useEffect(() => {
    if (state.status !== 'ok') return;
    if (hash.length < 2) return;
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    document.getElementById(id)?.scrollIntoView();
  }, [state, hash]);

  // Fall back to a generic rules-reference head for any unknown file so a new or
  // mistyped doc never leaves the previous route's title/canonical/meta in place
  // on client-side navigation.
  const seo = DOC_SEO[file] ?? {
    title: 'Kill Team 2024 Rules Reference | ktcalc',
    description: 'Kill Team 2024 rules reference for the ktcalc shooting and fighting calculator.',
    path: '/help/',
  };

  const routePath = seo.path.replace(/\/$/, '');
  const helpRule = helpRulesDocs.find((d) => d.href === routePath);
  const helpNote = helpNotes.find((d) => d.href === routePath);
  const helpDoc = helpRule ?? helpNote;
  const groupLabel = helpNote ? 'Deep-dive notes' : 'Game rules reference';
  const seqIndex = RULES_SEQUENCE.findIndex((d) => d.path === routePath);
  const next = seqIndex >= 0 ? RULES_SEQUENCE[seqIndex + 1] : undefined;

  const text = state.status === 'ok' ? state.text : '';
  const { body, lastUpdated } = useMemo(() => splitLastUpdated(text), [text]);
  const toc = useMemo(() => extractToc(body), [body]);
  const meta = [helpDoc?.title, lastUpdated && `Last updated ${lastUpdated}`].filter(Boolean).join(' · ');

  // The Markdown H1 becomes the title block, with the meta line under it.
  // Memoized so a re-render (e.g. a hash change) doesn't swap the component
  // type and remount the heading.
  const markdownComponents = useMemo(() => {
    const TitleH1 = ({ node, children, ...rest }: React.ComponentPropsWithoutRef<'h1'> & { node?: unknown }) => (
      <div className="RuleDoc-titleBlock">
        <h1 {...rest}>{children}</h1>
        {meta && <div className="RuleDoc-meta">{meta}</div>}
      </div>
    );
    return { a: MarkdownLink, h1: TitleH1 };
  }, [meta]);

  return (
    <main className="RuleDoc" style={themeVars}>
      <Seo title={seo.title} description={seo.description} path={seo.path} />
      <article className="RuleDoc-article">
        <nav className="RuleDoc-breadcrumb" aria-label="Breadcrumb">
          <Link to="/help">How it works</Link>
          <span aria-hidden="true">/</span>
          <span>{groupLabel}</span>
        </nav>

        {state.status === 'loading' && <p className="RuleDoc-status">Loading&hellip;</p>}
        {state.status === 'error' && (
          <p className="RuleDoc-status RuleDoc-error">Could not load this document ({state.message}).</p>
        )}
        {state.status === 'ok' && (
          <div className="RuleDoc-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHeadingIds]}
              components={markdownComponents}
            >
              {body}
            </ReactMarkdown>
          </div>
        )}

        <nav className="RuleDoc-bottomNav" aria-label="Rules docs">
          <Link to="/help">&larr; Back to How it works</Link>
          {next && <Link to={next.path} className="RuleDoc-next">Next: {next.label} &rarr;</Link>}
        </nav>
      </article>

      <aside className="RuleDoc-sidebar">
        {toc.length > 0 && (
          <>
            <div className="RuleDoc-sideHeading RuleDoc-sideHeading--first">On this page</div>
            <div className="RuleDoc-toc">
              {toc.map((entry) => (
                <a key={entry.id} href={`#${entry.id}`} onClick={(e) => scrollToHeading(e, entry.id)}>
                  {entry.text}
                </a>
              ))}
            </div>
          </>
        )}
        <div className={'RuleDoc-sideHeading' + (toc.length === 0 ? ' RuleDoc-sideHeading--first' : '')}>Rules docs</div>
        <div className="RuleDoc-docList">
          {RULES_SEQUENCE.map((d) =>
            d.path === routePath ? (
              <span key={d.path} className="RuleDoc-current" aria-current="page">{d.label}</span>
            ) : (
              <Link key={d.path} to={d.path}>{d.label}</Link>
            ),
          )}
        </div>
      </aside>
    </main>
  );
};

export default RuleDocPage;
