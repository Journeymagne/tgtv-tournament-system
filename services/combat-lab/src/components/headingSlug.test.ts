import {
  githubHeadingSlug,
  HastNode,
  HeadingSlugger,
  rehypeHeadingIds,
} from 'src/components/headingSlug';

describe('githubHeadingSlug', () => {
  // These are the fragments already written in rules/*.md. They match GitHub.
  it('matches the in-doc anchor links', () => {
    expect(githubHeadingSlug('Strike order: crit-first, except to deny a normal parry')).toBe(
      'strike-order-crit-first-except-to-deny-a-normal-parry',
    );
    expect(githubHeadingSlug('Reproducing this')).toBe('reproducing-this');
  });

  it('drops punctuation the way GitHub does, including em dashes', () => {
    expect(githubHeadingSlug('Just a Scratch (Crits)')).toBe('just-a-scratch-crits');
    expect(githubHeadingSlug('Lethal X+')).toBe('lethal-x');
    expect(githubHeadingSlug("Why the calculator doesn't decide this for you")).toBe(
      'why-the-calculator-doesnt-decide-this-for-you',
    );
    expect(githubHeadingSlug('Scenario A — normal parry cannot touch a crit')).toBe(
      'scenario-a--normal-parry-cannot-touch-a-crit',
    );
    expect(githubHeadingSlug('Scenario C — when order does not matter')).toBe(
      'scenario-c--when-order-does-not-matter',
    );
  });

  it('drops non-ASCII punctuation and symbols, keeps non-ASCII letters', () => {
    expect(githubHeadingSlug('Wait… 2× damage → 1½ wounds')).toBe('wait-2-damage--1-wounds');
    expect(githubHeadingSlug('Café under_score')).toBe('café-under_score');
  });
});

describe('HeadingSlugger', () => {
  it('suffixes a repeated heading', () => {
    const slugger = new HeadingSlugger();
    expect(slugger.slug('Reroll Targeting Strategy')).toBe('reroll-targeting-strategy');
    expect(slugger.slug('No Double Reroll Rule')).toBe('no-double-reroll-rule');
    expect(slugger.slug('Reroll Targeting Strategy')).toBe('reroll-targeting-strategy-1');
    expect(slugger.slug('No Double Reroll Rule')).toBe('no-double-reroll-rule-1');
  });
});

describe('rehypeHeadingIds', () => {
  const text = (value: string): HastNode => ({ type: 'text', value });
  const el = (tagName: string, children: HastNode[], properties = {}): HastNode => ({
    type: 'element',
    tagName,
    properties,
    children,
  });

  it('gives each heading the GitHub id of its visible text, suffixing repeats', () => {
    const h2a = el('h2', [text('Reroll Targeting Strategy')]);
    const h3 = el('h3', [text('Scenario C — when order does '), el('strong', [text('not')]), text(' matter')]);
    const h2b = el('h2', [text('Reroll Targeting Strategy')]);
    const p = el('p', [text('Reroll Targeting Strategy')]);
    const tree: HastNode = { type: 'root', children: [h2a, p, h3, h2b] };

    rehypeHeadingIds()(tree);

    expect(h2a.properties?.id).toBe('reroll-targeting-strategy');
    expect(h3.properties?.id).toBe('scenario-c--when-order-does-not-matter');
    expect(h2b.properties?.id).toBe('reroll-targeting-strategy-1');
    expect(p.properties?.id).toBeUndefined();
  });

  it('gives the same ids when the same document is processed again', () => {
    const build = (): HastNode => ({
      type: 'root',
      children: [el('h2', [text('Reroll Targeting Strategy')]), el('h2', [text('Reroll Targeting Strategy')])],
    });
    const transform = rehypeHeadingIds();
    const first = build();
    const second = build();
    transform(first);
    transform(second);
    const ids = (t: HastNode) => t.children?.map((c) => c.properties?.id);
    expect(ids(second)).toEqual(ids(first));
    expect(ids(first)).toEqual(['reroll-targeting-strategy', 'reroll-targeting-strategy-1']);
  });

  it('counts image alt text, as GitHub does', () => {
    const h = el('h2', [el('img', [], { alt: 'Icon' }), text(' Rules')]);
    rehypeHeadingIds()({ type: 'root', children: [h] });
    expect(h.properties?.id).toBe('icon-rules');
  });
});
