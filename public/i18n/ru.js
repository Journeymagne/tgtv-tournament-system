// Russian dictionary. Keys mirror en.js exactly.
// Protected Kill Team terminology must appear verbatim -- see
// public/i18n/glossary.js and test/unit/i18n.test.js.

const TGTV_I18N_RU = {
  // -- common ---------------------------------------------------------------
  "common.langToggle": "Переключить на английский",

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
  "venue.irl": "Вживую"
};

if (typeof module !== "undefined") module.exports = TGTV_I18N_RU;
