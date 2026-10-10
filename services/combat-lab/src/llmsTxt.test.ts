import fs from 'fs';
import path from 'path';

// public/llms.txt is crawler guidance. The mass view is an unfinished stub
// (empty ShootMassAnalysisSection, header button commented out), so this file
// must not send readers to /?view=mass.
const llmsTxt = fs.readFileSync(path.join(process.cwd(), 'public/llms.txt'), 'utf8');

describe('public/llms.txt', () => {
  it('does not link the unfinished mass analysis view', () => {
    expect(llmsTxt).not.toMatch(/\?view=mass\b/);
    expect(llmsTxt).not.toMatch(/mass matchup analysis/i);
    expect(llmsTxt).not.toMatch(/Mass analysis matrix/);
  });

  it('lists the live calculator views', () => {
    expect(llmsTxt).toContain('https://ktcalc.com/?view=shoot');
    // The fight calculator is linked either as /?view=fight or its own /fight/ path.
    expect(llmsTxt).toMatch(/https:\/\/ktcalc\.com\/(\?view=fight|fight\/?)\)/);
  });

  it('lists every /notes/ URL from the sitemap', () => {
    const sitemap = fs.readFileSync(path.join(process.cwd(), 'public/sitemap.xml'), 'utf8');
    const notesLocs = [...sitemap.matchAll(/<loc>(https:\/\/ktcalc\.com\/notes\/[^<]*)<\/loc>/g)].map(
      (match) => match[1],
    );
    expect(notesLocs.length).toBeGreaterThan(0);
    notesLocs.forEach((loc) => {
      expect(llmsTxt).toContain(loc);
    });
  });
});

describe('public/index.html', () => {
  it('does not describe the unfinished mass analysis in its structured data', () => {
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
    expect(indexHtml).not.toMatch(/mass matchup analysis/i);
  });
});
