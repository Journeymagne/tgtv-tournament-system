// Russian dictionary. Keys mirror en.js exactly.
// Protected Kill Team terminology must appear verbatim -- see
// public/i18n/glossary.js and test/unit/i18n.test.js.

const TGTV_I18N_RU = {
  // -- common ---------------------------------------------------------------
  "common.langToggle": "Переключить на английский",
  "common.save": "Сохранить",
  "common.cancel": "Отмена",
  "common.delete": "Удалить",
  "common.edit": "Изменить",
  "common.close": "Закрыть",
  "common.confirm": "Подтвердить",
  "common.loading": "Загрузка...",
  "common.empty": "Пока пусто.",
  "common.yes": "Да",
  "common.no": "Нет",

  // -- nav ------------------------------------------------------------------
  "nav.leaderboard": "Таблица лидеров",
  "nav.matchmaking": "Подбор соперника",
  "nav.games": "Игры",
  "nav.tournaments": "Турниры",
  "nav.stats": "Статистика",
  "nav.profile": "Профиль",
  "nav.challenge": "All Kill Team Challenge",
  "nav.feedback": "Обратная связь",
  "nav.signOut": "Выйти",
  "nav.openNavigation": "Открыть меню",
  "nav.closeNavigation": "Закрыть меню",
  "nav.openProfile": "Открыть профиль",

  // -- tiebreakers ----------------------------------------------------------
  "tiebreaker.strengthOfSchedule.label": "Strength of Schedule",
  "tiebreaker.strengthOfSchedule.description":
    "Сумма турнирных очков всех соперников, с которыми играл игрок.",
  "tiebreaker.buchholz.label": "Бухгольц",
  "tiebreaker.buchholz.description":
    "Сумма турнирных очков соперников без учёта лучшего и худшего результата. Равен 0, пока игрок не сыграл минимум с тремя соперниками.",
  "tiebreaker.headToHead.label": "Личная встреча",
  "tiebreaker.headToHead.description":
    "Если игроки с равными очками играли друг с другом, выше становится победитель личной встречи. Ничья или отсутствие личной встречи тай-брейк не решает.",
  "tiebreaker.totalVp.label": "Всего VP",
  "tiebreaker.totalVp.description":
    "Сумма VP, набранных игроком во всех завершённых матчах турнира.",
  "tiebreaker.vpDiff.label": "Разница VP",
  "tiebreaker.vpDiff.description":
    "Разность между VP игрока и VP его соперников во всех завершённых матчах турнира.",

  // -- ops ------------------------------------------------------------------
  "op.crit": "Crit Op",
  "op.kill": "Kill Op",
  "op.tac": "Tac Op",

  // -- venue ----------------------------------------------------------------
  "venue.tts": "Tabletop Simulator",
  "venue.irl": "Вживую",

  // -- auth -----------------------------------------------------------------
  "auth.brand.logoAlt": "Логотип TGTV",
  "auth.brand.title": "TGTV Ranking Tournament System",
  "auth.brand.tagline": "Kill Team челленджи, результаты Approved Ops и рейтинги игроков в одном месте.",
  "auth.tab.signIn": "Вход",
  "auth.tab.register": "Регистрация",
  "auth.tab.admin": "Админ",
  "auth.title.login": "Вход",
  "auth.title.register": "Создание аккаунта",
  "auth.title.setup": "Первый администратор",
  "auth.subtitle.login": "Вернитесь к своим челленджам, матчам и рейтингу.",
  "auth.subtitle.register": "Ваше имя будет видно в поиске игроков и в таблице лидеров.",
  "auth.subtitle.setup": "Создайте аккаунт, который сможет управлять игроками и рейтингами.",
  "auth.action.login": "Войти",
  "auth.action.register": "Создать аккаунт",
  "auth.action.setup": "Создать администратора",
  "auth.field.name": "Имя",
  "auth.field.password": "Пароль",
  "auth.field.confirmPassword": "Подтвердите пароль",
  "auth.field.registerNickname": "Никнейм для регистрации",
  "auth.field.registerNicknamePlaceholder": "Необязательно",
  "auth.field.telegramContact": "Telegram-контакт",
  "auth.field.telegramContactPlaceholder": "@username",

  // -- play -----------------------------------------------------------------
  "play.newChallenge.title": "Новый челлендж",
  "play.newChallenge.hint": "Найдите игрока по имени или контактам и отправьте ему челлендж.",
  "play.newChallenge.searchPlaceholder": "Имя игрока или контакты",
  "play.newChallenge.searchAction": "Найти",
  "play.incoming.title": "Входящие челленджи",
  "play.incoming.empty": "Нет новых челленджей.",
  "play.outgoing.title": "Отправленные челленджи",
  "play.outgoing.empty": "Нет ожидающих челленджей.",
  "play.active.title": "Активные матчи",
  "play.active.empty": "Пока нет принятых матчей.",
  "play.recent.title": "Последние результаты",
  "play.recent.empty": "Здесь появятся завершённые матчи.",
  "play.search.challengeAction": "Вызвать",
  "play.search.empty": "Игроки не найдены.",
  "play.search.hint": "Начните вводить имя игрока или контакт.",
  "play.game.waitingForResult": "Ожидание результата Approved Ops",
  "play.game.you": "Вы",
  "play.action.enterResult": "Ввести результат",
  "play.action.editResult": "Изменить результат",
  "play.action.reviewResult": "Проверить результат"
};

if (typeof module !== "undefined") module.exports = TGTV_I18N_RU;
