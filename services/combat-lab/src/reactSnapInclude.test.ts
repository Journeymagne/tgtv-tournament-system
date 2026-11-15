import fs from 'fs';
import path from 'path';

// Static pages are snapshotted at build time. A direct load of a route missing
// from reactSnap.include is served the homepage snapshot (public/_redirects
// falls unknown paths through to /index.html) and then hydrated, because
// src/index.tsx hydrates whenever the URL has no query string.
function sitemapPaths(xml: string): string[] {
  const paths: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const pathname = new URL(match[1]).pathname;
    paths.push(pathname === '/' ? '/' : pathname.replace(/\/$/, ''));
  }
  return paths;
}

describe('reactSnap.include', () => {
  it('prerenders every public sitemap URL, including /rules/weapon-balance', () => {
    const root = process.cwd();
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      reactSnap: { include: string[] };
    };
    const sitemap = fs.readFileSync(path.join(root, 'public', 'sitemap.xml'), 'utf8');

    sitemapPaths(sitemap).forEach((route) => {
      expect(pkg.reactSnap.include).toContain(route);
    });
  });
});
