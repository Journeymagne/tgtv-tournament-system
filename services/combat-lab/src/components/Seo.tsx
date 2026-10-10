import { FC, useEffect } from 'react';

// Per-route <head> manager. Deliberately dependency-free: it upserts the title,
// description, canonical, and og/twitter text tags directly into <head> in an
// effect. That means it updates on client-side navigation (switching calculator
// views or following an in-app link) AND the tags are present in the DOM before
// react-snap snapshots each route at build time, so crawlers get correct static
// HTML too. The site-constant tags (og:image, twitter:card, JSON-LD, etc.) live
// in public/index.html; only the per-page values are managed here.
const SITE = 'https://ktcalc.com';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

interface SeoProps {
  // Full <title> text (include the brand suffix).
  title: string;
  description: string;
  // Canonical path beginning with '/', e.g. '/help/' or '/fight/'.
  path: string;
}

const Seo: FC<SeoProps> = ({ title, description, path }) => {
  useEffect(() => {
    const url = `${SITE}${path}`;
    document.title = title;
    upsertMeta('name', 'description', description);
    upsertLink('canonical', url);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
  }, [title, description, path]);

  return null;
};

export default Seo;
