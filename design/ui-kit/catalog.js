(function () {
  'use strict';
  const ui = window.KTComponents, bars = [], bells = [];
  // Catalogue preferences stay in memory and never touch application state.
  const appearance = { locale: 'ru', theme: 'dark' };
  const controls = document.querySelector('#catalog-appearance');
  const language = ui.button('RU');
  language.addEventListener('click', () => setAppearance({ locale: appearance.locale === 'ru' ? 'en' : 'ru' }));
  controls.append(language);
  const themeButtons = ['light', 'dark'].map(theme => {
    const button = ui.button(theme, { icon: theme });
    button.addEventListener('click', () => setAppearance({ theme })); controls.append(button);
    return { button, theme };
  });
  function setAppearance(value) {
    Object.assign(appearance, value);
    document.documentElement.dataset.theme = appearance.theme;
    language.textContent = appearance.locale.toUpperCase();
    language.setAttribute('aria-label', appearance.locale === 'ru' ? 'Switch to English' : 'Переключить на русский');
    for (const { button, theme } of themeButtons) {
      const label = appearance.locale === 'en' ? (theme === 'light' ? 'Light theme' : 'Dark theme') : (theme === 'light' ? 'Светлая тема' : 'Тёмная тема');
      button.setAttribute('aria-label', label); button.title = label;
      button.setAttribute('aria-pressed', String(theme === appearance.theme));
    }
    for (const bar of bars) bar.setAppearance(appearance);
    for (const { bell, count } of bells) bell.setCount(count, appearance.locale);
  }
  const demoUser = { name: 'Journey', rating: 1123, avatarUrl: 'icon.png' };
  const users = { player: demoUser, guest: null, long: { name: 'Очень Длинное Имя Командира Отряда', rating: 2050 }, unrated: { name: 'Новый игрок' } };
  const status = document.querySelector('#demo-status');
  function announce(text) { status.textContent = text; }
  for (const mount of document.querySelectorAll('[data-example]')) {
    const key = mount.dataset.example;
    const bar = ui.accountBar({
      user: users[key], locale: appearance.locale, theme: appearance.theme,
      profileHref: '#account', loginHref: '#account',
      onTheme: value => setAppearance({ theme: value }), onLocale: value => setAppearance({ locale: value }),
      onLogout: () => { bar.setUser(null); announce('Демо: выполнен выход из примера.'); }
    });
    bar.profile.addEventListener('click', event => { event.preventDefault(); announce('Демо: переход в профиль игрока.'); });
    bar.element.querySelector('a.kt-control').addEventListener('click', event => { event.preventDefault(); bar.setUser(demoUser); announce('Демо: вход выполнен.'); });
    const sample = { count: key === 'long' ? 128 : key === 'player' ? 3 : 0 };
    const bell = ui.notificationButton({ count: sample.count, locale: appearance.locale });
    sample.bell = bell; bells.push(sample);
    bell.element.addEventListener('click', () => { sample.count = 0; bell.setCount(0, appearance.locale); announce('Демо: уведомления прочитаны.'); });
    bar.notifications.append(bell.element); mount.append(bar.element); bars.push(bar);
  }
  const buttons = document.querySelector('#button-examples');
  for (const [label, options] of [['Сохранить', { variant: 'primary' }], ['Назад', {}], ['Недоступно', { disabled: true }]]) {
    const button = ui.button(label, options); button.addEventListener('click', () => announce('Демо: ' + label)); buttons.append(button);
  }
  for (const count of [0, 3, 128]) {
    const bell = ui.notificationButton({ count, locale: appearance.locale });
    bell.element.addEventListener('click', () => announce('Демо: ' + count + ' уведомлений.'));
    bells.push({ bell, count }); document.querySelector('#notification-examples').append(bell.element);
  }
  document.querySelector('#identity-examples').append(ui.avatar(demoUser), ui.avatar({ name: 'Новый игрок' }), ui.rating(1123));
  setAppearance({});
  document.querySelector('#copy-snippet').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(document.querySelector('#integration-snippet').textContent); announce('Шаблон подключения скопирован.'); }
    catch { announce('Буфер обмена недоступен. Выделите и скопируйте шаблон вручную.'); }
  });
})();
