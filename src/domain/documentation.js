const fs = require("node:fs");
const path = require("node:path");
const MarkdownIt = require("markdown-it");
const manifest = require("../../docs/documentation/pages.json");

const LOCALES = ["ru", "en"];
const PAGE_IDS = manifest.en.map((page) => page.id);
const MAX_MARKDOWN_LENGTH = 100_000;
const markdown = new MarkdownIt({ html: false, linkify: false, breaks: false });
// Keep tables and code usable within the existing responsive documentation layout.
markdown.renderer.rules.table_open = () => '<div class="documentation-table-scroll" tabindex="0"><table>\n';
markdown.renderer.rules.table_close = () => '</table></div>\n';
markdown.renderer.rules.th_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet("scope", "col");
  return renderer.renderToken(tokens, index, options);
};

function renderMarkdown(source) {
  const env = {};
  const tokens = markdown.parse(source, env);
  const headings = [];
  const used = new Set();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== "heading_open") continue;
    const inline = tokens[index + 1];
    const title = (inline.children || []).map((child) => child.content || "").join("");
    const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section";
    const base = `doc-${slug}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    token.attrSet("id", id);
    const level = Number(token.tag.slice(1));
    token.tag = `h${Math.min(6, Math.max(3, level + 1))}`;
    tokens[index + 2].tag = token.tag;
    if (level <= 3 && token.level === 0) headings.push({ id, title });
  }
  return { html: markdown.renderer.render(tokens, markdown.options, env), headings };
}

function defaultPages() {
  return LOCALES.flatMap((locale) => manifest[locale].map((page) => ({
    ...page,
    locale,
    markdown: fs.readFileSync(path.join(__dirname, "../../docs/documentation", locale, `${page.id}.md`), "utf8")
  })));
}

module.exports = { LOCALES, PAGE_IDS, MAX_MARKDOWN_LENGTH, renderMarkdown, defaultPages };
