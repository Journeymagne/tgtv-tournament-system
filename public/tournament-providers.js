(function (root) {
  'use strict';

  const endpoint = '/api/tournament-providers';
  const catalogUrl = '/tournament#/tournaments/organizations';
  const profileUrl = slug => `${catalogUrl}/${encodeURIComponent(slug)}`;
  const groups = ['current', 'future', 'past', 'draft'];
  const disclosures = new Map();

  function eventCreationOptions(user, providers, fixedId = null) {
    if (!user) return [];
    const isAdmin = user.isAdmin || user.isSuperAdmin;
    const personal = isAdmin || user.capabilities?.canCreateTournaments;
    const options = personal ? [{ value: '', name: '' }] : [];
    for (const provider of providers) {
      if (provider.viewer?.canCreateEvents && !options.some(option => option.value === String(provider.id))) {
        options.push({ value: String(provider.id), name: provider.name });
      }
    }
    return fixedId === null ? options : options.filter(option => option.value === String(fixedId));
  }

  function eventProviderField({ options, selectedValue, fixed, t, escapeHtml, id }) {
    if (!options.length) return '';
    const label = t('providers.event.onBehalfOf');
    const optionName = option => escapeHtml(option.name || t('providers.event.personal'));
    if (fixed) {
      const option = options.find(item => item.value === selectedValue) || options[0];
      return `<div class="field"><span>${label}</span><strong>${optionName(option)}</strong><input type="hidden" name="providerId" value="${escapeHtml(option.value)}"></div>`;
    }
    return `<div class="field"><label for="${id}">${label}</label><select id="${id}" name="providerId">${options.map(option =>
      `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? ' selected' : ''}>${optionName(option)}</option>`
    ).join('')}</select></div>`;
  }

  function profileActions(viewer = {}) {
    const actions = [];
    if (viewer.canEdit) actions.push('edit');
    if (viewer.canCreateEvents) actions.push('createTournament', 'createCalendar');
    if (viewer.canManageMembers) actions.push('invite');
    if (viewer.canTransferOwnership) actions.push('transfer');
    if (viewer.canArchive) actions.push('archive');
    if (viewer.canRestore) actions.push('restore');
    if (viewer.isMember && !viewer.isOwner) actions.push('leave');
    return actions;
  }

  async function refreshAfterProviderError(error, submit, reload) {
    const restricted = error.status === 401 || error.status === 403;
    submit.disabled = restricted;
    if (restricted) await reload();
  }

  function mount(host, ctx) {
    const { api, t, escapeHtml: esc } = ctx;
    const tr = (key, vars) => t('providers.' + key, vars);
    const routeLink = (href, label, classes = 'text-link-button') =>
      `<a class="${classes}" href="${esc(href)}" data-app-link data-app-route>${esc(label)}</a>`;
    const button = (action, label, classes = 'small-button') =>
      `<button type="button" class="${classes}" data-provider-action="${action}">${esc(label)}</button>`;
    const errorPanel = message => `<div class="empty"><p role="alert">${esc(message)}</p>${button('retry', tr('retry'))}</div>`;
    const loading = () => `<div class="empty" role="status">${esc(t('common.loading'))}</div>`;
    const roleName = member => tr(`role.${member.isOwner ? 'owner' : member.role}`);
    const field = (id, label, markup) => `<div class="field"><label for="${id}">${esc(label)}</label>${markup}</div>`;
    const live = () => ctx.isCurrent() && host.isConnected;
    const resultGroups = new Map();
    let profile, dashboard, dialog, request = 0, stateKey = '', notice = '', noticeError = false;
    let filters = { q: '', city: '', mine: false, page: 1 };

    function pagination(p, action) {
      if (!p || p.totalPages < 2) return '';
      const { page, totalPages } = p;
      return `<nav class="provider-pagination" aria-label="${esc(tr('pagination'))}">
        <button type="button" class="small-button" data-provider-action="${action}" data-page="${page - 1}"${page <= 1 ? ' disabled' : ''}>${esc(tr('previous'))}</button>
        <span>${esc(tr('page', { page, totalPages }))}</span>
        <button type="button" class="small-button" data-provider-action="${action}" data-page="${page + 1}"${page >= totalPages ? ' disabled' : ''}>${esc(tr('next'))}</button>
      </nav>`;
    }

    function logo(provider) {
      const letters = String(provider.name || '').trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase();
      const src = ctx.logoUrl(provider);
      return `<span class="provider-logo" aria-hidden="true"><span>${esc(letters || 'KT')}</span>${src ? `<img src="${esc(src)}" loading="lazy" alt="" data-provider-image>` : ''}</span>`;
    }

    function invitationList(items, outgoing = false) {
      const focused = !outgoing && ctx.invitationId;
      if (!items.length && !focused) return '';
      const missing = focused && !items.some(invitation => String(invitation.id) === focused);
      return `<section class="card panel provider-panel" aria-label="${esc(tr(outgoing ? 'invitations.sent' : 'invitations.received'))}">
        <h3>${esc(tr(outgoing ? 'invitations.sent' : 'invitations.received'))}</h3>
        ${missing ? `<p class="empty" tabindex="-1" data-provider-invitation-focus>${esc(tr('invitations.unavailable'))}</p>` : ''}
        <div class="list">${items.map(invitation => {
          const isFocused = focused === String(invitation.id);
          return `<div class="row-card provider-member${isFocused ? ' provider-invitation-focus' : ''}" data-provider-invitation="${esc(invitation.id)}"${isFocused ? ' data-provider-invitation-focus tabindex="-1"' : ''}>
            <div class="row-main">
              <div class="row-title">${outgoing ? esc(invitation.inviteeName) : routeLink(profileUrl(invitation.provider.slug), invitation.provider.name)}</div>
              <div class="row-meta">${esc(roleName(invitation))}${!outgoing && invitation.invitedByName ? ` · ${esc(tr('invitations.from', { name: invitation.invitedByName }))}` : ''}</div>
            </div>
            <div class="row-actions">${outgoing ? button('revoke', tr('invitations.revoke'), 'danger-button') :
              button('accept', tr('invitations.accept'), 'primary-button') + button('decline', tr('invitations.decline'))}</div>
          </div>`;
        }).join('')}</div>
      </section>`;
    }

    function setNotice(text, isError = false) {
      notice = text;
      noticeError = isError;
      const target = host.querySelector('[data-provider-notice]');
      if (target) {
        target.textContent = notice;
        target.setAttribute('role', isError ? 'alert' : 'status');
        target.classList.toggle('error', isError);
      }
    }

    function renderCatalog() {
      host.innerHTML = `<section class="card panel provider-panel">
        <div class="panel-header provider-panel-header">
          <h2>${esc(tr('title'))}</h2>
          <div data-provider-create></div>
        </div>
        <form class="provider-filters" data-provider-filters>
          ${field('provider-search', tr('search'), `<input type="search" id="provider-search" name="q" maxlength="80" value="${esc(filters.q)}">`)}
          ${field('provider-city', tr('city'), `<select id="provider-city" name="city"><option value="">${esc(tr('allCities'))}</option></select>`)}
          ${ctx.user() ? `<div class="field"><label for="provider-scope">${esc(tr('scope'))}</label><select id="provider-scope" name="mine"><option value="">${esc(tr('all'))}</option><option value="1">${esc(tr('mine'))}</option></select></div>` : ''}
          <button class="small-button" type="submit">${esc(tr('searchButton'))}</button>
        </form>
        <div data-provider-results>${loading()}</div>
      </section>
      <div data-provider-inbox></div>
      <p class="message" data-provider-notice></p>`;
      host.querySelector('[data-provider-filters]').addEventListener('submit', event => {
        event.preventDefault();
        const fields = event.currentTarget.elements;
        filters = { q: fields.q.value.trim(), city: fields.city.value, mine: fields.mine?.value === '1', page: 1 };
        void load();
      });
      host.querySelectorAll('[data-provider-filters] select').forEach(select => {
        select.addEventListener('change', () => select.form.requestSubmit());
      });
    }

    function showCatalog(data) {
      const create = host.querySelector('[data-provider-create]');
      const createAllowed = ctx.user()?.capabilities?.canCreateProviders;
      if (Boolean(create.firstElementChild) !== Boolean(createAllowed)) {
        create.innerHTML = createAllowed ? button('new', tr('create'), 'primary-button') : '';
      }
      const select = host.querySelector('#provider-city');
      const cities = [...new Set([...(data.cities || []), filters.city].filter(Boolean))];
      select.replaceChildren(new Option(tr('allCities'), ''), ...cities.map(city => new Option(city, city)));
      select.value = filters.city;
      if (host.querySelector('#provider-scope')) host.querySelector('#provider-scope').value = filters.mine ? '1' : '';
      const cards = data.providers.map(provider => `<a class="row-card provider-card" href="${esc(profileUrl(provider.slug))}" data-app-link data-app-route aria-labelledby="provider-card-name-${provider.id}">
        ${logo(provider)}
        <div class="row-main">
          <div class="row-title" id="provider-card-name-${provider.id}">${esc(provider.name)}</div>
          <div class="row-meta">${esc(provider.city)}</div>
          ${provider.archivedAt ? `<span class="status">${esc(tr('archived'))}</span>` : ''}
        </div>
      </a>`).join('');
      host.querySelector('[data-provider-results]').innerHTML = cards
        ? `<div class="provider-catalog">${cards}</div>${pagination(data.pagination, 'catalogPage')}`
        : `<p class="empty">${esc(tr(filters.q || filters.city || filters.mine ? 'noResults' : 'emptyCatalog'))}</p>`;
      host.querySelector('[data-provider-inbox]').innerHTML = invitationList(dashboard?.invitations || []);
      focusInvitation();
      setNotice(notice, noticeError);
    }

    function memberRow(member, provider) {
      const viewer = provider.viewer;
      const editable = viewer?.canManageMembers && !member.isOwner;
      const controls = [];
      if (editable) controls.push(button('changeRole', tr('members.changeRole')), button('remove', tr('members.remove'), 'danger-button'));
      if (viewer?.canTransferOwnership && member.role === 'organizer') {
        if (!member.isOwner && !provider.coOwnerUserId) controls.push(button('addChief', tr('members.addChief')));
        if (member.isOwner && provider.coOwnerUserId) controls.push(button('removeChief', tr('members.removeChief')));
      }
      return `<div class="row-card provider-member" data-provider-member="${esc(member.userId)}">
        <div class="provider-identity">
          <span class="provider-avatar" aria-hidden="true">${ctx.avatarMarkup(member)}</span>
          <div class="row-main">
            <div class="row-title">${routeLink('/tournament#/players/' + encodeURIComponent(member.userId), member.name)}</div>
            <div class="row-meta">${esc(roleName(member))}</div>
          </div>
        </div>
        ${controls.length ? `<div class="row-actions">${controls.join('')}</div>` : ''}
      </div>`;
    }

    function profileAction(provider, action) {
      const label = tr(`action.${action}`);
      if (action === 'createTournament' || action === 'createCalendar') {
        const target = action === 'createTournament' ? '#/administration/tournaments/admin/create' : '#/calendar';
        return routeLink(`/tournament?provider=${encodeURIComponent(provider.slug)}${target}`, label, action === 'createTournament' ? 'primary-button' : 'small-button');
      }
      return button(action, label, ['leave', 'archive'].includes(action) ? 'danger-button' : 'small-button');
    }

    function disclosureKey(group) { return `${profile.provider.id}:${group}`; }

    function eventGroup(group) {
      const open = disclosures.get(disclosureKey(group)) ?? (group === 'current' || group === 'future');
      return `<details class="card panel provider-event-group" data-provider-group="${group}"${open ? ' open' : ''}>
        <summary><span>${esc(tr('events.' + group))}</span><span class="status">${esc(profile.counts[group])}</span></summary>
        <div data-provider-group-content>${loading()}</div>
      </details>`;
    }

    let invitationFocused = false;
    function focusInvitation() {
      if (ctx.invitationId && !invitationFocused) {
        const invitation = host.querySelector('[data-provider-invitation-focus]');
        if (invitation) {
          invitationFocused = true;
          invitation.focus();
        }
      }
    }

    function renderProfile() {
      const { provider, members, counts, invitations } = profile;
      const actions = new Set(profileActions(provider.viewer));
      if (provider.archivedAt) actions.delete('invite');
      if (!members.some(member => member.role === 'organizer' && !member.isOwner)) actions.delete('transfer');
      const incoming = (dashboard?.invitations || []).filter(invitation => invitation.provider.slug === provider.slug);
      host.innerHTML = `${routeLink(catalogUrl, tr('back'), 'text-link-button provider-back')}
        <section class="card panel provider-panel provider-overview">
          <div class="provider-identity provider-heading">${logo(provider)}<div>
            <h2 tabindex="-1" data-provider-heading>${esc(provider.name)}</h2>
            <p class="muted">${esc(provider.city)}${provider.archivedAt ? ` · ${esc(tr('archived'))}` : ''}</p>
          </div></div>
          ${provider.description ? `<div class="markdown-content">${ctx.markdownToHtml(provider.description)}</div>` : ''}
          ${actions.size ? `<div class="row-actions">${[...actions].map(action => profileAction(provider, action)).join('')}</div>` : ''}
          <p class="message" data-provider-notice></p>
        </section>
        ${invitationList(incoming)}
        <section class="card panel provider-panel">
          <h3>${esc(tr('members.title'))}</h3>
          <div class="list">${members.map(member => memberRow(member, provider)).join('') || `<p class="empty">${esc(tr('members.empty'))}</p>`}</div>
        </section>
        ${invitationList(invitations || [], true)}
        ${groups.filter(group => Object.hasOwn(counts, group)).map(eventGroup).join('')}`;
      setNotice(notice, noticeError);
      host.querySelectorAll('[data-provider-group]').forEach(section => {
        section.addEventListener('toggle', () => {
          const group = section.dataset.providerGroup;
          disclosures.set(disclosureKey(group), section.open);
          if (section.open) void loadGroup(section);
        });
        if (section.open) void loadGroup(section);
      });
      focusInvitation();
    }
    function calendarCard(event) {
      const href = `/tournament?calendarEvent=${encodeURIComponent(event.id)}&calendarMonth=${encodeURIComponent(event.date?.slice(0, 7) || '')}#/calendar`;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(event.date || '') ?
        new Intl.DateTimeFormat(ctx.locale(), { dateStyle: 'medium' }).format(new Date(event.date + 'T12:00:00')) : '';
      return `<article class="row-card provider-calendar-card">
        <div class="row-main">
          <span class="status">${esc(t('calendar.event'))}</span>
          <div class="row-title">${esc(event.name)}</div>
          <div class="row-meta">${esc([date, event.time, ...(event.venueMode === 'tts' ? [ctx.t('venue.tts')] : [event.city, event.venue])].filter(Boolean).join(' · '))}</div>
        </div>
        ${routeLink(href, t('common.open'), 'small-button')}
      </article>`;
    }

    function showGroup(section, data) {
      const target = section.querySelector('[data-provider-group-content]');
      target.innerHTML = data.items.length ? `<div class="list tournament-card-list">
        ${data.items.map(event => event.kind === 'tournament' ? ctx.tournamentCard(event) : calendarCard(event)).join('')}
      </div>${pagination(data.pagination, 'groupPage')}` : `<p class="empty">${esc(tr('events.empty'))}</p>`;
      ctx.wireTournamentCards(target);
    }

    async function loadGroup(section, page) {
      const group = section.dataset.providerGroup;
      const previous = resultGroups.get(group);
      const target = section.querySelector('[data-provider-group-content]');
      if (page === undefined && previous?.data) { showGroup(section, previous.data); return; }
      if (page === undefined && previous?.pending && previous.section === section) return;
      const current = { page: page ?? previous?.page ?? 1, pending: true, section };
      resultGroups.set(group, current);
      target.innerHTML = loading();
      try {
        const data = await api(`${endpoint}/${profile.provider.id}/events?group=${group}&page=${current.page}`);
        if (!live() || resultGroups.get(group) !== current) return;
        current.data = data;
        if (section.isConnected) {
          showGroup(section, data);
          if (page !== undefined) section.querySelector('summary').focus();
        }
      } catch (error) {
        if (live() && section.isConnected && resultGroups.get(group) === current) {
          if (error.status === 403 && group === 'draft') {
            section.remove();
            void load({ quiet: true });
          } else {
            target.innerHTML = errorPanel(error.message);
          }
        }
      } finally {
        current.pending = false;
      }
    }

    async function load({ quiet = false, focusAction } = {}) {
      if (!live()) return;
      const current = ++request;
      if (!quiet) {
        if (ctx.slug && !profile) host.innerHTML = loading();
        else if (!ctx.slug) host.querySelector('[data-provider-results]').innerHTML = loading();
      }
      try {
        const user = ctx.user();
        if (!user) filters.mine = false;
        const query = new URLSearchParams({ q: filters.q, city: filters.city, page: filters.page });
        if (user && filters.mine) query.set('mine', '1');
        const [data, incoming] = await Promise.all([
          api(ctx.slug ? `${endpoint}/${encodeURIComponent(ctx.slug)}` : `${endpoint}?${query}`),
          user ? api(endpoint + '/dashboard').catch(error => {
            if (error.status === 401 || error.status === 403) return null;
            throw error;
          }) : null
        ]);
        if (!live() || current !== request) return;
        dashboard = incoming;
        const key = JSON.stringify([data, incoming?.invitations, user?.id, user?.capabilities?.canCreateProviders]);
        if (quiet && key === stateKey) return;
        stateKey = key;
        if (ctx.slug) {
          const prior = profile;
          profile = data;
          if (prior && (JSON.stringify(prior.counts) !== JSON.stringify(data.counts) ||
              JSON.stringify(prior.provider.viewer) !== JSON.stringify(data.provider.viewer))) {
            for (const group of groups) {
              const old = resultGroups.get(group);
              if (old) resultGroups.set(group, { page: old.page });
            }
          }
          renderProfile();
        } else {
          if (Boolean(user) !== Boolean(host.querySelector('#provider-scope'))) renderCatalog();
          showCatalog(data);
        }
        updateDialogPermissions();
        if (focusAction && !dialog) {
          (host.querySelector(`[data-provider-action="${focusAction}"]:enabled`) || host.querySelector('[data-provider-heading], #provider-search'))?.focus();
        }
      } catch (error) {
        if (!live() || current !== request || quiet) return;
        const target = ctx.slug ? host : host.querySelector('[data-provider-results]');
        target.innerHTML = errorPanel(error.message);
      }
    }

    function updateDialogPermissions() {
      if (dialog && !dialog.permitted()) {
        dialog.submit.disabled = true;
        dialog.error.textContent = tr('permissionLost');
      }
    }

    function showDialog(title, markup, opener, permitted, submitLabel = t('common.save')) {
      const element = document.createElement('dialog');
      element.className = 'tiebreaker-help-dialog administration-dialog provider-dialog';
      element.setAttribute('aria-labelledby', 'provider-dialog-title');
      element.innerHTML = `<form class="tiebreaker-help-content">
        <div class="panel-header provider-panel-header"><h3 id="provider-dialog-title">${esc(title)}</h3>
          <button type="button" class="dialog-close-button" data-provider-close aria-label="${esc(t('common.close'))}">&times;</button>
        </div>
        ${markup}
        <p class="message error" data-provider-dialog-error role="alert"></p>
        <div class="row-actions"><button type="button" class="small-button" data-provider-close>${esc(t('common.cancel'))}</button>
          <button type="submit" class="primary-button">${esc(submitLabel)}</button></div>
      </form>`;
      const form = element.querySelector('form');
      const submit = form.querySelector('[type=submit]');
      const error = form.querySelector('[data-provider-dialog-error]');
      const current = { element, form, submit, error, permitted };
      dialog = current;
      document.body.append(element);
      element.addEventListener('error', event => {
        if (event.target.matches?.('[data-provider-image]')) event.target.remove();
      }, true);
      element.querySelectorAll('[data-provider-close]').forEach(button => button.onclick = () => element.close());
      element.addEventListener('close', () => {
        if (dialog === current) dialog = null;
        element.remove();
        if (live()) {
          const replacement = host.querySelector(`[data-provider-action="${opener.dataset.providerAction}"]:enabled`);
          (opener.isConnected ? opener : replacement || host.querySelector('[data-provider-heading], #provider-search'))?.focus();
        }
      }, { once: true });
      element.showModal();
      return current;
    }

    function writeForm(dialogState, path, method, getBody, onSuccess, editsProfile = false) {
      const { element, form, submit, error, permitted } = dialogState;
      form.onsubmit = async event => {
        event.preventDefault();
        if (submit.disabled || !permitted()) return;
        submit.disabled = true;
        error.textContent = '';
        form.querySelector('[data-provider-conflict]')?.remove();
        let result;
        try {
          const body = await getBody(form);
          if (!element.open || !live()) return;
          if (!permitted()) { updateDialogPermissions(); return; }
          result = await api(path, { method, body });
        } catch (failure) {
          if (!element.open || !live()) return;
          const stale = editsProfile && failure.status === 409;
          error.textContent = stale ? tr('conflict') : failure.message;
          if (stale) {
            const reload = document.createElement('button');
            reload.type = 'button';
            reload.className = 'small-button';
            reload.dataset.providerConflict = '';
            reload.textContent = tr('reload');
            reload.onclick = async () => { element.close(); await load({ focusAction: 'edit' }); };
            error.after(reload);
          }
          await refreshAfterProviderError(failure, submit, async () => {
            error.textContent = tr('permissionLost');
            await ctx.refreshIdentity().catch(() => {});
            await load({ quiet: true });
          });
          return;
        }
        element.close();
        if (live()) {
          try { await onSuccess(result); }
          catch (failure) { setNotice(failure.message, true); }
        }
      };
    }

    function editProfile(opener, provider) {
      const creating = !provider;
      const permitted = () => Boolean(creating ? ctx.user()?.capabilities?.canCreateProviders : profile?.provider.viewer?.canEdit);
      const logoField = field('provider-logo-upload', tr('logo'),
        `<input type="file" name="logo" id="provider-logo-upload" accept="image/png,image/jpeg,image/webp,image/gif" aria-describedby="provider-logo-hint"${creating ? ' required' : ''}>
          <p id="provider-logo-hint" class="field-help">${esc(tr('logoHint'))}</p>`);
      const current = showDialog(creating ? tr('create') : tr('action.edit'),
        `${field('provider-edit-name', tr('name'), `<input id="provider-edit-name" name="name" value="${esc(provider?.name)}" minlength="2" maxlength="80" required autofocus>`)}
         ${field('provider-edit-city', tr('city'), `<input id="provider-edit-city" name="city" value="${esc(provider?.city)}" maxlength="80" required>`)}
         ${provider ? logo(provider) : ''}${logoField}
         ${ctx.markdownEditorField({ name: 'description', value: provider?.description, label: tr('description'), rows: 6, maxlength: 6000 })}`,
        opener, permitted);
      ctx.wireMarkdownEditors(current.form);
      writeForm(current, creating ? endpoint : `${endpoint}/${provider.id}`, creating ? 'POST' : 'PATCH', async form => {
        const { name, city, description, logo: logoInput } = form.elements;
        const body = { name: name.value, city: city.value, description: description.value };
        if (provider) body.expectedUpdatedAt = provider.updatedAt;
        if (logoInput.files[0]) body.logoData = await ctx.resizeLogo(logoInput.files[0]);
        return body;
      }, async data => {
        if (creating) {
          await ctx.refreshIdentity().catch(() => {});
          await ctx.navigate(profileUrl(data.provider.slug));
        } else {
          setNotice(tr('saved'));
          await load({ focusAction: 'edit' });
        }
      }, !creating);
    }

    function roleSelect(id, role = 'organizer') {
      return field(id, tr('members.role'), `<select name="role" id="${id}">
        ${['organizer', 'judge'].map(value => `<option value="${value}"${value === role ? ' selected' : ''}>${esc(tr('role.' + value))}</option>`).join('')}
      </select>`);
    }

    function membershipDialog(action, opener, member) {
      const { provider, members, invitations } = profile;
      const base = `${endpoint}/${provider.id}`;
      const canManageMembers = () => Boolean(profile?.provider.viewer?.canManageMembers);
      const refresh = async () => { setNotice(tr('saved')); await load({ focusAction: action }); };
      if (action === 'invite') {
        const exclude = [...members.map(row => row.userId), ...(invitations || []).map(row => row.inviteeUserId)].join(',');
        const markup = field('provider-invite-user', tr('members.player'),
          `<select name="userId" id="provider-invite-user" data-user-search data-user-search-remote data-user-search-exclude="${esc(exclude)}" required><option value=""></option></select>`);
        const current = showDialog(tr('action.invite'), markup + roleSelect('provider-invite-role'), opener,
          () => canManageMembers() && !profile.provider.archivedAt, tr('invitations.send'));
        ctx.wireComboFields(current.form);
        current.form.querySelector('[data-combo-input]')?.focus();
        writeForm(current, base + '/invitations', 'POST', form => {
          const id = Number(form.elements.userId.value);
          if (!Number.isSafeInteger(id) || id < 1) throw new Error(tr('members.selectPlayer'));
          return { userId: id, role: form.elements.role.value };
        }, refresh);
      } else if (action === 'changeRole') {
        const current = showDialog(tr('members.changeRole'), `<p>${esc(member.name)}</p>${roleSelect('provider-member-role', member.role)}`,
          opener, () => canManageMembers() && profile.members.some(row => row.userId === member.userId && !row.isOwner));
        writeForm(current, `${base}/members/${member.userId}`, 'PATCH', form => ({ role: form.elements.role.value }), refresh);
      } else {
        const source = provider.coOwnerUserId ? field('provider-former-owner', tr('members.transferFrom'),
          `<select id="provider-former-owner" name="fromUserId">${members.filter(row => row.isOwner).map(row =>
            `<option value="${esc(row.userId)}" ${row.userId === ctx.user()?.id ? 'selected' : ''}>${esc(row.name)}</option>`).join('')}</select>`) : '';
        const current = showDialog(tr('action.transfer'),
          `<p>${esc(tr('members.transferHint'))}</p>${source}${field('provider-owner', tr('members.player'),
            `<select id="provider-owner" name="userId" required><option value="">${esc(tr('members.selectPlayer'))}</option>
             ${members.filter(row => row.role === 'organizer' && !row.isOwner).map(row => `<option value="${esc(row.userId)}">${esc(row.name)}</option>`).join('')}</select>`)}`,
          opener, () => Boolean(profile?.provider.viewer?.canTransferOwnership), tr('action.transfer'));
        writeForm(current, base + '/owner', 'PATCH', form => ({
          fromUserId: Number(form.elements.fromUserId?.value || provider.ownerUserId), userId: Number(form.elements.userId.value)
        }), refresh);
      }
    }

    async function mutate(action, opener, member, invitationId) {
      const provider = profile?.provider;
      const chiefAction = action === 'addChief' || action === 'removeChief';
      const path = chiefAction ? `${endpoint}/${provider.id}/owners/${encodeURIComponent(member.userId)}` :
        invitationId ? `/api/tournament-provider-invitations/${encodeURIComponent(invitationId)}/${action}` :
        `${endpoint}/${provider.id}/${member ? 'members/' + encodeURIComponent(member.userId) : action}`;
      if (chiefAction || ['archive', 'leave', 'remove', 'revoke'].includes(action)) {
        const label = chiefAction || action === 'remove' ? tr('members.' + action) : action === 'revoke' ? tr('invitations.revoke') : tr('action.' + action);
        if (!await ctx.confirmAction({
          title: label, confirmLabel: label, danger: true,
          message: tr('confirm.' + action, { name: member?.name || provider?.name || '' })
        })) return;
      }
      if (!live()) return;
      opener.disabled = true;
      try {
        await api(path, { method: member && action !== 'addChief' ? 'DELETE' : 'POST' });
        if (chiefAction || ['accept', 'leave', 'archive', 'restore'].includes(action)) await ctx.refreshIdentity().catch(() => {});
        if (live()) {
          setNotice(tr('saved'));
          await load({ focusAction: action });
        }
      } catch (error) {
        if (!live()) return;
        const unavailable = invitationId && [404, 409].includes(error.status);
        setNotice(unavailable ? tr('invitations.unavailable') : error.message, true);
        if (unavailable) await load({ focusAction: action });
        await refreshAfterProviderError(error, opener, async () => {
          await ctx.refreshIdentity().catch(() => {});
          await load({ focusAction: action });
        });
      }
    }

    host.addEventListener('error', event => {
      if (event.target.matches?.('[data-provider-image]')) event.target.remove();
    }, true);
    host.addEventListener('click', event => {
      const opener = event.target.closest('[data-provider-action]');
      if (!opener || !live()) return;
      const { providerAction: action, page } = opener.dataset;
      const section = opener.closest('[data-provider-group]');
      const invitationId = opener.closest('[data-provider-invitation]')?.dataset.providerInvitation;
      const memberId = opener.closest('[data-provider-member]')?.dataset.providerMember;
      const member = profile?.members.find(row => String(row.userId) === memberId);
      if (section && (action === 'retry' || action === 'groupPage')) {
        void loadGroup(section, page ? Number(page) : resultGroups.get(section.dataset.providerGroup)?.page || 1);
      } else if (action === 'retry') {
        void load();
      } else if (action === 'catalogPage') {
        filters.page = Number(page);
        void load({ focusAction: action });
      } else if (action === 'new' || action === 'edit') {
        editProfile(opener, action === 'edit' ? profile.provider : null);
      } else if (['invite', 'changeRole', 'transfer'].includes(action)) {
        membershipDialog(action, opener, member);
      } else {
        void mutate(action, opener, member, invitationId);
      }
    });

    function sync() {
      if (!live() || document.hidden) return;
      void ctx.refreshIdentity().then(() => load({ quiet: true })).catch(() => {});
    }
    const timer = setInterval(() => {
      if (!live()) {
        clearInterval(timer);
        window.removeEventListener('focus', sync);
        dialog?.element.close();
      } else {
        sync();
      }
    }, 15000);
    window.addEventListener('focus', sync);
    if (!ctx.slug) renderCatalog();
    void load();
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', sync);
      dialog?.element.close();
    };
  }

  const ui = { mount, eventCreationOptions, eventProviderField, profileActions, refreshAfterProviderError };
  root.TGTV_TOURNAMENT_PROVIDERS = ui;
  if (typeof module !== 'undefined') module.exports = ui;
})(typeof window === 'undefined' ? globalThis : window);
