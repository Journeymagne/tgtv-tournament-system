const { defaultPages } = require("../../domain/documentation");

const previousCopy = {
  ru: {
    intro: "Что нового в KT Companion: последние 10 выпущенных обновлений, от новых к старым.",
    newIntro: "История обновлений KT Companion, от новых к старым.",
    summary: "Последние 10 обновлений KT Companion: новые возможности и исправления."
  },
  en: {
    intro: "What's new in KT Companion: the latest 10 released updates, newest first.",
    newIntro: "KT Companion release history, newest first.",
    summary: "The latest 10 KT Companion updates: new features and fixes."
  }
};

function releaseHeadings(markdown) {
  return [...markdown.matchAll(/^## (\d+)\.(\d+)\.(\d+)(?=\s|$)/gm)].map(match => ({
    version: match.slice(1).map(Number),
    index: match.index
  }));
}

function compareVersions(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

module.exports = {
  version: 86,
  name: "public_changelog_backfill",
  async up(client) {
    for (const page of defaultPages().filter(page => page.id === "changelog")) {
      const { rows: [current] } = await client.query(
        "SELECT markdown, summary FROM tournaments.documentation_pages WHERE page_id='changelog' AND locale=$1 FOR UPDATE",
        [page.locale]
      );
      if (!current) continue;

      const copy = previousCopy[page.locale];
      let markdown = current.markdown.replace(copy.intro, copy.newIntro);
      const summary = current.summary === copy.summary ? page.summary : current.summary;
      const releases = releaseHeadings(page.markdown);

      for (const [i, release] of releases.entries()) {
        if (compareVersions(release.version, [1, 4, 35]) <= 0 ||
            compareVersions(release.version, [1, 5, 14]) > 0) continue;

        const headings = releaseHeadings(markdown);
        if (headings.some(heading => compareVersions(heading.version, release.version) === 0)) continue;

        const section = page.markdown.slice(release.index, releases[i + 1]?.index).trimEnd();
        const next = headings.find(heading => compareVersions(heading.version, release.version) < 0);
        if (next) {
          markdown = markdown.slice(0, next.index) + section + "\n\n" + markdown.slice(next.index);
        } else {
          markdown = markdown.trimEnd() + "\n\n" + section + "\n";
        }
      }

      if (markdown === current.markdown && summary === current.summary) continue;
      await client.query(
        `UPDATE tournaments.documentation_pages
         SET markdown=$2, summary=$3, version=version+1, updated_at=NOW()
         WHERE page_id='changelog' AND locale=$1`,
        [page.locale, markdown, summary]
      );
    }
  }
};
