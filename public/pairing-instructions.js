(function (root) {
  const shared = {
    ru: [
      "Оба капитана тайно выбирают Shield из своей команды. Выбор раскрывается после подтверждения обоими капитанами.",
      "Каждый капитан тайно выбирает своему Shield соперника из двух Swords другой команды. После обоих подтверждений выборы раскрываются. Два оставшихся Swords образуют третью пару."
    ],
    en: [
      "Both captains secretly select a Shield from their own team. Choices are revealed after both captains confirm.",
      "Each captain secretly chooses an opposing Sword for their own Shield from the other team's two Swords. Both choices are revealed together. The remaining Swords form the third pairing."
    ]
  };
  const guides = {
    ru: {
      wtc: { title: "WTC · 3×3", steps: [
        "Оба капитана бросают D6; при равенстве перебрасывают. Победитель — Attacker, проигравший — Defender.",
        "Общий пул встречи — девять миссий. Defender банит одну миссию, затем Attacker — другую. Остаётся семь.",
        ...shared.ru,
        "Пара Shield Defender: Attacker выбирает один из трёх столов, Defender — миссию из оставшегося пула.",
        "Пара Shield Attacker: Defender выбирает один из двух оставшихся столов, Attacker — другую доступную миссию.",
        "Оставшиеся Swords получают третий стол автоматически. Defender выбирает им ещё одну доступную миссию. Все три стола и три миссии разные; расстановка закреплена за столом.",
        "Паринг завершён: созданы три личные игры. В TTS используются три общих виртуальных стола раунда, в IRL — отдельная линия столов встречи."
      ] },
      classic: { title: "Sword Shield Classic · 3×3", steps: [
        "Определите инициативу кубовкой или другим согласованным способом и укажите победившего капитана в приложении. Банов миссий нет: используется пул миссий раунда.",
        ...shared.ru,
        "Капитан с инициативой выбирает стол ИЛИ миссию для своего Shield. Второй капитан назначает этой паре оставшийся параметр: миссию либо стол.",
        "Капитан без инициативы выбирает стол ИЛИ миссию для своего Shield. Капитан с инициативой назначает этой паре оставшийся параметр.",
        "Оставшиеся Swords получают свободный стол. Если миссий в пуле ровно три, последняя назначается автоматически; если больше — миссию выбирает капитан без инициативы.",
        "Все пары получают разные столы и миссии. Расстановка закреплена за столом. После всех назначений создаются три личные игры."
      ] },
      doubles: { title: "Doubles · 2×2", steps: [
        "Бросьте D6 вне приложения; при равенстве повторите. Победитель выбирает право составить пары или распределить столы. Проигравший получает другое право.",
        "Капитан с правом составления пар определяет два личных матчапа. Другой капитан распределяет между ними два стола линии встречи.",
        "Проигравший ролл-офф выбирает одну из четырёх миссий раунда на любой стол. Победитель выбирает одну из оставшихся трёх на второй стол.",
        "Внесите обе пары, разные столы и разные миссии в ручную форму. Каждый игрок участвует один раз. Для перестановки сначала освободите нужный выбор.",
        "Любой капитан или организатор сохраняет обе пары. Создаются две личные игры. Shield/Sword и баны в этом формате не используются."
      ] },
      manual: { title: "Ручное назначение · 3×3", steps: [
        "Пошаговый капитанский паринг выключен. Капитаны согласовывают три пары, столы и миссии вне приложения; этапов инициативы, банов и скрытого выбора в интерфейсе нет.",
        "Капитан или организатор указывает в форме по одному игроку каждой команды для каждой из трёх игр. Каждый игрок участвует ровно один раз.",
        "Назначьте каждой паре отдельный стол и отдельную миссию из доступного пула. Расстановка закреплена за столом.",
        "Проверьте все назначения и сохраните три пары — приложение создаст личные игры."
      ] },
      legacyTts: { title: "WTC · прежние правила · TTS", steps: [
        "Эта встреча сохранена по прежней версии правил. Капитаны выполняют ролл-офф; победитель — Attacker, проигравший — Defender. Этапа банов нет.",
        ...shared.ru,
        "Attacker выбирает миссию для Shield Defender, затем Defender — для Shield Attacker. Третья пара получает оставшуюся миссию автоматически. Используйте сохранённые окружения встречи."
      ] },
      legacyIrl: { title: "WTC · прежние правила · IRL", steps: [
        "Эта встреча сохранена по прежней версии правил. Капитаны выполняют ролл-офф; победитель — Attacker, проигравший — Defender. Этапа банов нет.",
        ...shared.ru,
        "Defender выбирает стол для своего Shield, Attacker — миссию этой паре. Затем Attacker выбирает стол для своего Shield, Defender — миссию. Третья пара получает оставшиеся стол и миссию автоматически."
      ] }
    },
    en: {
      wtc: { title: "WTC · 3×3", steps: [
        "Both captains roll D6, rerolling ties. The winner is Attacker; the loser is Defender.",
        "The match has a shared pool of nine missions. Defender bans one, then Attacker bans another, leaving seven.",
        ...shared.en,
        "Defender's Shield pairing: Attacker chooses a table; Defender chooses an available mission.",
        "Attacker's Shield pairing: Defender chooses one of the two remaining tables; Attacker chooses a different available mission.",
        "The remaining Swords automatically receive the last table. Defender chooses another available mission for them. All three tables and missions are distinct. Deployment belongs to the table.",
        "Three individual games are created. TTS uses the round's three shared virtual tables; IRL uses the match's own table line."
      ] },
      classic: { title: "Sword Shield Classic · 3×3", steps: [
        "Determine initiative by rolling dice or another agreed method and record the winning captain in the app. There are no mission bans; use the round's mission pool.",
        ...shared.en,
        "The captain with initiative chooses EITHER a table OR a mission for their own Shield. The other captain assigns the other parameter to that pairing.",
        "The captain without initiative chooses EITHER a table OR a mission for their own Shield. The captain with initiative assigns the other parameter.",
        "The remaining Swords receive the last table. With exactly three missions, the last mission is automatic; with a larger pool, the captain without initiative chooses it.",
        "All pairings use distinct tables and missions. Deployment belongs to the table. Three individual games are created after all assignments."
      ] },
      doubles: { title: "Doubles · 2×2", steps: [
        "Roll D6 outside the app, rerolling ties. The winner chooses either pairing players or assigning tables. The loser receives the other right.",
        "The captain entitled to pair players sets the two individual matchups. The other captain assigns the two tables from the match's line.",
        "The roll-off loser chooses one of the round's four missions for either table. The winner chooses one of the remaining three for the second table.",
        "Enter both pairings, distinct tables and distinct missions in the manual form. Each player participates once. Clear an occupied choice before swapping.",
        "Either captain or the organizer saves both pairings, creating two individual games. This format has no Shield/Sword selections or bans."
      ] },
      manual: { title: "Manual assignments · 3×3", steps: [
        "Step-by-step captain pairing is disabled. Captains agree on three pairings, tables and missions outside the app. There are no initiative, ban or hidden-selection stages in the interface.",
        "A captain or organizer enters one player from each team for each of the three games. Every player participates exactly once.",
        "Assign a distinct table and an available distinct mission to each pairing. Deployment belongs to the table.",
        "Review and save all three pairings to create the individual games."
      ] },
      legacyTts: { title: "WTC · previous rules · TTS", steps: [
        "This match retains the previous rules version. Captains roll off: the winner is Attacker, the loser Defender. There is no ban stage.",
        ...shared.en,
        "Attacker chooses the mission for Defender's Shield; Defender chooses the mission for Attacker's Shield. The third pairing automatically receives the remaining mission. Use the match's saved environments."
      ] },
      legacyIrl: { title: "WTC · previous rules · IRL", steps: [
        "This match retains the previous rules version. Captains roll off: the winner is Attacker, the loser Defender. There is no ban stage.",
        ...shared.en,
        "Defender chooses the table for their Shield; Attacker chooses its mission. Attacker then chooses the table for their Shield; Defender chooses its mission. The third pairing automatically receives the remaining table and mission."
      ] }
    }
  };
  function key(match, tournament = {}) {
    if (match.pairingType === "doubles") return "doubles";
    if (match.captainPairingEnabled === false) return "manual";
    if (match.pairingType === "sword_shield_classic") return "classic";
    if (match.pairingVersion !== 2) return tournament.venueMode === "irl" ? "legacyIrl" : "legacyTts";
    return "wtc";
  }
  const api = { guides, key, get: (match, tournament, locale) => guides[locale === "ru" ? "ru" : "en"][key(match, tournament)] };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TGTVPairingInstructions = api;
})(typeof window === "object" ? window : globalThis);
