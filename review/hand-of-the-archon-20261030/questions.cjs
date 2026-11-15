// Original scenarios for editorial preview. Not imported by the application.
const pdf = 'https://assets.warhammer-community.com/eng_28-10_kill_team_team_rules_hand_of_the_archon-1pzipa9jpj-tgfmqz67em.pdf';
const entries = [];
function q(difficulty, topic, question, options, explanation, page, section) {
  // Authors put the correct option first; rotate it for the reader.
  const index = entries.length;
  const answer = index % 4;
  const rotated = options.slice(4 - answer).concat(options.slice(0, 4 - answer));
  entries.push({id: `hoa-${String(index + 1).padStart(3, '0')}`, difficulty, topic, question,
    options: rotated, answer, explanation,
    source: {title: 'Warhammer Community · Hand of the Archon · 28.10.2026', url: `${pdf}#page=${page}`, section: `PDF, с. ${page}: ${section}`}});
}

q(4, 'Pain tokens',
  'Assassin начал активацию с запасом Pain tokens. Перед первым Shoot он использовал Dark Animus, а на броске атаки — Stimulated Senses. После второго Shoot хочет применить Accelerated Rejuvenation. Как разрешить эту последовательность?',
  ['Лечение недоступно: Dark Animus уже занял лимит обычной invigoration', 'Лечение доступно, поскольку используется после другого Shoot', 'Лечение доступно, но нужно отменить повторные броски Stimulated Senses', 'Недоступны уже Stimulated Senses: за активацию разрешена только одна invigoration'],
  'Dark Animus и Accelerated Rejuvenation делят один лимит на активацию. Stimulated Senses разрешены один раз дополнительно, но не открывают ещё одно применение лечения.', 4, 'Power From Pain; Invigorations');

q(3, 'Pain tokens',
  'На атаке splinter rifle выпали 1, 2, 5, 5. Оперативник использует Stimulated Senses. Какой набор кубиков он может перебросить одним применением?',
  ['Обе пятёрки, оставив 1 и 2', 'Одновременно 1 и 2, поскольку оба результата — промахи', 'Любые два кубика, независимо от значений', 'Только один кубик: либо 1, либо 2'],
  'Выбирается одно числовое значение, а не категория «промах» или «крит». Можно перебросить любые кубики выбранного значения, включая успешные пятёрки.', 4, 'Stimulated Senses');

q(3, 'Pain tokens',
  'В turning point 2 Agent применил Dark Animus и закончил активацию с APL 3. В turning point 3 он ещё не активировался. Как меняется его APL до и в начале следующей активации?',
  ['До активации — 3; в её начале эффект заканчивается и APL возвращается к 2', 'На шаге Ready APL возвращается к 2', 'APL остаётся 3 до конца следующей активации', 'APL становится 2 сразу после завершения активации в turning point 2'],
  'Dark Animus действует до начала следующей активации этого оперативника. Граница turning point сама по себе эффект не завершает.', 4, 'Dark Animus');

q(3, 'Pain tokens',
  'Gunner одним Shoot добил противника с Wounds 12, у которого перед выстрелом оставалась 1 рана. Сколько Pain tokens даёт Gunner этот результат?',
  ['Два: порог проверяется по характеристике Wounds', 'Один: перед выстрелом у цели оставалась только 1 рана', 'Три: один за incapacitation и ещё два за Wounds 12', 'Ноль: цель уже была injured до выстрела'],
  'Для incapacitated противника с Wounds 12+ выдаются два жетона вместо одного. Текущее количество оставшихся ран не заменяет характеристику Wounds.', 4, 'Power From Pain');

q(4, 'Sadistic Competition',
  'Gunner получает два Pain tokens за уничтожение противника с Wounds 12. На другом конце поля стоят два ваших Agent без жетонов. Sadistic Competition в этом turning point ещё не использовали. Что она добавит?',
  ['Один жетон одному из этих Agent', 'По одному жетону обоим Agent, потому что Gunner получил два', 'Два жетона одному Agent', 'Ничего: Agent должны быть в пределах 6 дюймов от Gunner'],
  'Sadistic Competition применяется один раз за turning point и даёт один жетон одному Agent, у которого их нет. Дистанция до источника не указана; два полученных Gunner жетона не удваивают награду.', 1, 'Agent — Sadistic Competition');

q(4, 'Flayer',
  'Flayer ударил критом в своём Fight и выдал жетон через Flay. Позже в том же turning point враг атакует его, и Flayer снова наносит критический удар, теперь при retaliation. Может ли Flay дать ещё один жетон?',
  ['Да: это первый критический удар в другой последовательности боя', 'Нет: Flay ограничен одним применением за turning point', 'Нет: Flay работает только в собственном Fight', 'Да, но только тому же получателю, что и в первом Fight'],
  'Ограничение Flay относится к первой критической атаке-удару в конкретной последовательности. Новая retaliation — другая последовательность, и собственная активация для Flay не требуется.', 3, 'Flayer — Flay');

q(4, 'Flayer',
  'В одном бою Flayer сначала тратит критический успех на block, затем другой критический успех на strike и позже наносит ещё один критический strike. Сколько раз в этой последовательности сработает Flay?',
  ['Один раз — на первом критическом strike', 'Ни разу: первый критический успех уже потрачен на block', 'Два раза — на каждом критическом strike', 'Три раза — при каждом потраченном критическом успехе'],
  'Flay отслеживает первый strike критическим успехом, а не первый использованный критический кубик. Block не запускает и не расходует этот триггер; второй критический strike в том же бою жетона не даёт.', 3, 'Flayer — Flay');

q(3, 'Flayer',
  'Flayer впервые в бою наносит критический strike. Ваш Agent без Pain tokens находится в 5 дюймах от Flayer за непрозрачной стеной. Можно ли выбрать его получателем Flay?',
  ['Да: Flay требует дистанцию, но не видимость', 'Нет: получатель должен видеть Flayer', 'Нет: получатель должен видеть раненого врага', 'Да, но только если Agent уже имеет хотя бы один Pain token'],
  'Flay позволяет выбрать дружественного оперативника Hand of the Archon в пределах 6 дюймов. Требования видимости или уже имеющегося жетона у этой способности нет.', 3, 'Flayer — Flay');

q(4, 'Rifles',
  'Agent с APL 3 начинает активацию с Dash, затем стреляет из splinter rifle и после выстрела делает Reposition. Что происходит с Accurate 1 от Rifles?',
  ['Бонус действует при этом Shoot, а последующий Reposition его не отменяет', 'Dash до выстрела отключает бонус', 'Бонус теряется задним числом из-за Reposition после выстрела', 'Бонус действует только если Agent потратит Pain token'],
  'До Shoot выполнен только Dash: он не входит в перечень действий, отключающих Rifles. Правило отдельно разрешает выполнять перечисленные перемещения после стрельбы.', 5, 'Rifles');

q(3, 'Rifles',
  'Agent весь turning point не перемещался. Во время counteraction он выполняет Shoot из splinter rifle. Даёт ли Rifles Accurate 1 на этот выстрел?',
  ['Нет: Rifles требует стрельбу во время активации', 'Да: достаточно не выполнять Reposition в этом turning point', 'Да, но только если Agent находится на Vantage', 'Да, если до counteraction у Agent оставался Pain token'],
  'Формулировка Rifles привязана к активации. Counteraction не является активацией, поэтому одна лишь неподвижность бонус не включает.', 5, 'Rifles; Core Rules — Counteract');

q(3, 'Ploys и wounded',
  'У цели Wounds 12, к началу вашего Shoot у неё осталось 11 ран. Включён Merciless Sadists. Можно ли получить Balanced и затем использовать Prey on the Wounded?',
  ['Да: для обоих достаточно, что цель потеряла хотя бы одну рану до начала Shoot', 'Только Balanced: Prey on the Wounded требует injured', 'Только Prey on the Wounded: Balanced требует injured', 'Ни одно: у цели должно остаться меньше половины ран'],
  'Wounded и injured — разные условия. Оба ploy проверяют наличие потерянных ран у цели в начале действия; переход ниже половины Wounds для них не нужен.', 9, 'October ’26 errata — Merciless Sadists; Prey on the Wounded');

q(4, 'Ploys и wounded',
  'В начале Shoot у цели полные раны. После начала действия, но до вашего броска атаки, сработавшая реакция наносит ей 1 урон. Включён Merciless Sadists. Какие из бонусов Merciless Sadists и Prey on the Wounded доступны против этой цели в данном Shoot?',
  ['Ни один: в начале Shoot цель ещё не была wounded', 'Оба: к броску атаки цель уже wounded', 'Только Balanced от Merciless Sadists', 'Только повторные броски от Prey on the Wounded'],
  'Октябрьская правка закрепляет для обоих ploy проверку состояния на начало действия. Полученная внутри того же Shoot рана не меняет результат этой проверки.', 9, 'October ’26 errata — wounded at the start of the action');

q(4, 'Ploys и wounded',
  'Раненый враг начинает Fight против вашего Agent. Активны Blade Artists и Merciless Sadists, Toxin Coating ещё не использовали. Какие усиления доступны Agent при retaliation?',
  ['Rending от Blade Artists и Lethal 5+ от Toxin Coating; Balanced от Merciless Sadists не действует', 'Все три: Rending, Lethal 5+ и Balanced', 'Только Rending: Toxin Coating требует собственный Fight', 'Только Balanced: оба усиления оружия требуют собственной активации'],
  'Blade Artists усиливает melee weapons без ограничения на атакующую сторону. Toxin Coating прямо включает retaliation. Merciless Sadists перечисляет shooting и fighting, но не retaliating.', 5, 'Blade Artists; Merciless Sadists; с. 8 — Toxin Coating');

q(4, 'From Darkness, Death',
  'В начале активации Assassin имеет Conceal и укрытие от врага X: X не может выбрать его целью Shoot. Для From Darkness, Death выбран X. Assassin получает Engage и стреляет в X. Сохраняется ли превращение normal success в critical success?',
  ['Да: условие выбора X проверялось до определения нового order', 'Нет: Engage сразу отменяет выбранную цель', 'Нет: после смены order нужно повторно проверить, может ли X стрелять в Assassin', 'Да, но только если Assassin сохранит Conceal до конца активации'],
  'Цель для From Darkness, Death выбирается при активации до определения order. Последующий переход на Engage не отменяет уже полученный эффект против выбранного противника.', 6, 'From Darkness, Death');

q(4, 'From Darkness, Death',
  'Assassin выбрал врага X для From Darkness, Death. В этой активации он сначала стреляет razorwing во врага Y, затем shardcarbine во врага X. Mark не выполнялся. На какой выстрел распространяется превращение normal success в critical success?',
  ['На Shoot против X: первый выстрел по Y не расходует эффект против X', 'Только на первый Shoot против Y', 'Ни на один: первый Shoot обязан быть направлен в X', 'На оба Shoot, поскольку каждый использует другое оружие'],
  'From Darkness, Death относится к первой стрельбе или бою именно против выбранного противника. Выстрел в другую цель этого события не создаёт. Merciless Hunter позволяет указанную пару Shoot.', 6, 'From Darkness, Death; с. 2 — Merciless Hunter');

q(4, 'From Darkness, Death',
  'Agent с Blade Artists впервые дерётся с целью, выбранной для From Darkness, Death. После бросков у него два normal success и ни одного critical success. Какой набор можно получить, применив оба правила?',
  ['Два critical success', 'Один critical success и один normal success', 'Один critical success, второй успех нужно сбросить', 'Два normal success: без выпавшей шестёрки Rending не работает'],
  'From Darkness, Death превращает один normal success в critical success. Появившийся критический успех позволяет Rending от Blade Artists превратить оставшийся normal success во второй крит.', 6, 'From Darkness, Death; с. 5 — Blade Artists; Weapon Rules — Rending');

q(3, 'Denizens of Night',
  'Стрелок находится в 10 дюймах от вашего Agent, между ними Heavy terrain. Другой враг стоит в 2 дюймах от Agent. Включён Denizens of Night. Получит ли Agent повторный бросок защиты?',
  ['Нет: нужно быть дальше 2 дюймов от всех врагов, а не только от стрелка', 'Да: расстояние измеряется только до стрелка', 'Да: Heavy terrain отменяет требование дистанции', 'Нет, но повторный бросок появится, если Agent сменит order на Conceal'],
  'Условие дистанции относится к enemy operatives в целом и требует больше 2 дюймов. Враг ровно в 2 дюймах отключает бонус, даже если стрелок далеко.', 6, 'Denizens of Night');

q(3, 'Denizens of Night',
  'Agent с Engage стоит так, что край его базы находится под площадкой Vantage. Между ним и стрелком нет intervening Light или Heavy terrain, все враги дальше 2 дюймов. Сработает ли Denizens of Night?',
  ['Да: достаточно, что часть базы находится под Vantage', 'Нет: обязательны intervening Light или Heavy terrain', 'Нет: бонус доступен только с Conceal', 'Да, но только если вся база целиком под Vantage'],
  'Положение любой части базы под Vantage — отдельное основание для бонуса. Оно не требует intervening terrain, а order в условии ploy не указан.', 6, 'Denizens of Night');

q(4, 'Devious Scheme',
  'В turning point 1 Devious Scheme применён к вражескому ploy X стоимостью 1CP. До turning point 3 противник X больше не использовал. В turning point 2 он применяет другой ploy Y, а в turning point 3 снова X. Что происходит?',
  ['Надбавка сохраняется до X в turning point 3; до этого второй Devious Scheme на Y недоступен', 'Эффект заканчивается в конце turning point 1, поэтому X снова стоит 1CP', 'Надбавку получает Y как следующий использованный противником ploy', 'Можно наложить ещё один Devious Scheme на Y, сохранив первый эффект на X'],
  'Эффект ждёт следующего использования конкретного ploy и не привязан к окончанию turning point. Пока он не завершился, повторное применение Devious Scheme запрещено.', 6, 'Devious Scheme');

q(3, 'Devious Scheme',
  'Противник использует firefight ploy, который в это применение стоит ему 0CP. Вы хотите ответить Devious Scheme, чтобы следующее применение подорожало. Что произойдёт?',
  ['Применить Devious Scheme к этому использованию нельзя', 'Следующее применение автоматически будет стоить 1CP', 'Надбавка появится, но только если следующий раз противник заплатит хотя бы 1CP', 'Devious Scheme можно применить бесплатно, потому что исходный ploy бесплатный'],
  'В триггере Devious Scheme прямо исключены ploys стоимостью 0CP. Нельзя создавать отложенную надбавку через такое применение.', 6, 'Devious Scheme');

q(3, 'Chain Snare',
  'Враг с Wounds 12 и двумя оставшимися ранами пытается сделать Fall Back от полностью здорового Agent с Wounds 8. Рядом с Agent больше нет врагов. Сколько D6 бросается за Chain Snare?',
  ['Один: сравниваются Wounds 12 и Wounds 8', 'Два: у убегающего осталось меньше ран', 'Три: разница максимальных ран равна четырём', 'Ни одного: Chain Snare не действует на injured'],
  'Количество кубиков зависит от характеристик Wounds, а не оставшихся ран. У противника характеристика выше, поэтому бросается один D6.', 7, 'Chain Snare');

q(4, 'Chain Snare',
  'В начале turning point Chain Snare не остановил Fall Back: оба кубика показали меньше 4. Позже другой враг пытается уйти от другого вашего оперативника. У каждого из них в control range был только соответствующий противник. Можно ли снова применить Chain Snare?',
  ['Да: ограничение до конца turning point включается после успешного результата 4+', 'Нет: оборудование применяется только один раз за turning point независимо от броска', 'Нет: повтор разрешён только для того же вашего оперативника', 'Да, но теперь требуется 6 вместо 4+'],
  'Запрет повторного применения входит в ветку успешного результата 4+. Неудачная попытка не расходует командный лимит успешного срабатывания.', 7, 'Chain Snare; с. 10 — предыдущая errata');

q(4, 'Chain Snare',
  'Враг с APL 2 начинает активацию рядом с Agent и объявляет Fall Back. Chain Snare успешно его останавливает. Сколько AP осталось и может ли он сразу повторить Fall Back?',
  ['Осталось 2 AP; Fall Back в этой активации повторить нельзя', 'Осталось 0 AP; Fall Back можно повторить, получив дополнительные AP', 'Остался 1 AP; ещё одна попытка Fall Back стоит 1AP', 'Осталось 2 AP; можно немедленно объявить Fall Back снова'],
  'При успешном Chain Snare AP за остановленное действие не тратятся, но Fall Back становится недоступен на всю эту активацию. Сохранённые AP можно потратить на другие действия, например Fight.', 7, 'Chain Snare');

q(4, 'Crimson Duellist',
  'Duellist использует razorflail. У противника остались один critical success и один normal success. Duellist выделяет собственный critical success на block. Что позволяет Tangle?',
  ['Заблокировать оба вражеских успеха одним критическим block', 'Заблокировать только critical success: два блокируемых успеха должны быть одного типа', 'Заблокировать только normal success: Brutal запрещает блокировать криты', 'Заблокировать оба, но для этого нужно потратить ещё один свой normal success'],
  'Tangle увеличивает число блокируемых успехов до двух. Критический block может блокировать critical и normal success; Brutal на razorflail ограничивает блоки против его атак, а не собственные блоки Duellist.', 1, 'Crimson Duellist — Tangle; Weapon Rules — Brutal');

q(3, 'Crimson Duellist',
  'У Duellist остался normal success, у врага — critical success и normal success. Duellist использует normal success на block с Tangle. Что он может заблокировать?',
  ['Только вражеский normal success', 'Оба успеха: Tangle отменяет различие между normal и critical', 'Только critical success, если пожертвует возможностью блокировать второй кубик', 'Ничего: Tangle работает только на critical block'],
  'Tangle меняет количество успехов, которые можно заблокировать, но не позволяет normal success блокировать critical success.', 1, 'Crimson Duellist — Tangle; Core Rules — Fight');

q(4, 'Brutal Display',
  'Duellist уничтожил врага A в своей control range. Враг B скрыт от Duellist, но виден от позиции A и находится в 5 дюймах от A. Brutal Display ещё не использовали. Можно ли выбрать B?',
  ['Да: видимость и дистанцию можно проверить от уничтоженного A', 'Нет: B обязан быть виден самому Duellist', 'Нет: уничтоженный A уже не может быть точкой измерения', 'Да, но только если B также находится в 6 дюймах от Duellist'],
  'Brutal Display позволяет выбирать другого врага по видимости и дистанции от Duellist либо от уничтоженного противника. Во втором случае собственной видимости Duellist не требуется.', 1, 'Crimson Duellist — Brutal Display');

q(4, 'Brutal Display',
  'Маркер оспаривают только ваш Agent с APL 2 и враг с APL 3, находящийся под Brutal Display. Кто контролирует маркер?',
  ['Никто: враг не может контролировать, но его APL продолжает мешать Agent', 'Agent: Brutal Display полностью исключает врага из подсчёта APL', 'Враг: больший APL отменяет запрет Brutal Display', 'Оба: запрет контроля превращает результат в совместный контроль'],
  'Запрет контролировать маркер не равен запрету его оспаривать. Враг продолжает участвовать в сравнении APL, поэтому Agent не получает контроль; самому врагу контроль запрещён.', 1, 'Brutal Display; Core Rules — Markers');

q(4, 'Stinger',
  'Stinger pistol уничтожил врага A. Ваш Agent B виден от A и находится в 2 дюймах от него; у B осталось 2 раны, а Stinger наносит ему 3 урона. Враг C находится в 2 дюймах от B и виден от B, но дальше 2 дюймов от A. Получит ли C урон от цепочки?',
  ['Да: уничтожение дружественного B продолжает цепочку Stinger', 'Нет: цепочку продолжают только уничтоженные враги', 'Нет: все вторичные цели должны быть в 2 дюймах от исходного A', 'Да, но C автоматически получит те же 3 урона, что и B'],
  'Первичный триггер — уничтоженный оружием враг. Дальше цепочку продолжает каждый оперативник, уничтоженный этим weapon rule, включая дружественного. Для C выполняется новый отдельный бросок D3 от позиции B.', 1, 'Disciple of Yaelindra — Stinger');

q(3, 'Stinger',
  'Уничтоженная stinger pistol цель видит в пределах 2 дюймов двух ваших оперативников и одного своего союзника. Как разыгрывается первоначальный взрыв Stinger?',
  ['Для каждого из трёх оперативников отдельно бросается D3 урона', 'Один бросок D3 наносит одинаковый урон всем троим', 'По D3 получают только враги Disciple; ваши оперативники не затронуты', 'Disciple выбирает одного из троих и наносит ему D3'],
  'Stinger затрагивает каждого другого оперативника в указанной области видимости и дистанции без разделения на союзников и врагов. В актуальной карточке явно указаны отдельные броски.', 1, 'Disciple of Yaelindra — Stinger');

q(3, 'Torment Grenade',
  'Torment Grenade заставляет пройти poison test врага с Save 4+ и стоящего рядом вашего Agent с Save 4+. На каждом тесте выпало 2. Кто получает D3 урона и Poison token?',
  ['Оба: каждый результат 2 увеличивается до 3', 'Только враг: дружественные оперативники не проходят poison test', 'Никто: требуется естественный результат 3+', 'Только Agent: у врага результат 2 считается успешным save'],
  'Torment Grenade включает других оперативников в пределах 1 дюйма от выбранного врага. При Save 4+ или хуже к тесту добавляется 1; это poison test, а не бросок спасения.', 1, 'Disciple of Yaelindra — Torment Grenade');

q(4, 'Torment Grenade',
  'На враге уже есть ваш Poison token. В следующем turning point он снова проходит poison test от Torment Grenade: итог теста 4. Затем наступает его активация. Как разрешается урон?',
  ['D3 сразу от новой гранаты, затем D3 при активации; Poison token остаётся один', 'Только D3 при активации: повторная граната не действует на отравленную цель', 'D3 сразу, затем 2D3 при активации от двух Poison tokens', 'Только D3 сразу: новая граната снимает предыдущий Poison token'],
  'Оговорка о наличии жетона ограничивает только выдачу дополнительного Poison token. Немедленный урон новой гранаты сохраняется, а при активации действует один жетон.', 1, 'Disciple of Yaelindra — Torment Grenade');

q(4, 'Torment Grenade',
  'Противник с вашим Poison token уже завершил свою активацию и позже выполняет counteraction. Сколько раз именно counteraction запускает D3 урона от Poison token?',
  ['Ни разу: жетон срабатывает при активации', 'Один раз перед действием counteraction', 'Один раз после действия counteraction', 'Два раза: до и после действия counteraction'],
  'Урон Poison token привязан к моменту, когда оперативник активируется. Counteraction не является активацией и не создаёт ещё одно срабатывание.', 1, 'Torment Grenade; Core Rules — Counteract');

q(3, 'Combat Drugs',
  'У Agent с Hypex осталось 3 раны из 8. Его исходные Move — 7 дюймов и Hit splinter rifle — 3+. Как injured влияет на эти две характеристики?',
  ['Move остаётся 7 дюймов, Hit становится 4+', 'Move остаётся 7 дюймов, Hit остаётся 3+', 'Move становится 5 дюймов, Hit остаётся 3+', 'Move становится 5 дюймов, Hit становится 4+'],
  'Hypex позволяет игнорировать изменение Move от injured. На штраф к Hit эта COMBAT DRUG не распространяется.', 2, 'Elixicant — Hypex; Core Rules — Injured');

q(3, 'Combat Drugs',
  'Команда начала бой с Painbringer. Elixicant выполняет Administer Drug на раненого Agent, чтобы дать ему Hypex. Что ещё происходит с этим применением?',
  ['Hypex заменяет Painbringer только у Agent; лечения от этого же применения нет', 'Agent получает Hypex вдобавок к Painbringer и восстанавливает 2D3 ран', 'Вся команда меняет Painbringer на Hypex', 'Agent теряет Painbringer, получает Hypex и обязательно восстанавливает 2D3 ран'],
  'Administer Drug предлагает выбор между лечением и заменой COMBAT DRUG у выбранного оперативника. Замена не добавляет второй препарат и не меняет препарат всей команды.', 2, 'Elixicant — Administer Drug');

q(4, 'Combat Drugs',
  'Оперативнику с Painbringer предстоит получить урон от двух незаблокированных attack dice: 3 и 2. Шестёрка на броске Painbringer для первого кубика уменьшает его урон до 2. Нужно ли бросать Painbringer для второго кубика, раз суммарный урон теперь равен 4?',
  ['Нет: порог 3 проверяется отдельно для каждого наносящего урон attack die', 'Да: сумма урона больше 3, поэтому проверяются оба кубика', 'Да: уменьшение первого урона запускает новый тест для второго', 'Нет: Painbringer вообще разрешён только один раз за Shoot'],
  'Painbringer реагирует на конкретный attack die с уроном 3 или больше. Урон второго кубика равен 2, и сумма урона всей атаки этого не меняет.', 2, 'Elixicant — Painbringer');

q(4, 'Flayer',
  'По Flayer прошёл один normal hit с Normal Dmg 4 и один critical hit с Critical Dmg 5. Кроме того, отдельно уже нанесены 2 урона от Devastating. Сколько урона суммарно остаётся после Insensible to Pain?',
  ['9: 3 + 4 + 2', '8: 3 + 4 + 1', '10: 4 + 5 + 1', '7: каждый из трёх источников уменьшается на 1, а крит ещё на 1'],
  'Insensible to Pain уменьшает Normal и Critical Dmg 3+ на единицу: 4 становится 3, 5 становится 4. Отдельный урон Devastating не является Normal или Critical Dmg и остаётся равным 2.', 3, 'Flayer — Insensible to Pain; Weapon Rules — Devastating');

q(4, 'Skysplinter Assassin',
  'Assassin получил APL 3. Игрок планирует Shoot из razorwing, затем Shoot из shardcarbine, затем Mark на третью цель. Можно ли выполнить всю последовательность в одной активации?',
  ['Нет: разрешение на два Shoot требует вообще не выполнять Mark в этой активации', 'Да: Mark идёт после обоих Shoot и уже ничего не меняет', 'Да: APL 3 снимает ограничение Merciless Hunter', 'Нет: из shardcarbine нужно стрелять раньше razorwing, тогда всё получится'],
  'Merciless Hunter проверяет отсутствие Mark на протяжении всей активации. Перенос Mark в конец не позволяет совместить его с двумя Shoot.', 2, 'Skysplinter Assassin — Merciless Hunter; Mark');

q(3, 'Skysplinter Assassin',
  'Assassin остаётся на Conceal всю активацию и не выполняет Mark. Игрок хочет дважды стрелять благодаря Merciless Hunter. Какая комбинация доступна?',
  ['Только один Shoot из razorwing; две стрельбы при сохранении Conceal не складываются', 'Два Shoot из razorwing, потому что у него Silent', 'Razorwing и shardcarbine: разрешение на два Shoot даёт Silent обоим', 'Два Shoot из shardcarbine, если первым выстрелом уничтожена цель'],
  'Silent есть у razorwing, но не у shardcarbine. При двух Shoot Merciless Hunter требует выбрать razorwing ровно для одного из них, поэтому заменить второй выстрел ещё одним razorwing нельзя.', 2, 'Skysplinter Assassin — Razorwing; Merciless Hunter');

q(4, 'Skysplinter Assassin',
  'Assassin с Engage выполнил Mark на видимого врага с Conceal, находящегося в укрытии от Heavy terrain. Затем хочет стрелять в него из shardcarbine. Снимает ли Mark защиту этого укрытия?',
  ['Нет: Seek Light не снимает защиту Conceal за Heavy terrain', 'Да: запрет obscured автоматически отменяет любое укрытие', 'Да: Mark даёт полный Seek', 'Да, но только если Assassin не перемещался до Mark'],
  'Mark даёт Seek Light и убирает obscured для стрельбы Assassin в выбранную цель. Это не полный Seek: Conceal в укрытии от Heavy terrain по-прежнему защищает от выбора целью shardcarbine.', 2, 'Skysplinter Assassin — Mark; Weapon Rules — Seek Light');

q(3, 'Skysplinter Assassin',
  'Assassin видит врага в 14 дюймах и выполняет Mark. Позже ваш Gunner стреляет в ту же цель. Какие части плана работают?',
  ['Mark можно выполнить на этой дистанции, но Gunner не получает его бонусов', 'Mark ограничен 6 дюймами, поэтому выбрать цель нельзя', 'Mark работает, а Gunner получает Seek Light и игнорирование obscured', 'Mark работает, но Gunner получает только игнорирование obscured'],
  'У Mark нет предела дальности выбора видимой цели. Его стрелковые бонусы относятся к this operative — самому Assassin, а не ко всем дружественным стрелкам.', 2, 'Skysplinter Assassin — Mark');

q(4, 'Omen',
  'Вражеский оперативник выбран для Omen. На броске атаки он получил 6 и обязан её перебросить. Повторный бросок тоже дал 6. Что происходит с этим кубиком?',
  ['Он остаётся 6: один кубик нельзя перебросить повторно', 'Его перебрасывают снова, пока не выпадет значение от 1 до 5', 'Он автоматически становится normal success', 'Он сбрасывается как промах'],
  'Omen требует перебросить шестёрку, но не отменяет запрет перебрасывать один и тот же кубик больше одного раза. Полученная при повторном броске шестёрка сохраняется.', 2, 'Skysplinter Assassin — Omen; Core Rules — Dice');

q(3, 'Omen',
  'Враг под Omen атакует оружием с Lethal 5+. На кубиках атаки выпали 5 и 6. Какие из них Omen заставляет перебросить?',
  ['Только 6; критическая 5 остаётся', 'Оба: Omen перебрасывает все critical successes', 'Только 5: естественная 6 защищена от повторного броска', 'Ни один: Lethal 5+ отменяет Omen'],
  'Omen относится к числовому результату 6, а не к категории critical success. Lethal 5+ не превращает выпавшую пятёрку в числовую шестёрку.', 2, 'Skysplinter Assassin — Omen');

q(4, 'Refined Poison',
  'Assassin использует Refined Poison для shardcarbine с Dmg 2/2 и Devastating 2. Один normal success и один critical success прошли защиту. Какой суммарный урон дают эти успехи вместе с Devastating этого крита?',
  ['7: normal 3, critical 2 и ещё 2 от Devastating', '8: normal 3, critical 3 и ещё 2 от Devastating', '6: normal 2, critical 2 и ещё 2 от Devastating', '9: normal 3, critical 2 и 4 от усиленного Devastating'],
  'Refined Poison увеличивает только Normal Dmg: профиль становится 3/2. Critical Dmg и значение Devastating не меняются, поэтому итог — 3 + 2 + 2.', 8, 'Refined Poison; с. 2 — Shardcarbine');

q(4, 'Refined Poison',
  'Heavy Gunner использует Refined Poison при выборе sweeping-профиля splinter cannon и проводит один Shoot с Torrent по трём целям. Сколько применений оборудования потрачено и какие цели получают усиленный Normal Dmg?',
  ['Одно применение; Normal Dmg усилен во всех трёх последовательностях этого Shoot', 'Одно применение; усиление действует только против первой цели', 'Три применения, поэтому третью цель обстрелять нельзя', 'Два применения; третья цель получает обычный Normal Dmg'],
  'Refined Poison применяется при выборе оружия и действует до конца Shoot. Дополнительные последовательности Torrent входят в то же действие и не расходуют отдельные применения.', 8, 'Refined Poison; с. 3 — Splinter cannon (sweeping); Weapon Rules — Torrent');

q(4, 'Toxin Coating',
  'В начале turning point Agent применил Toxin Coating при retaliation. Затем Duellist выполняет два Fight и хочет усилить razorflail в обоих. Как распределяется оставшийся лимит?',
  ['Хватит только на один из двух Fight Duellist', 'Хватит на оба: Duellist получает собственный лимит из двух применений', 'Одно применение сразу усилит оба Fight Duellist до конца активации', 'Лимита не осталось: retaliation расходует оба применения'],
  'Два применения Toxin Coating — общий лимит команды на turning point. Усиление действует до конца отдельной последовательности, поэтому два Fight требуют двух применений, а осталось одно.', 8, 'Toxin Coating; с. 1 — Crimson Duellist');

q(3, 'Wicked Blades',
  'Вы взяли Wicked Blades. В одном turning point дерутся Agent с array of blades, Duellist с razorflail и Flayer с pain sculptors. Какие значения Atk будут у этих трёх видов оружия?',
  ['4, 4, 4 соответственно', '4, 5, 5 соответственно', '3, 5, 5 соответственно', '4, 5, 4 соответственно'],
  'Wicked Blades добавляет атаку только array of blades: 3 становится 4. Razorflail и pain sculptors уже имеют Atk 4, но оборудование их не усиливает.', 7, 'Wicked Blades; с. 1 и 3 — профили melee weapons');

q(4, 'Cruel Deception',
  'Agent с APL 2 начинает активацию в control range врага. Игрок применяет Cruel Deception, выполняет Fall Back за 1AP и затем Shoot из splinter rifle за 1AP. Получит ли этот Shoot Accurate 1 от Rifles?',
  ['Нет: снижение стоимости Fall Back не отменяет условие Rifles', 'Да: Fall Back за 1AP считается Dash для Rifles', 'Да: Rifles отключается только после Reposition', 'Shoot вообще недоступен: Cruel Deception расходует второе AP'],
  'Cruel Deception уменьшает AP-стоимость Fall Back, сохраняя само действие Fall Back. Оно выполнено до Shoot в этой активации, поэтому Rifles не даёт Accurate 1.', 6, 'Cruel Deception; с. 5 — Rifles');

q(3, 'Состав команды',
  'В составе уже выбраны Archsybarite с blast pistol и Heavy Gunner с dark lance. Игрок хочет добавить Gunner. Какое вооружение Gunner сохраняет этот состав?',
  ['Shredder; array of blades', 'Blaster; array of blades', 'Любое: darklight-лимит учитывает только Gunner и Heavy Gunner', 'Никакое: Gunner и Heavy Gunner нельзя брать вместе'],
  'Blast pistol и dark lance уже занимают два разрешённых darklight weapons. Shredder к ним не относится; blaster стал бы третьим. Совместное включение Gunner и Heavy Gunner разрешено.', 4, 'Kill Team — Operatives; darklight weapons');

q(4, 'Vitalised Surge',
  'Flayer с запасом Pain tokens выполнил Charge, затем Fight и уничтожил единственного врага рядом с собой. Invigorations в этой активации он ещё не использовал. Может ли он после удаления врага выполнить Dash через Vitalised Surge?',
  ['Да: Vitalised Surge разрешает этот Dash после Charge', 'Нет: Charge запрещает любой Dash в этой активации', 'Да, но для Dash потребуется ещё 1AP', 'Нет: сначала нужно дождаться конца всей активации'],
  'Vitalised Surge даёт немедленный бесплатный Dash после удаления уничтоженного врага и прямо допускает его после действия, которое обычно запрещает Dash. Выполненный Charge не мешает.', 4, 'Vitalised Surge');

q(4, 'Vitalised Surge',
  'Duellist с запасом Pain tokens уничтожает одного из двух врагов в своей control range. Второй враг остаётся в его control range. Может ли Duellist уйти от него через Dash от Vitalised Surge?',
  ['Нет: Vitalised Surge не отменяет запрет начинать Dash в control range врага', 'Да: любой бесплатный Dash разрешён из control range', 'Да: исключение для действий, запрещающих Dash, также убирает требования к позиции', 'Да, если Dash закончится дальше 2 дюймов от второго врага'],
  'Исключение Vitalised Surge относится к ранее выполненному действию, которое запрещает Dash. Оно не снимает условие самого Dash о нахождении вне control range врагов.', 4, 'Vitalised Surge; Core Rules — Dash');

q(4, 'Vitalised Surge',
  'Heavy Gunner с запасом Pain tokens во время counteraction уничтожил врага выстрелом из dark lance. Он хочет сразу использовать Vitalised Surge и переместиться по прямой на 3 дюйма. Какова максимальная дистанция этого Dash в counteraction?',
  ['2 дюйма: ограничение counteraction сохраняется', '3 дюйма: бесплатный Dash не относится к counteraction', '7 дюймов: Vitalised Surge использует полный Move', '0 дюймов: Heavy (Dash only) запрещает Dash после выстрела'],
  'Vitalised Surge может дать бесплатный Dash после уничтожения врага, а Heavy (Dash only) ему не мешает. Однако перемещение в counteraction ограничено 2 дюймами с приоритетом над другими правилами.', 4, 'Vitalised Surge; с. 3 — Dark lance; Core Rules — Counteract');

q(4, 'Pain tokens',
  'Assassin стреляет из razorwing, использует Stimulated Senses, затем стреляет из shardcarbine в той же активации. У него остались Pain tokens, Mark не выполнялся. Может ли он снова использовать Stimulated Senses на втором броске атаки?',
  ['Нет: дополнительное применение Stimulated Senses разрешено один раз за активацию', 'Да: лимит сбрасывается при каждом новом Shoot', 'Да: смена оружия открывает новое применение', 'Да, если на втором Shoot перебрасывается другое числовое значение'],
  'Исключение для Stimulated Senses позволяет использовать их один раз сверх другой invigoration. Оно не даёт по одному применению на каждое действие или оружие.', 4, 'Power From Pain; Stimulated Senses');

module.exports = entries;
