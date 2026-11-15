(function () {
  'use strict';
  window.KTTrainingModeration = function ({ main, api, esc, notify, onChange }) {
    let items = [], filter = 'review', search = '', selected = null, generation = 0, dirty = false, saving = false;
    const labels = { active: 'В пуле', review: 'На модерации', deleted: 'Удалён' };
    const actions = { report: 'Слоп · жалоба', save: 'Правки сохранены', restore: 'Возвращён в пул', delete: 'Удалён из пула', comment: 'Комментарий' };
    const $ = selector => main.querySelector(selector);
    const current = token => generation === token && location.hash === '#moderation';
    function message(text, error = false) {
      const target = $('#moderation-message');
      if (target) { target.textContent = text; target.classList.toggle('error-text', error); }
    }
    function list() {
      const query = search.trim().toLocaleLowerCase('ru');
      const visible = items.filter(q => (filter === 'all' || q.status === filter) && `${q.id} ${q.question} ${q.topic}`.toLocaleLowerCase('ru').includes(query));
      $('#moderation-count').textContent = `${visible.length} вопросов`;
      $('#moderation-list').innerHTML = visible.map(q => `<button type="button" class="moderation-list-item ${selected?.id === q.id ? 'selected' : ''}" data-edit-question="${esc(q.id)}"><span class="moderation-item-top"><b data-ui-skip>${esc(q.id.toUpperCase())}</b><span class="moderation-status status-${q.status}">${labels[q.status]}</span></span><span data-ui-skip>${esc(q.question)}</span><small>Уровень ${q.difficulty} · Жалоб: ${q.reportCount}</small></button>`).join('') || '<p class="muted moderation-empty">Вопросов по этому фильтру нет.</p>';
      main.querySelectorAll('[data-edit-question]').forEach(button => button.addEventListener('click', () => {
        if (saving || dirty && !window.confirm('Перейти к другому вопросу без сохранения правок?')) return;
        load(button.dataset.editQuestion);
      }));
    }
    function history(events) {
      return events.map(event => {
        const snapshot = event.snapshot.after || event.snapshot;
        return `<article class="moderation-event"><div><strong>${actions[event.action]}</strong><small data-ui-skip>${esc(event.author || 'Обращение пользователя')} · ${esc(new Date(event.created_at).toLocaleString('ru-RU'))}</small></div>${event.comment ? `<p data-ui-skip>${esc(event.comment)}</p>` : '<p class="muted">Без комментария</p>'}${snapshot.question ? `<details><summary>Версия вопроса в этот момент</summary><p data-ui-skip>${esc(snapshot.question)}</p><ol type="A" data-ui-skip>${snapshot.options.map((option, i) => `<li>${esc(option)}${i === snapshot.answer ? ' ✓' : ''}</li>`).join('')}</ol><p data-ui-skip>${esc(snapshot.explanation)}</p></details>` : ''}</article>`;
      }).join('') || '<p class="muted">Комментариев и действий пока нет.</p>';
    }
    function editor(data, draft = null) {
      selected = data.question; dirty = Boolean(draft);
      const q = draft ? { ...draft, status: selected.status, version: selected.version } : selected;
      $('#moderation-editor').innerHTML = `<div class="moderation-editor-heading"><div><span class="eyebrow" data-ui-skip>${esc(q.id.toUpperCase())} · ВЕРСИЯ ${q.version}</span><h2>Редактирование вопроса</h2></div><span class="moderation-status status-${q.status}">${labels[q.status]}</span></div>
        <p class="small muted">«Сохранить правки» оставляет вопрос вне пула. «Вернуть в пул» сохраняет форму и снова включает вопрос в тренировки. История ответов сохраняется.</p>
        <form id="moderation-form"><div class="moderation-fields"><label>Вопрос<textarea name="question" rows="4" required minlength="5" maxlength="4000">${esc(q.question)}</textarea></label>
        <div class="moderation-field-row"><label>Тема<input name="topic" required maxlength="100" value="${esc(q.topic)}"></label><label>Сложность<select name="difficulty">${['Рекрут','Боец','Ветеран','Эксперт'].map((label, i) => `<option value="${i + 1}" ${q.difficulty === i + 1 ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
        <fieldset class="moderation-options"><legend>Варианты ответа · отметьте правильный</legend>${q.options.map((option, i) => `<div class="moderation-option"><label class="moderation-answer-radio"><input type="radio" name="answer" value="${i}" ${q.answer === i ? 'checked' : ''} required><span data-ui-skip translate="no">${'ABCD'[i]}</span></label><textarea name="option${i}" rows="2" required maxlength="2000" aria-label="Вариант ${i + 1}">${esc(option)}</textarea></div>`).join('')}</fieldset>
        <label>Объяснение правильного ответа<textarea name="explanation" rows="4" required maxlength="6000">${esc(q.explanation)}</textarea></label>
        <label>Название источника<input name="sourceTitle" required maxlength="200" value="${esc(q.source.title)}"></label><label>Ссылка на правило<input name="sourceUrl" type="url" required maxlength="2000" value="${esc(q.source.url)}"></label><label>Раздел источника<input name="sourceSection" required maxlength="300" value="${esc(q.source.section)}"></label>
        <label>Комментарий к вопросу<textarea name="comment" rows="3" maxlength="4000" placeholder="Что исправлено, почему вопрос возвращён или удалён…"></textarea></label></div>
        <p id="moderation-form-error" class="error-text" role="alert"></p><div class="moderation-actions"><button type="submit" name="action" value="restore" class="button primary">Вернуть в пул</button><button type="submit" name="action" value="save" class="button secondary">Сохранить правки</button><button type="submit" name="action" value="comment" formnovalidate class="button secondary">Добавить комментарий</button><button type="submit" name="action" value="delete" formnovalidate class="button secondary moderation-delete" ${q.status === 'deleted' ? 'disabled' : ''}>Удалить</button><button type="button" id="moderation-reload" class="button secondary">Обновить вопрос</button></div></form>
        <section class="moderation-history"><h3>Жалобы, комментарии и решения</h3>${history(data.events)}</section>`;
      $('#moderation-form').addEventListener('input', () => { dirty = true; });
      $('#moderation-form').addEventListener('submit', submit);
      $('#moderation-reload').addEventListener('click', () => {
        if (!saving && (!dirty || window.confirm('Загрузить актуальную версию и сбросить несохранённые правки?'))) load(q.id);
      });
      list();
    }
    async function load(id) {
      const token = ++generation;
      message('Загружаем вопрос…');
      try {
        const data = await api.moderationQuestion(id);
        if (current(token)) { editor(data); message(''); }
      } catch (error) { if (current(token)) message(error.message, true); }
    }
    async function submit(event) {
      event.preventDefault();
      if (saving) return;
      const form = event.currentTarget, values = new FormData(form), action = event.submitter?.value || 'save';
      if (action === 'delete' && !window.confirm('Удалить вопрос из пула? Его история и комментарии останутся доступны администраторам.')) return;
      const q = { ...selected, difficulty: Number(values.get('difficulty')), question: values.get('question'), topic: values.get('topic'),
        options: [0,1,2,3].map(i => values.get('option' + i)), answer: Number(values.get('answer')), explanation: values.get('explanation'),
        source: { title: values.get('sourceTitle'), url: values.get('sourceUrl'), section: values.get('sourceSection') } };
      const hasEdits = ['difficulty', 'question', 'topic', 'answer', 'explanation'].some(key => q[key] !== selected[key]) ||
        q.options.some((option, i) => option !== selected.options[i]) || ['title','url','section'].some(key => q.source[key] !== selected.source[key]);
      const token = generation;
      saving = true;
      const disabled = [...form.querySelectorAll('button,input,textarea,select')].map(node => [node, node.disabled]);
      disabled.forEach(([node]) => { node.disabled = true; });
      $('#moderation-form-error').textContent = '';
      try {
        const data = await api.moderate(selected.id, { action, question: q, comment: values.get('comment'), revision: selected.revision, requestId: crypto.randomUUID() });
        await onChange();
        const next = await api.moderation();
        if (current(token)) { items = next.questions; editor(data, action === 'comment' && hasEdits ? q : null); message(actions[action]); notify(actions[action]); }
      } catch (error) {
        if (current(token)) $('#moderation-form-error').textContent = error.message;
      } finally {
        saving = false;
        disabled.forEach(([node, wasDisabled]) => { node.disabled = wasDisabled; });
      }
    }
    async function open() {
      const token = ++generation; selected = null; dirty = false;
      main.innerHTML = `<div class="page-heading"><div><span class="eyebrow">KNOW THY KILL TEAM · АДМИНИСТРАТОР</span><h1>Модерация вопросов</h1><p class="muted">Жалоба «Слоп» сразу снимает вопрос с выдачи. Проверьте правило, исправьте формулировку и примите решение.</p></div></div>
        <p id="moderation-message" role="status"></p><div class="moderation-layout"><aside class="moderation-queue"><label>Статус<select id="moderation-filter"><option value="review">На модерации</option><option value="active">В пуле</option><option value="deleted">Удалённые</option><option value="all">Все вопросы</option></select></label><label>Поиск<input type="search" id="moderation-search" placeholder="ID, тема или формулировка…" value="${esc(search)}"></label><div class="moderation-queue-heading"><span id="moderation-count"></span><button type="button" id="moderation-refresh" class="button secondary">Обновить</button></div><div id="moderation-list"></div></aside><section id="moderation-editor" class="moderation-editor"><p class="muted moderation-empty">Выберите вопрос из списка.</p></section></div>`;
      $('#moderation-filter').value = filter;
      $('#moderation-filter').addEventListener('change', event => { filter = event.target.value; list(); });
      $('#moderation-search').addEventListener('input', event => { search = event.target.value; list(); });
      $('#moderation-refresh').addEventListener('click', async () => {
        try { const data = await api.moderation(); if (location.hash === '#moderation') { items = data.questions; list(); message('Список обновлён. Открытая форма сохранена.'); } }
        catch (error) { message(error.message, true); }
      });
      try { const data = await api.moderation(); if (current(token)) { items = data.questions; list(); } }
      catch (error) { if (current(token)) message(error.message, true); }
    }
    return { open };
  };
})();
