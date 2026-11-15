const { HttpError } = require('../http/io');
function text(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, `${label}: от ${min} до ${max} символов.`);
  }
  return value.trim();
}
function content(body, id) {
  if (!body || ![1,2,3,4].includes(body.difficulty)) throw new HttpError(400, 'Выберите сложность.');
  if (!Array.isArray(body.options) || body.options.length !== 4) throw new HttpError(400, 'Нужно четыре варианта ответа.');
  const options = body.options.map(option => text(option, 'Вариант ответа', 1, 2000));
  if (new Set(options.map(option => option.toLocaleLowerCase('ru'))).size !== 4) throw new HttpError(400, 'Варианты ответа должны различаться.');
  if (!Number.isInteger(body.answer) || body.answer < 0 || body.answer > 3) throw new HttpError(400, 'Укажите правильный ответ.');
  const sourceUrl = text(body.source?.url, 'Ссылка на правило', 1, 2000);
  let url;
  try { url = new URL(sourceUrl); } catch { throw new HttpError(400, 'Некорректная ссылка на правило.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new HttpError(400, 'Нужна HTTP(S)-ссылка на правило без данных входа.');
  return { id, difficulty: body.difficulty, topic: text(body.topic, 'Тема', 1, 100),
    ...(body.team ? { team: body.team } : {}),
    ...(body.references ? { references: body.references } : {}),
    ...(body.sourceNote ? { sourceNote: body.sourceNote } : {}),
    question: text(body.question, 'Вопрос', 5, 4000), options, answer: body.answer,
    explanation: text(body.explanation, 'Объяснение', 1, 6000),
    source: { title: text(body.source?.title, 'Название источника', 1, 200), url: sourceUrl,
      section: text(body.source?.section, 'Раздел источника', 1, 300) } };
}
module.exports = { content, comment: value => text(value ?? '', 'Комментарий', 0, 4000) };
