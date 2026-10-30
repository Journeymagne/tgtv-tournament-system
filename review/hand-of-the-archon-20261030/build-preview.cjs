const fs = require('node:fs');
const path = require('node:path');
const wahapediaSources = require('./wahapedia-sources.cjs');
const questions = require('./questions.cjs').map(q => ({
  ...q,
  references: wahapediaSources[q.id],
  ...(q.id === 'hoa-011' || q.id === 'hoa-012' ? {
    sourceNote: 'В январском тексте Wahapedia ещё нет октябрьского уточнения «в начале действия». Для ответа используйте также официальную errata по ссылке выше.',
  } : {}),
}));
const outputPath = path.join(__dirname, 'Hand-of-the-Archon-preview.html');
// Retain selections if the user saved a self-contained review over this file.
const previousHTML = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
const savedReview = previousHTML.match(/<script type="application\/json" id="saved-review">([\s\S]*?)<\/script>/)?.[1] || 'null';
const shared = path.join(__dirname, '../know-thy-kill-team-20261016');
const read = name => fs.readFileSync(path.join(shared, name), 'utf8');
const safeJSON = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const count = questions.length;
let js = read('review.js')
  .replaceAll('kt-review-2026-10-16-v1', 'hoa-preview-2026-10-30-v1')
  .replaceAll('200', String(count))
  .replaceAll("['all',1,2,3,4]", "['all',3,4]")
  .replaceAll('know-thy-kill-team-selection.json', 'hand-of-the-archon-selection.json')
  .replaceAll('know-thy-kill-team-review.csv', 'hand-of-the-archon-review.csv')
  .replaceAll('Know-Thy-Kill-Team-reviewed.html', 'Hand-of-the-Archon-reviewed.html')
  .replace('${esc(q.source.section)}</a>', '${esc(q.source.section)}</a><div class="wahapedia-links">${(q.references || []).map(ref => `<a class="source" href="${esc(ref.url)}" target="_blank" rel="noopener noreferrer">Wahapedia · ${esc(ref.title)} ↗</a>`).join(\'\')}</div>${q.sourceNote ? `<p class="source-note">${esc(q.sourceNote)}</p>` : \'\'}')
  .replace("'Источник','Раздел','Замечание'", "'Источник','Раздел','Wahapedia','Замечание'")
  .replace("q.source.url,q.source.section,review.notes[q.id]", "q.source.url,q.source.section,(q.references || []).map(ref => ref.title + ': ' + ref.url).join('\\n'),review.notes[q.id]");
let html = read('review.template.html')
  .replace(/<title>.*?<\/title>/, '<title>Hand of the Archon · Сложные вопросы · Превью</title>')
  .replace(/<section class="intro">[\s\S]*?<\/section>/, `<section class="intro">
    <span class="eyebrow">ПРЕВЬЮ · 30 ОКТЯБРЯ 2026</span>
    <h1>Hand of the Archon <span>${count} сложных вопросов</span></h1>
    <p>Ситуации уровней «Ветеран» и «Эксперт»: Pain tokens, ploys, яды, спецоперативники и взаимодействия с базовыми правилами. У каждого вопроса четыре ответа, разбор, официальный источник и ссылки на соответствующие правила Wahapedia.</p>
    <p class="scope">Отметьте «Добавить» у понравившихся вопросов и оставьте замечания. Это отдельное превью: отметки сохраняют ваш выбор для обсуждения. Публикация в банк вопросов выполняется отдельно.</p>
    <details class="research"><summary>Источники и версия правил</summary>
      <p>Основной источник — <a href="https://assets.warhammer-community.com/eng_28-10_kill_team_team_rules_hand_of_the_archon-1pzipa9jpj-tgfmqz67em.pdf" target="_blank" rel="noopener">официальный PDF от 28.10.2026</a>, включая октябрьскую errata. В вопросах о Merciless Sadists и Prey on the Wounded учитывается состояние цели в начале действия.</p>
      <p>Дополнительные ссылки: <a href="https://wahapedia.ru/kill-team3/kill-teams/hand-of-the-archon/" target="_blank" rel="noopener">Wahapedia — команда</a>, <a href="https://wahapedia.ru/kill-team3/the-rules/core-rules/" target="_blank" rel="noopener">базовые правила</a>. Страница команды на Wahapedia отмечена январской версией; октябрьские изменения взяты из официального PDF.</p>
      <p>Вопросы по времени применения Adrenalight отложены: текст карточки в октябрьском PDF расходится с приведённой в нём предыдущей errata.</p>
    </details>
  </section>`)
  .replace('<option value="200">Все 200</option>', `<option value="${count}">Все ${count}</option>`)
  .replace('Новые вопросы Kill Team 2024 для согласования', 'Hand of the Archon: сложные вопросы для согласования')
  .replace('Базовые правила и названные в условиях дополнения.', 'Hand of the Archon · редакторский набор от 30.10.2026.')
  .replace('/* COMPANION_TOKENS */', fs.readFileSync(path.join(__dirname, '../../public/companion-tokens.css'), 'utf8'))
  .replace('/* REVIEW_CSS */', read('review.css') + '\n#levels{grid-template-columns:repeat(3,1fr)}.research{font-size:13px;color:var(--muted);margin-top:18px}.research summary{cursor:pointer;color:var(--ink)}.research a{color:var(--accent-text)}.wahapedia-links{margin-top:12px;padding-top:8px;border-top:1px solid var(--line)}.wahapedia-links a{margin-top:5px}.source-note{font-size:11px;color:var(--muted);margin-top:8px}@media(max-width:800px){#levels{grid-template-columns:repeat(2,1fr)}}')
  .replace('<script type="application/json" id="saved-review">null</script>', () => '<script type="application/json" id="saved-review">' + savedReview + '</script>')
  .replace('/* REVIEW_DATA */', safeJSON(questions))
  .replace('/* REVIEW_CODE */', safeJSON(js))
  .replace('/* REVIEW_JS */', js);
fs.writeFileSync(path.join(__dirname, 'candidates.json'), JSON.stringify(questions, null, 2) + '\n');
fs.writeFileSync(outputPath, html);
console.log(`Created standalone preview: ${count} questions, ${questions.filter(q => q.difficulty === 3).length} veteran / ${questions.filter(q => q.difficulty === 4).length} expert.`);
