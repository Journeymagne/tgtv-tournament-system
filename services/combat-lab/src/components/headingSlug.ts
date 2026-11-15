// GitHub heading anchors, matching github-slugger (what GitHub and the links in
// rules/*.md already use): lowercase, punctuation and symbols removed, spaces to
// hyphens. A repeated heading in the same document gets -1, -2, and so on.
//
// github-slugger keeps letters, combining marks, decimal/letter numbers,
// connector punctuation (underscore), hyphen and space, and drops everything
// else. Em dashes are deleted, not turned into a single hyphen, so
// "Scenario A — normal…" becomes scenario-a--normal-…
const GITHUB_HEADING_STRIP = /[^\p{L}\p{M}\p{Nd}\p{Nl}\p{Pc} -]/gu;

export function githubHeadingSlug(value: string): string {
  return value.toLowerCase().replace(GITHUB_HEADING_STRIP, '').replace(/ /g, '-');
}

// Assigns ids in document order. Use one instance per document.
export class HeadingSlugger {
  private used: { [slug: string]: number } = Object.create(null);

  slug(value: string): string {
    const original = githubHeadingSlug(value);
    let result = original;
    while (Object.prototype.hasOwnProperty.call(this.used, result)) {
      this.used[original] += 1;
      result = `${original}-${this.used[original]}`;
    }
    this.used[result] = 0;
    return result;
  }
}

// Minimal hast shape: what react-markdown hands a rehype plugin.
export type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { [key: string]: unknown };
  children?: HastNode[];
};

// Visible text of a heading, with inline markup (emphasis, code, links) flattened
// away. Image alt text counts, as it does for GitHub.
function hastText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  if (node.type === 'element' && node.tagName === 'img') {
    const alt = node.properties?.alt;
    return typeof alt === 'string' ? alt : '';
  }
  return (node.children ?? []).map(hastText).join('');
}

const HEADING_TAG = /^h[1-6]$/;

// rehype plugin: give every heading a GitHub-style id. Runs once per parse with
// a fresh slugger, so ids depend only on the document, never on render order.
export function rehypeHeadingIds() {
  return (tree: HastNode) => {
    const slugger = new HeadingSlugger();
    const visit = (node: HastNode) => {
      if (node.type === 'element' && HEADING_TAG.test(node.tagName ?? '')) {
        node.properties = { ...node.properties, id: slugger.slug(hastText(node)) };
        return;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
