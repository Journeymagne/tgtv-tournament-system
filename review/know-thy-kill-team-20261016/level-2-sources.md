# Know Thy Kill Team - уровень 2 «Боец»

**Для согласования. Не загружено в игровой банк.**

Дата проверки: **16 октября 2026 года**, Asia/Yerevan.

Файл `level-2.json` содержит ровно 50 новых вопросов, `kt-151`-`kt-200`. Каждый вопрос имеет четыре различных варианта, один индекс правильного ответа, объяснение и ссылку на конкретный раздел источника. Темы: оружие и стрельба (5), снаряжение (13), террейн (9), миссии (13), действия (5), ближний бой (2), основы (1), взаимодействия (2). Семь вопросов отдельно называют команду, чьи специальные правила используются.

## Редакция и первичные источники

База: Kill Team третьей редакции, выпущенной в 2024 году. Это актуализированные правила, а не состояние книги на день выхода. Для общих уточнений использован Core Rules Update Log июня 2026; для Universal Equipment - документ июня 2026. Миссионный блок явно относится к **Approved Ops 2025** с уточнениями августа 2026.

Основные тексты прочитаны из предоставленного пользователем корпуса `C:/Users/Journeymagne/Documents/Kill Team References/Warhammer Community/2026-09-25/analysis/text/`. URL сверены с `X:/Vibecoding/custom teams/references/kill-team-wording/source-index.json`.

- [Официальные загрузки Kill Team](https://www.warhammer-community.com/en-gb/downloads/kill-team/) - открыты онлайн. Динамический список загрузок не полностью представлен в извлечённом HTML, поэтому дата проверки не выдаётся за гарантию отсутствия более позднего, ещё не найденного документа.
- [Kill Team Lite Rules](https://assets.warhammer-community.com/eng_jul25_kt_lite_rules-jmjv4hdamy-qlsqxdf83p.pdf) - страницы 1 и 3, оружейные правила и условия действий; прочитаны локально и онлайн. На вопросы не переносились упрощения Lite, расходящиеся с полными правилами.
- [Core Rules: Update Log](https://assets.warhammer-community.com/eng_17-06_kill_team_key_downloads_core_rules_update_log-9dzdz0ewle-wutcyhpgzf.pdf) - страницы 2, 6 и 7; прочитан локально и онлайн. Это журнал уточнений, не полный Core Book.
- [Universal Equipment](https://assets.warhammer-community.com/eng_17-06_kill_team_key_downloads_universal_equipment-prsd0j8pih-ikfmigl0za.pdf) - страницы 1-4 и 6; прочитан локально и онлайн. Для лестниц учтён текст исправления, отсутствующий в сокращённом основном блоке.
- [Approved Ops 2025 Update Log](https://assets.warhammer-community.com/eng_kt_approved_ops_update_log-c46bfdlsms-senqgrexsi.pdf) - страницы 1-3; прочитан локально и онлайн. Раздел старого пакета 2024 в конце документа не использован.
- [Killzone: Tomb World](https://assets.warhammer-community.com/eng_29-04_kt_mission_pack_killzone_tomb_world-jgm5ebvcoy-fu3lfpskgq.pdf) - страница 8 для Guard и point-blank shot, страница 5 для Breach; прочитано предоставленное локальное извлечение `killzone-tomb-world.txt`. Веб-инструмент не загрузил полный PDF из-за размера 19 MB; проверка Guard дополнена текущими Core Rules Update Log и Wahapedia.
- [Approved Ops 2025 Tournament Companion](https://assets.warhammer-community.com/eng_kt_approved_ops_2025_tournament_companion-fpsaag6ryp-uwnxgflxow.pdf) - открыт онлайн и прочитан локально для контекста Octarius. Имя локального файла `approved-ops-2024-tournament-companion.txt` ошибочно указывает 2024; содержание относится к 2025.

- [Kommandos](https://assets.warhammer-community.com/eng_17-06_kill_team_team_rules_kommandos_online_rules-ova8v1kjds-ds3ouz4k04.pdf) — страницы 4–5: Throat Slittas и Just a Scratch; прочитаны локально (`kommandos.txt`) и онлайн, сверены с [Wahapedia: Kommandos](https://wahapedia.ru/kill-team3/kill-teams/kommandos/).
- [Pathfinders](https://assets.warhammer-community.com/eng_pathfinders_online_rules-dj9snutji1-zk16jiuxxe.pdf) — страницы 4 и 6: MV1 Gun Drone и Markerlights; прочитаны локально (`pathfinders.txt`) и онлайн, сверены с [Wahapedia: Pathfinders](https://wahapedia.ru/kill-team3/kill-teams/pathfinders/). Строка о пяти Markerlight tokens, оставшаяся в таблице Wahapedia при указанном максимуме четыре, для вопросов не использована.
- [Corsair Voidscarred](https://assets.warhammer-community.com/eng_28-01_kill_team_team_rules_corsair_voidscarred-3war9i1i61-vjohvdpcb9.pdf) — страницы 2, 5–6: Faolchú’s Bond, Rifles, Aeldari Raiders и Plunderers. Прочитано предоставленное локальное извлечение `corsair-voidscarred.txt`, сверенное с [Wahapedia: Corsair Voidscarred](https://wahapedia.ru/kill-team3/kill-teams/corsair-voidscarred/). Прямая загрузка официального PDF веб-инструментом завершилась Internal Error; локальный текст и ссылка на январскую редакцию доступны.

Для сверки полного контекста прочитаны [Core Rules](https://wahapedia.ru/kill-team3/the-rules/core-rules/), [Appendix](https://wahapedia.ru/kill-team3/the-rules/appendix/), [Killzones](https://wahapedia.ru/kill-team3/the-rules/killzones/) и [Approved Ops 2025](https://wahapedia.ru/kill-team3/the-rules/approved-ops-2025/) на Wahapedia.

## Важные решения при проверке

- `kt-151`, `kt-152`, `kt-153`, `kt-156`, `kt-157`, `kt-163` и `kt-188` после независимого аудита заменены новыми ситуациями Kommandos, Pathfinders и Corsair Voidscarred. Идентификаторы сохранены; общее число вопросов — 50.
- `kt-161` теперь задаёт соседнего врага, а не союзника стрелка: близкий союзник делал бы обычный Shoot по основной цели недопустимым. Вопрос проверяет точку отсчёта области Devastating.
- `kt-195` проверяет запрет Envoy на повторное назначение из любого предыдущего Turning Point, включая назначение через один Turning Point.

- `kt-159` сознательно ссылается на полные Core Rules: Lite опускает разрешение Reposition проходить через control range врага, уже связанного союзником.
- `kt-177` явно называет Tomb World и исключает Charge/Shoot в текущей активации, чтобы скидка на Breach не вступала в конфликт с условиями действия.
- `kt-178` спрашивает только вертикальную составляющую непрерывного подъёма: горизонтальная часть не скрыта в ответе.
- `kt-180` отдельно задаёт полную стоимость прохода, поэтому вопрос не требует оценивать геометрию двери по отсутствующей картинке.
- `kt-184` и `kt-186` используют официальные правила Tomb World, а `kt-185` явно именует Gallowdark.
- `kt-191` проверяет только итоговые VP за перенос Retrieval markers. Он не повторяет новый вопрос уровня 1 о награде за первый поиск.
- `kt-197`-`kt-200` относятся к процедуре Approved Ops 2025, не к универсальной процедуре любого mission pack.

## Новизна и согласование

До написания прочитаны все 100 вопросов `src/training-data/questions.json`. Повторы существующих вопросов и простые изменения чисел исключены вручную. Темы дополнительно согласованы с авторами новых уровней 1 и 3: переданы им Limited+Blast, Hot+Torrent, дружественные вторичные цели Blast, Stun после блока и ряд простых фактов оборудования. Здесь оставлены другие проверяемые выводы.

После независимого сравнения всех четырёх новых уровней удалены семь прямых смысловых дублей уровня 1. Их замены проверяют отдельные правила команд, отсутствующие в остальных вопросах подборки и текущем банке. Случаи, использующие общую терминологию, различаются проверяемым выводом: например, старые вопросы по дыму проверяют Piercing и длительность, а `kt-167` — допустимую точку установки.

## Карта проверяемых правил

Страницы PDF считаются с 1.

| ID | Проверяемый вывод | Источник |
|---|---|---|
| kt-151 | Throat Slittas разрешает Kommando Boy Charge с Conceal | Warhammer Community — Kommandos, June 2026; PDF с. 4: Faction Rule — Throat Slittas |
| kt-152 | Just a Scratch не применяется к Critical Dmg | Warhammer Community — Kommandos, June 2026; PDF с. 5: Firefight Ploy — Just a Scratch |
| kt-153 | Reposition и Dash в одной активации снимают только один Markerlight token | Warhammer Community — Pathfinders: Online Rules; PDF с. 6: Faction Rule — Markerlights, removing tokens |
| kt-154 | Один подходящий помощник улучшает Hit в Fight | Wahapedia — Kill Team 3rd edition: Core Rules; Fight — Roll Attack Dice: assisting |
| kt-155 | Command Re-roll можно повторять за Turning Point на новых бросках | Warhammer Community — Kill Team Lite Rules (сверено с Core Rules); PDF с. 1: Firefight Phase; Command Re-roll |
| kt-156 | MV1 Gun Drone учитывает APL на 1 ниже при контроле objective marker | Warhammer Community — Pathfinders: Online Rules; PDF с. 4: MV1 Gun Drone — Drone |
| kt-157 | Rifles допускает Reposition после выстрела с Accurate 1 | Warhammer Community — Corsair Voidscarred, January 2026; PDF с. 5: Faction Rule — Rifles |
| kt-158 | Charge не позволяет выйти из control range ранее не связанного врага | Warhammer Community — Kill Team Lite Rules (сверено с Core Rules); PDF с. 1: Charge |
| kt-159 | Reposition допускает проход через control range врага, уже связанного союзником | Wahapedia — Kill Team 3rd edition: Core Rules; Reposition — exception for an enemy already engaged by a friendly operative |
| kt-160 | Количество вторичных целей Torrent выбирается | Warhammer Community — Kill Team Lite Rules (сверено с Core Rules); PDF с. 3: Torrent |
| kt-161 | Область дистанционного Devastating проверяется от цели, а не от стрелка | Warhammer Community — Kill Team Lite Rules (сверено с Core Rules); PDF с. 3: Devastating x |
| kt-162 | Range включает граничную дистанцию | Warhammer Community — Kill Team Lite Rules (сверено с Core Rules); PDF с. 3: Weapon Rules — Range x |
| kt-163 | Plunderers запрещает Dash в последующей активации того же Turning Point | Warhammer Community — Corsair Voidscarred, January 2026; PDF с. 6: Strategy Ploy — Plunderers; с. 5: Aeldari Raiders |
| kt-164 | Несколько источников Accurate объединяются в Accurate 2 | Warhammer Community — Kill Team Lite Rules (сверено с Core Rules); PDF с. 3: Accurate x |
| kt-165 | Krak не имеет Blast | Warhammer Community — Universal Equipment, June 2026; PDF с. 2: Explosive Grenades — krak grenade profile |
| kt-166 | Stun Grenade допускает Conceal | Warhammer Community — Universal Equipment, June 2026; PDF с. 2: Utility Grenades — Stun Grenade |
| kt-167 | Smoke marker можно ставить на невидимую точку Vantage видимого террейна | Warhammer Community — Universal Equipment, June 2026; PDF с. 4: Smoke Grenade — placing the marker |
| kt-168 | Эффект Ammo Resupply не исчезает после отхода от тайника | Warhammer Community — Universal Equipment, June 2026; PDF с. 1: Ammo Cache — Ammo Resupply duration |
| kt-169 | Ammo Resupply запрещён в control range врага | Warhammer Community — Universal Equipment, June 2026; PDF с. 1: Ammo Cache — Ammo Resupply conditions |
| kt-170 | Razor Wire требует больше 2″ от Accessible при обычной установке | Warhammer Community — Universal Equipment, June 2026; PDF с. 1: Razor Wire — setup restrictions |
| kt-171 | Льгота лестницы действует один раз за действие | Warhammer Community — Universal Equipment, June 2026; PDF с. 6: Ladders — amended second paragraph |
| kt-172 | Лестнице достаточно больше 1″ до точки доступа | Warhammer Community — Universal Equipment, June 2026; PDF с. 2: Ladders — setup |
| kt-173 | Мине нужно строго больше 2″ до других маркеров | Warhammer Community — Universal Equipment, June 2026; PDF с. 1: Mines — setup |
| kt-174 | Move With Barricade запрещает даже короткий drop | Warhammer Community — Universal Equipment, June 2026; PDF с. 3: Portable Barricade — Move With Barricade |
| kt-175 | Move With Barricade доступен только со внутренней стороны | Warhammer Community — Universal Equipment, June 2026; PDF с. 3: Portable Barricade — Portable |
| kt-176 | Обычная установка Light Barricade требует killzone floor | Warhammer Community — Universal Equipment, June 2026; PDF с. 2: Light Barricades — setup |
| kt-177 | Breaching Charge уменьшает Breach 2 AP до 1 AP при выполненных условиях | Warhammer Community — Universal Equipment, June 2026; PDF с. 3: Breaching Charge; контекст: Killzone Tomb World, Breach |
| kt-178 | Вертикальные части одного подъёма суммируются до округления | Warhammer Community — Core Rules: Update Log, June 2026; PDF с. 7: climbing across different parts of terrain |
| kt-179 | Обычный прыжок ограничен 4″ по горизонтали | Warhammer Community — Core Rules: Update Log, June 2026; PDF с. 2: Terrain and Movement — Jumping |
| kt-180 | Стоимость прохода Accessible учитывается в лимите Counteract | Warhammer Community — Core Rules: Update Log, June 2026; PDF с. 6: Counteract — terrain and additional movement costs |
| kt-181 | Condensed Stronghold не действует для цели на верхней площадке | Warhammer Community — Core Rules: Update Log, June 2026; PDF с. 2: Volkus — Condensed Stronghold |
| kt-182 | Bheta-Decima разрешает оборудование на Vantage и возле Accessible | Warhammer Community — Core Rules: Update Log, June 2026; PDF с. 2: Bheta-Decima — Equipment |
| kt-183 | Octarius: верхний парапет Ramshackle Wall имеет Light | Warhammer Community — Approved Ops 2025 Update Log, August 2026; PDF с. 1: August ’26 — Octarius, Ramshackle Wall |
| kt-184 | Guard считается Shoot для ограничения повторения действий | Warhammer Community — Killzone: Tomb World, Close Quarters; PDF с. 8: Close Quarters — Guard |
| kt-185 | Guard не обязан выбирать активного врага своей целью | Wahapedia — Kill Team 3rd edition: Killzones; Close Quarters — On Guard, target selection |
| kt-186 | Point-blank shot запрещает retaliate до конца текущей вражеской активации | Warhammer Community — Killzone: Tomb World, Close Quarters; PDF с. 8: On Guard — point-blank shot |
| kt-187 | Порог высоты Vantage 2″, но меньше 4″, даёт Accurate 1 | Wahapedia — Kill Team 3rd edition: Killzones; Terrain Types — Vantage, Accurate thresholds |
| kt-188 | Ready Kurnite Hunter при первой retaliation разрешает первый кубик через Faolchú’s Bond | Warhammer Community — Corsair Voidscarred, January 2026; PDF с. 2: Voidscarred Kurnite Hunter — Faolchú’s Bond |
| kt-189 | Stake Claim запрещает повторный выбор того же маркера | Warhammer Community — Approved Ops 2025 Update Log, August 2026; PDF с. 2: Stake Claim — Reveal |
| kt-190 | Заявка Stake Claim «враги не contest» выполняется на пустом маркере | Warhammer Community — Approved Ops 2025 Update Log, August 2026; PDF с. 2: Stake Claim — claims and Victory Points |
| kt-191 | Retrieval даёт дополнительные VP за перенос маркеров в конце битвы | Warhammer Community — Approved Ops 2025 Update Log, August 2026; PDF с. 3: Retrieval — end-of-battle scoring |
| kt-192 | Поиск врагом не расходует собственный поиск Retrieval | Warhammer Community — Approved Ops 2025 Update Log, August 2026; PDF с. 3: Retrieval — Retrieve action |
| kt-193 | Flank требует wholly внутри конкретного фланга | Warhammer Community — Approved Ops 2025 Update Log, August 2026; PDF с. 3: Flank — Additional Rules |
| kt-194 | Flank повышает награду за удержание фланга на рубежах третьего и четвёртого TP | Warhammer Community — Approved Ops 2025 Update Log, August 2026; PDF с. 3: Flank — Victory Points |
| kt-195 | Envoy нельзя повторно выбрать после любого предыдущего Turning Point | Warhammer Community — Approved Ops 2025 Update Log, August 2026; PDF с. 3: Envoy — selection restrictions |
| kt-196 | Martyrs даёт 1 VP за contest без контроля | Warhammer Community — Approved Ops 2025 Update Log, August 2026; PDF с. 3: Martyrs — Victory Points |
| kt-197 | Primary Op округляет половину очков вверх | Wahapedia — Approved Ops 2025; End the Battle — Primary Op bonus |
| kt-198 | Карту инициативы получает проигравший roll-off, а не оставшийся без инициативы | Wahapedia — Approved Ops 2025; Play the Battle — initiative cards |
| kt-199 | При расстановке треть из восьми округляется до трёх | Wahapedia — Approved Ops 2025; Set Up Operatives — one third, rounding up |
| kt-200 | Оборудование выставляется по предметам, а не комплектам | Wahapedia — Approved Ops 2025; Set Up Operatives — item by item |

## Проверка файла

Проверены количество 50, идентификаторы 151-200, уровень 2 у всех записей, четыре уникальных варианта, индекс ответа 0-3, источники HTTPS и отсутствие дословных совпадений с текущим банком. Это проверка данных, не запуск автоматизированного test suite. Игровой банк, UI и другие файлы не изменялись.

Вопросы представляют собой оригинальные учебные ситуации и краткие пояснения; большие фрагменты правил не воспроизводятся. Финальная редакторская проверка всей новой подборки из 200 вопросов остаётся у собирающего автора.
