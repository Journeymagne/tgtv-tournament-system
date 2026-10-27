// Loaded with the administrator UI; the server separately authorizes every request.
async function showResourceQuotas(userId) {
  let data;
  try { data = await api(`/api/admin/users/${userId}/quotas`); }
  catch (error) { setMessage(error.message, true); return; }
  const dialog = administrationDialog(adminLabel('Квоты: ', 'Quotas: ') + data.user.name, `
    <p>${adminLabel('Индивидуальные квоты действуют и для игроков, и для администраторов. Пустое поле возвращает стандартный лимит. Существующие данные не удаляются.', 'Individual quotas apply to players and administrators. Leave a field empty to restore its default. Existing data is preserved.')}</p>
    <form data-resource-quotas class="admin-dialog-form">
      <div class="resource-quota-grid">${data.catalog.map(rule => {
        const factor = rule.unit === 'bytes' ? 1024 * 1024 : 1;
        const usage = data.usage[rule.key];
        return `<label>${escapeHtml(adminLabel(rule.ru, rule.en))}${factor > 1 ? ' (MiB)' : ''}
          <input type="number" name="${escapeHtml(rule.key)}" min="${rule.default / factor}" max="${rule.max / factor}" step="1"
            placeholder="${rule.default / factor}" value="${data.overrides[rule.key] === undefined ? '' : data.overrides[rule.key] / factor}">
          <small>${adminLabel('Стандарт: ', 'Default: ')}${rule.default / factor}${usage === undefined ? '' : ' · ' + adminLabel('Использовано: ', 'Used: ') + (factor > 1 ? (Number(usage) / factor).toFixed(1) : usage)}</small></label>`;
      }).join('')}</div>
      <label>${adminLabel('Причина изменения', 'Reason for change')}<input name="reason" required minlength="3" maxlength="1000"></label>
      <div class="row-actions"><button type="button" class="small-button" data-quota-reset>${adminLabel('Вернуть стандартные квоты', 'Restore default quotas')}</button>
      <button type="submit" class="primary-button">${t('common.save')}</button></div>
    </form>`);
  dialog.classList.add('resource-quota-dialog');
  const form = dialog.querySelector('[data-resource-quotas]');
  dialog.querySelector('[data-quota-reset]').onclick = () => { for (const rule of data.catalog) form.elements[rule.key].value = ''; };
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const overrides = {};
      for (const rule of data.catalog) if (form.elements[rule.key].value !== '') overrides[rule.key] = Number(form.elements[rule.key].value) * (rule.unit === 'bytes' ? 1024 * 1024 : 1);
      await api(`/api/admin/users/${userId}/quotas`, { method: 'PATCH', body: { overrides, revision: data.revision, reason: form.elements.reason.value } });
      dialog.close(); setMessage(adminLabel('Квоты сохранены.', 'Quotas saved.'));
    } catch (error) { dialog.querySelector('[data-dialog-error]').textContent = error.message; }
    finally { button.disabled = false; }
  };
}

function wireRemoteUserPickers(root) {
  root.querySelectorAll('select[data-remote-users]').forEach(select=>{
    if(select.dataset.remoteReady)return; select.dataset.remoteReady='true';
    const input=root.querySelector('[data-judge-search]')||document.createElement('input'); input.type='search'; input.placeholder=adminLabel('Поиск игрока','Find a player');
    input.setAttribute('aria-label',input.placeholder); if(!input.isConnected)select.before(input);
    let timer,sequence=0;
    input.oninput=()=>{clearTimeout(timer);const current=++sequence;timer=setTimeout(async()=>{
      try {const data=await api('/api/users/search?q='+encodeURIComponent(input.value));
        if(current!==sequence||!input.isConnected)return;
        select.replaceChildren(...data.users.map(user=>new Option(user.name,user.id)));
        select.disabled=!data.users.length;
      }catch(error){setMessage(error.message,true);}
    },220);};
  });
}

function inlinePages(container,pagination,load) {
  const previous=container.querySelector('[data-inline-pages]'); previous?.remove();
  if(!pagination||pagination.totalPages<=1)return;
  const controls=document.createElement('div'); controls.dataset.inlinePages='true';controls.className='pagination-row';
  controls.innerHTML=`<button class="small-button" data-page="${pagination.currentPage-1}" ${pagination.currentPage===1?'disabled':''}>${t('leaderboard.pagination.previous')}</button><span>${pagination.currentPage} / ${pagination.totalPages}</span><button class="small-button" data-page="${pagination.currentPage+1}" ${pagination.currentPage===pagination.totalPages?'disabled':''}>${t('leaderboard.pagination.next')}</button>`;
  container.append(controls);
  controls.querySelectorAll('button').forEach(button=>button.onclick=async()=>{button.disabled=true;try{
    const next=await load(Number(button.dataset.page));inlinePages(container,next,load);
  }catch(error){button.disabled=false;setMessage(error.message,true);}});
}

function wireRemoteAccountCombos(root) {
  root?.querySelectorAll('[data-combo-options="users"]').forEach(combo=>{
    if(combo.dataset.remoteAccounts)return;combo.dataset.remoteAccounts='true';
    const input=combo.querySelector('[data-combo-input]');let timer,sequence=0;
    input.addEventListener('input',()=>{clearTimeout(timer);const current=++sequence,query=input.value;
      timer=setTimeout(async()=>{try{const data=await api('/api/users/search?q='+encodeURIComponent(query));
        if(current!==sequence||!input.isConnected)return;
        combo.dataset.comboItems=JSON.stringify(userComboItems(data.users));combo.dispatchEvent(new Event('combo-options-change'));
      }catch(error){setMessage(error.message,true);}},220);
    });
  });
}
