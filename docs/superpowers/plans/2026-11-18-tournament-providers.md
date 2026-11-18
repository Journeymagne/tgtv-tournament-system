# Tournament Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить организации-провайдеры с членством, приглашениями и проведением турниров и событий календаря от их имени.

**Architecture:** Отдельные таблицы организаций в существующей схеме `tournaments`; nullable `providerId` в турнирах и объявлениях. Права организации вычисляются по текущему членству и интегрируются в существующую авторизацию, календарь и клиент без нового сервиса.

**Tech Stack:** Node.js >=22, CommonJS, PostgreSQL/pg, существующий HTTP router, vanilla JS/CSS, node:test в GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-18-tournament-providers-design.md` — читать перед исполнением. Статус обоих документов: проект; сейчас выполнено только планирование.

## Global Constraints

- Создать организацию может пользователь с глобальным правом создания турниров (`canCreateTournaments`), администратор или суперадминистратор.
- Судья ведёт ивенты; создавать их и менять профиль организации могут организаторы.
- Членство организатора не выдаёт глобальный `canCreateTournaments`.
- Администратор и суперадминистратор управляют любой организацией без членства.
- Права организации действуют только в её пределах и проверяются на сервере после получения блокировки.
- Кнопки используют общие токены: 40 px, на ширине ≤600 px — 44 px; focus 2 px с отступом 3 px.
- Автоматические тесты локально не запускаются согласно `AGENTS.md`: новые тесты писать для CI, проверять результат именно реализованного commit SHA.
- Не менять production-аутентификацию; локальные помощники автологина и сессии хранить только в ignored `work/`.

## Review Focus

1. Исключённый создатель турнира сохраняет старую сессию или ожидающий запрос: унаследованный доступ должен исчезнуть, `owner_user_id` не обходить проверку (задачи 2 и 3).
2. Организатор без глобальных прав подставляет чужой `providerId` или выбирает личный турнир: 403 и отсутствие записей (задачи 2 и 3).
3. Гонка принятия/отзыва приглашения и передачи/понижения главного организатора: одно членство, один главный организатор, атомарный результат (задачи 1 и 2).
4. Гость запрашивает скрытый турнир через профиль, календарь, счётчики, прямой URL или логотип: данные черновика не раскрываются (задачи 3 и 4).
5. Турнир создаётся из объявления или переносится между датами: одна карточка и одно объявление, прежняя организация и местная дата (задачи 3 и 4).

## Карта файлов и порядок

1 → 2 → 3 → 4 → 5 → 6. Каждая задача заканчивается отдельным reviewable commit; пуш и интеграция выполняются в рамках последующего запроса на реализацию. Изоляцию рабочей ветки выбрать при начале реализации. Текущие посторонние изменения не включать.

| Область | Создать | Изменить |
|---|---|---|
| Хранение | `src/db/migrations/116_tournament_providers.js`, `src/db/repositories/tournament-providers.js` | `src/db/migrate.js`, `scripts/provision-service-roles.js` при необходимости |
| Предметная модель | `src/domain/tournament-providers.js` | `src/domain/access.js`, `src/db/repositories/access.js` |
| API организаций | `src/api/tournament-providers.js`, `src/api/routes-tournament-providers.js` | `src/api/routes-tournaments.js`, `src/api/authorization.js`, `src/resources/enforce.js` |
| Ивенты и доступ | — | `src/api/tournaments.js`, `src/api/access-management.js`, `src/api/calendar-events.js`, `src/api/tournament-live.js`, `src/api/views.js`, `src/db/repositories/tournaments.js`, `src/db/repositories/calendar-events.js` |
| Клиент | `public/tournament-providers.js`, `public/tournament-providers.css` | `public/app.js`, `public/admin.js`, `public/calendar.js`, `public/index.html`, `public/i18n/ru.js`, `public/i18n/en.js`, `src/services/catalog.js` |
| Проверки | `test/unit/tournament-providers.test.js`, `test/unit/client-tournament-providers.test.js`, `test/integration/api-tournament-providers.test.js`, `test/integration/tournament-provider-access.test.js` | существующие тесты календаря, ролей, CI, сервисных границ; `scripts/ci-plan.js` |

Номер 116 свободен на момент планирования; если занят к началу реализации, выбрать следующий свободный номер и синхронно исправить регистрацию миграции. Сначала изучить действующие grants и регистрацию таблиц: `src/db/schemas.js` описывает историческое перемещение таблиц, добавлять новые таблицы туда автоматически не нужно.

## Task 1: Хранение и инварианты организации

**Interfaces:** `Provider` содержит `id, slug, name, logoUrl, city, description, ownerUserId, archivedAt, updatedAt`. `ProviderMembership` содержит `id, providerId, userId, role: 'organizer'|'judge', joinedAt, endedAt`. Создать функции репозитория `findById(client,id,{lock=false})`, `findBySlug(client,slug)`, `activeMembership(client,providerId,userId)`, `insert(client,input)`, `audit(client,event)`; изменение состава всегда после блокировки организации.

- [ ] Добавить интеграционные сценарии `creation_is_atomic`, `one_active_membership`, `one_pending_invitation`, `owner_requires_active_organizer`, `old_events_keep_null_provider`: сравнить записи и ограничения в реальном PostgreSQL. Создатель и его членство появляются вместе, откат не оставляет пустую организацию.
- [ ] Создать миграцию четырёх таблиц из spec и nullable FK в турнирах/календаре. Добавить индексы `provider_id`, уникальные ключи имени/slug и частичные ограничения членства/приглашений; обеспечить согласованность главной роли deferred constraint trigger либо эквивалентным DB-инвариантом.
- [ ] Зарегистрировать миграцию; выдать grants `kt_tournaments` на таблицы и sequence, не открывая их сервису accounts. Обновить provisioning только если он иначе теряет эти права при повторном запуске.
- [ ] В `src/domain/tournament-providers.js` добавить `normalizeProvider(input,{partial=false})` с ограничениями spec; переиспользовать нормализацию логотипов/Markdown без изменения правил игровых команд.
- [ ] Реализовать репозиторий, публичные DTO без base64 и аудит. Не добавлять логотип в JSON списков; использовать версионированный URL по существующему механизму.
- [ ] Проверить diff и регистрацию миграции; включить DB-сценарии в CI commit задачи и подтвердить результат на его SHA. Commit: `feat: add tournament provider storage`.

## Task 2: Членство, приглашения и полномочия

**Interfaces:** добавить `providerPermissions(user,provider,membership)` → `{canEdit,canCreateEvents,canManageMembers,canTransferOwnership,canArchive}`; `requireProviderAccess(client,user,providerId,capability,{lock=false})` → `{provider,membership,permissions}` с актуальным чтением. Capability `canCreateProviders` отделён от scoped `canCreateEvents`. Hydration возвращает активные `providerMemberships: [{providerId,role,isOwner}]` только для tournaments/monolith.

**API contract:** `GET /api/tournament-providers?q=&city=&mine=&page=`; `GET /api/tournament-providers/dashboard`; `GET /api/tournament-providers/:slug`; `GET /api/tournament-provider-logos/:id`; `POST /api/tournament-providers`; `PATCH /api/tournament-providers/:id`. Список/профиль/изображение общедоступны, dashboard и мутации требуют пользователя; статический `/dashboard` регистрируется перед `/:slug`.

**API состава:** `POST /api/tournament-providers/:id/invitations {userId,role}`; `POST /api/tournament-provider-invitations/:id/{accept|decline|revoke}`; `PATCH /api/tournament-providers/:id/members/:userId {role}`; `DELETE` того же пути; `POST /api/tournament-providers/:id/{leave|archive|restore}`; `PATCH /api/tournament-providers/:id/owner {userId}`. Ответ мутации содержит обновлённый профиль или invitation; ошибки 401/403/404/409 используют существующий формат.

- [ ] Написать unit-матрицу `provider_permissions_by_role` и интеграционные тесты `invited_organizer_has_no_global_grant`, `admin_without_membership`, `only_recipient_accepts`, `accept_vs_revoke`, `transfer_vs_demote`, `archived_provider_rejects_join`, `stale_profile_update_409`. Проверять все роли, конфликтные транзакции и отсутствие лишних записей после отказа.
- [ ] Реализовать доменные полномочия, перечисленные API и общий порядок блокировок. Сохранить исторического создателя при передаче; не разрешать исключить/понизить/выйти действующему главному организатору. Архивирование отзывает pending-приглашения.
- [ ] Подключить routes и авторизацию без `auth:'admin'` для scoped действий. Ограничение создания провайдера проверяет глобальное право; создание будущих ивентов будет проверять выбранную организацию.
- [ ] Публиковать и отзывать приглашения через `src/notifications/publish.js` с типом `tournament_provider_invitation` и ID `tournament_provider_invitation:<id>`; ссылка ведёт во вкладку организаций к приглашению. Рендеринг уведомлений и права доступа не раскрывают чужие приглашения. При необходимости изменить `public/companion-notifications.js` / CSS и связанные notification-тесты.
- [ ] Использовать существующие `inviteDay` / `inviteRecipientDay` в `src/resources/enforce.js` и для приглашений провайдеров; не вводить обход дневных лимитов. Пагинация 20 записей, лимит ввода поиска как у существующих списков.
- [ ] Проверить по CI матрицу ролей и реальные сервисные подключения, commit: `feat: add tournament provider membership and invitations`.

## Task 3: Проведение ивентов и немедленный отзыв доступа

**Interfaces:** турнир и `CalendarEvent` получают `providerId: number|null` и публичный `provider: {id,slug,name,logoUrl}|null`; create payload принимает `providerId`. `canCreateTournament(user,{providerId=null}={})` различает глобальное и scoped право. `canManageTournament`, `canManageJudges`, `canFinishTournament` и `tournamentPermissions` сохраняют существующие signatures и учитывают организацию. Для вызовов с числовым ID hydration должна содержать доступные ID и отдельно роли/списки для завершения и управления судьями; нельзя считать всех `managedTournamentIds` организаторами.

- [ ] Написать сценарии `scoped_organizer_creates_without_global_right`, `foreign_provider_403`, `judge_create_403`, `removed_creator_loses_access`, `downgraded_organizer_cannot_finish`, `revocation_before_waiting_write`, `explicit_judge_assignment_survives_membership_removal`, `legacy_personal_tournament_unchanged`. Отдельно проверить admin и superadmin при управлении судьями турнира организации.
- [ ] Расширить hydration и authorization: для ивентов организации действуют актуальные роли; исторический `owner_user_id` не даёт обхода. Охватить вызовы с объектом и числовым ID, матчи/игры, admin-list, прямые страницы и endpoint изображений. После блокировки заново прочитать членство, проверить активность аккаунта.
- [ ] При создании турнира проверить личный/scoped контекст, записать `provider_id`. Сохранить существующие квоты автора и ограничения раундов; membership не делает лимиты бесконечными. Обычный PATCH отклоняет изменение `providerId`/`provider_id` после создания.
- [ ] Адаптировать календарные routes/handlers и явную проверку в `createAdmin`: организатор создаёт/редактирует объявления своей организации и создаёт из них турнир; судья этого не может. На чтении отдавать `viewer.canEdit` / `viewer.canCreateTournament`, а не требовать от клиента угадывать роль по `isAdmin`.
- [ ] Наследовать организацию при создании из объявления и при `syncTournament`, отклонять несовпадение. Сохранить транзакцию и уникальность `tournament_id`, существующие часовые пояса и поведение удаления ссылок. Выдержать порядок организация → турнир → объявление.
- [ ] Обновить live payload прав и все DTO; сервер остаётся источником истины при устаревшем клиенте. CI на SHA задачи должен пройти новые сценарии и существующие `api-access-roles`, `api-calendar-events`, `api-tournaments`, проверки игр и приватности. Commit: `feat: scope tournament and calendar access to providers`.

## Task 4: Публичные группы ивентов и защита черновиков

**Interfaces:** `GET /api/tournament-providers/:id/events?group=current|future|past|draft&page=` → `{items,pagination}`; элемент `{kind:'tournament'|'calendar',id,...existingSummary,provider}`. Группа draft разрешена только действующим членам/админам. Размер страницы 20; счётчики вычисляются по тому же условию видимости, что и items.

- [ ] Добавить `linked_calendar_event_not_duplicated`, `status_based_groups`, `standalone_calendar_today_and_yesterday`, `draft_metadata_and_logo_hidden`, `pagination_counts_only_visible`, `archived_history_visible`: сравнить выдачу гостя, стороннего игрока, члена и админа.
- [ ] Реализовать SQL группировки по правилам spec. Исключить дубли `calendar_events.tournament_id IS NOT NULL`, но для публичного объявления со скрытым турниром сохранить безопасную карточку объявления без данных турнира. Независимые объявления без end-time не относить в current. Недатированные рабочие записи выдавать в draft-группе.
- [ ] Переиспользовать существующую приватность турниров; не отдавать скрытые ID/slug через provider DTO, постеры, aggregate counts или календарь. Убедиться, что member-view одной организации не расширяет видимость чужих черновиков.
- [ ] Проверить CI сценариев видимости, сортировки и пагинации. Commit: `feat: expose provider events with scoped visibility`.

## Task 5: Вкладка, профиль и формы по UI Kit

**Interfaces:** ленивый `public/tournament-providers.js` получает контекст приложения (`api,t,user,navigate`) по существующему образцу календаря, рендерит каталог/профиль и использует серверные `viewer` capabilities. Router сохраняет публичную вкладку организаций при отсутствии администратора; состояние `tournamentsTab` не должно сбрасывать её в `public`.

- [ ] Написать клиентские проверки маршрутов и видимых действий: гостевая вкладка, приглашённый организатор без global grant, судья, админ без membership, переход по уведомлению, потеря прав в открытой форме. Обновить существующие тесты, которые утверждают, что календарь доступен для записи только `isAdmin`.
- [ ] Добавить вкладки и маршруты из spec, ленивая загрузка модуля и CSS; в `src/services/catalog.js` направить новые assets в tournaments. Подключить штатное версионирование assets, RU/EN; сохранить шапку и существующее администрирование.
- [ ] Реализовать каталог, поиск, город, «Мои», создание с обязательным логотипом, публичный профиль, роли участников, приглашения и разрешённые действия состава. Ошибка 409 предлагает перечитать актуальные данные; 403 после отзыва убирает недоступные действия.
- [ ] Переиспользовать карточки турниров и `details/summary`, три независимые группы и пагинацию; добавить служебную группу черновиков. Состояние disclosure хранить отдельно для `providerId` и группы.
- [ ] Добавить «От имени» в существующие формы турнира/объявления и передавать `providerId`. Организатор организации без глобального права видит кнопку создания и выбор своих организаций; «Личный турнир» скрыт. В деталях календаря заменить admin-only UI на capabilities. Показать ссылку на организацию в существующих карточках и подробностях ивента.
- [ ] Визуально проверить 390 px и desktop, светлую/тёмную темы, RU/EN, длинное имя, клавиатуру, focus, отсутствие логотипа у старой/повреждённой записи и все empty/error состояния. Новый сервер ради документации сейчас не запускать; при реализации соблюдать autologin `AGENTS.md`.
- [ ] Подтвердить клиентские проверки в CI на SHA задачи. Commit: `feat: add tournament organizations interface`.

## Task 6: Проверки границ сервисов и готовность выпуска

**Files:** `scripts/ci-plan.js`, `test/unit/ci-plan.test.js`, `test/integration/service-boundaries.test.js`, при необходимости fixture/helper, документация пользователей RU/EN.

- [ ] Убедиться, что новые `tournament-provider*` файлы выбирают tournaments и shared guards в CI; изменения общей авторизации/БД должны запускать все root tests. Дополнить CI-классификацию только при обнаруженном пробеле, Combat Lab не подключать без изменения его исходников/инструментов/runtime.
- [ ] Добавить сервисный сценарий: реальные accounts/tournaments/notifications процессы и изолированные роли. Приглашение доходит в inbox, принимается адресатом, grants достаточны для tournaments, accounts не читает таблицы провайдеров.
- [ ] Выполнить визуальный и API smoke локального preview с готовым пользовательским админским автологином: статическая страница, `/api/me` с `user.isAdmin === true`, доступность админских кнопок, вкладка организаций и создание через UI. По сценарию отдельно проверить судью/организатора, не подменяя готовый админский URL ручным логином.
- [ ] Проверить GitHub Actions для финального commit SHA и логи упавших job; после исправлений проверять новый SHA. Не запускать автоматические тесты локально. Не считать план или ещё не запущенный CI успешной валидацией реализации.
- [ ] Подготовить пользовательское описание ролей и RU/EN release notes с фактической версией/датой при выпуске. Если последующий запрос включает production deploy, завершить его только после проверки обеих публичных changelog API из `AGENTS.md`.
- [ ] Провести итоговый review по пяти рискам выше и критериям spec; commit: `test: verify tournament provider service boundaries`.

## Самопроверка плана

Требования распределены: обязательные поля и главный организатор — 1–2; приглашения/роли/полные права админов — 2–3; scoped создание, отзыв и календарь — 3; группы ивентов и приватность — 4; вкладка/профиль/UI Kit — 5; CI/preview/релиз — 6. Предложенные продуктовые детали явно отделены в spec. Реализация, push, merge и deploy этим планированием не выполняются.
