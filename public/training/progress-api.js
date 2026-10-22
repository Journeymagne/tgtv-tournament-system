(function () {
  'use strict';
  let accountId = null;
  let csrf = '';
  async function request(path, body) {
    const headers = { 'Accept': 'application/json' };
    if (accountId !== null) headers['X-Training-Account'] = String(accountId);
    if (body) { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = csrf; }
    let response;
    try { response = await fetch('/api/knowthykt/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw new Error('Нет связи с сервером. Ответ пока не подтверждён. Проверьте соединение и повторите действие.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Не удалось получить ответ сервера. Повторите действие.');
      error.status = response.status;
      throw error;
    }
    if (data.csrfToken) csrf = data.csrfToken;
    return data;
  }
  window.KTTrainingAPI = {
    questions: revision => request('questions' + (revision === undefined ? '' : '?revision=' + encodeURIComponent(revision))),
    report: (id, body) => request('questions/' + encodeURIComponent(id) + '/report', body),
    moderation: () => request('moderation'),
    moderationQuestion: id => request('moderation/' + encodeURIComponent(id)),
    moderate: (id, body) => request('moderation/' + encodeURIComponent(id), body),
    async connect(user) {
      accountId = user.id;
      // Shared header also uses this fixed identity to detect account switches.
      window.KTAccount = { id: accountId };
      return request('progress');
    },
    refresh: () => request('progress'),
    start: body => request('sessions', body),
    answer: (id, body) => request('sessions/' + encodeURIComponent(id) + '/answers', body),
    advance: (id, body) => request('sessions/' + encodeURIComponent(id) + '/advance', body)
  };
})();
