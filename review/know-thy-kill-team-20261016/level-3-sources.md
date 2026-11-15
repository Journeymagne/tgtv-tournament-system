# Know Thy Kill Team — уровень 3 «Ветеран»: источники и проверка

Подготовлено 16 октября 2026 года. Ровно 50 предложений, kt-201–kt-250, difficulty: 3. Это отдельный пакет для согласования; рабочий банк и интерфейс не изменялись.

## Источники

- [Wahapedia — Kill Team 3: Core Rules](https://wahapedia.ru/kill-team3/the-rules/core-rules/) — прочитаны действия, control range, Fight, перебросы, Counteract и момент изменения характеристик.
- [Wahapedia — Kill Team 3: Appendix](https://wahapedia.ru/kill-team3/the-rules/appendix/) — прочитаны Limited, Hot, Saturate, Seek, Blast, Torrent, Range и Stun.
- [Wahapedia — Kill Team 3: Killzones](https://wahapedia.ru/kill-team3/the-rules/killzones/) — прочитаны разделы Gallowdark, Volkus, Bheta-Decima, Tomb World и Close Quarters.
- [Warhammer Community — Core Rules: Update Log, June 2026](https://assets.warhammer-community.com/eng_17-06_kill_team_key_downloads_core_rules_update_log-9dzdz0ewle-wutcyhpgzf.pdf) — официальные уточнения проверены по физическим страницам 4–6; приоритет над сокращёнными формулировками.
- [Warhammer Community — Killzone: Tomb World Update Log, August 2026](https://assets.warhammer-community.com/eng_killzone_tomb_world_update_log-ptyzlo3dfr-ivlzsazxnf.pdf) — проверены обе страницы: обновлённая стоимость Breach, телепортация и действующие ограничения.
- [Warhammer Community — Volkus Compound Mission Pack](https://assets.warhammer-community.com/eng_kt_volkus_compound_mission_pack-oai8j5hmhd-a6ugpgdgkj.pdf) — прочитаны физические страницы 1–4: bunker, Fortified Position, stockade и открытие двери.
- [Warhammer Community — Universal Equipment, June 2026](https://assets.warhammer-community.com/eng_17-06_kill_team_key_downloads_universal_equipment-prsd0j8pih-ikfmigl0za.pdf) — прочитаны физические страницы 1, 3 и 4: Ammo Cache, Portable Barricade и Smoke Grenade.
- [Wahapedia — Approved Ops 2025](https://wahapedia.ru/kill-team3/the-rules/approved-ops-2025/) — прочитан Game Sequence → Play the Battle, особенно последовательность карточек инициативы.
- [Warhammer Community — Kill Team downloads](https://www.warhammer-community.com/en-gb/downloads/kill-team/) — официальный каталог просмотрен 16.10.2026.

## Как применялись источники

Вопросы сформулированы самостоятельно на русском, с четырьмя вариантами и одним правильным ответом. Это игровые задачи, а не дословная перепечатка правил. Конкретные специальные киллзоны и пакеты явно названы в условиях. Для официальных PDF в поле source.section указаны физические страницы, начиная с 1.

Core Rules Update Log не является полной книгой правил. Для базовых правил использована полная веб-справка Wahapedia Kill Team 3; изменённые взаимодействия дополнительно сверены с официальными PDF. Архив предыдущих errata проверялся в контексте действующего текста; старые зачёркнутые ограничения не переносились.

Для Tomb World Breach после Shoot допускается за 2 AP: старое полное запрещение не используется. Вопрос kt-240 специально проверяет это изменение. Для kt-243 учитывается отдельный предел Counteract на удаление и повторную установку оперативника.

## Проверки

- Прочитаны вопросы исходного банка kt-001–kt-100. Новые сценарии проверяют другие выводы: например, kt-227 — Counteract после Guard без прерывания, тогда как старый kt-061 — запрет после уже выполненного прерывания.
- Темы сверены с автором новых вопросов уровня 2; оттуда оставлены на уровне 2 и удалены здесь прямые вопросы о Heavy (Dash only), Seek Light против Heavy, Guard как Shoot, выборе другой цели Guard, запрете retaliation после point-blank shot, Bheta-Decima equipment на Vantage и выдаче initiative card проигравшему.
- На уровне 3 сохранены комбинации Limited + Blast, Hot + Torrent, Range + Torrent, Blast по союзнику, защита от выбора цели против Blast и Stun после блокирования.
- Структурно проверены 50 последовательных ID, difficulty=3, четыре различных варианта на вопрос, допустимый индекс answer и заполненные HTTPS-источники. Точных совпадений текста вопроса с исходными 100 нет.
- Автоматизированные тестовые suites не запускались. Проверка JSON является проверкой артефакта, не тестированием приложения.

## Карта точечных уточнений

| Вопрос | Проверяемый вывод | Источник |
|---|---|---|
| kt-210 | Противник не может заставить второй раз перебросить тот же кубик | Core Rules Update Log, стр. 5 |
| kt-218 | Запрет выбрать valid target не защищает вторичную цель Blast | Core Rules Update Log, стр. 4 |
| kt-227 | Неиспользованный Guard не блокирует Counteract; действие снимает Guard | Core Rules Update Log, стр. 6 |
| kt-232 | Условная видимость сквозь дверь для control range не разрешает Shoot | Core Rules Update Log, стр. 6 |
| kt-240 | После Shoot Breach остаётся доступен за 2 AP | Tomb World Update Log, стр. 2 |
| kt-244 | В бою через окно укрепления первым разрешает защитник | Volkus Compound Mission Pack, стр. 3 |
| kt-249 | При стрельбе в stockade Hit сначала становится 2+, затем injured ухудшает его до 3+ | Volkus Compound Mission Pack, стр. 4 |
| kt-250 | Guard сохраняет ограничение по оружию, благодаря которому разрешён дополнительный Shoot | Core Rules Update Log, стр. 4 |

## Изменения после межуровневой проверки

- kt-201 заменён: убран дубль kt-159; теперь проверяется августовское уточнение Tomb World о запрете заканчивать телепортацию ближе к врагу.
- kt-203 заменён: убран дубль kt-267; теперь проверяется сохранение маркера после удаления создавшего его оперативника.
- kt-220 заменён: убран дубль kt-138; теперь проверяется игнорирование добавочного урона именно выбранного кубика атаки.
- kt-232 уточнён: использована дверь Volkus Large Ruin, для которой явно прописано исключение при определении control range.
- kt-249 заменён: убраны дубль kt-140 и неточная формулировка Portable; теперь проверяется порядок изменения Hit против stockade.
- kt-250 заменён: убран дубль kt-136; теперь проверяется Guard при ограничении дополнительного Shoot конкретным оружием.
- kt-247 сохранён: автор уровня 4 подтвердил отсутствие дублирующего вопроса о сбросе прошлых модификаций через инициативный Re-roll.

Новые формулировки сопоставлены с готовыми level-1.json, level-2.json и level-4.json. Изменения затронули только согласованные level-3.json и этот файл.
