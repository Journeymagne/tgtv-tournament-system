# ТЗ: турнирная система TGTV на основе `sergkmsm/ktour`

Статус: черновик для ревью  
Дата: 2026-08-02  
Текущий проект: TGTV Ranking Tournament System, commit `a510145b781c45786c26fbacd12e98cb0571f6f0`  
Референс: `https://github.com/sergkmsm/ktour.git`, branch `requirements-1`, commit `43f0ec6130a4b6ec1009bde62aa917cf0a45e4e4`

## 1. Назначение

Нужно добавить в текущий TGTV Ranking Tournament System полноценный модуль управления турнирами для Kill Team и других tabletop wargames. Модуль должен быть интегрирован с существующими пользователями, админскими правами, PostgreSQL, Approved Ops scoring, Elo и публичным интерфейсом проекта.

`ktour` является продуктовым референсом, а не кодовой базой: в репозитории нет приложения, API, схемы БД или тестов. Поэтому это ТЗ переносит требования BracketFlow в архитектуру текущего TGTV-проекта, где уже есть:

- Node.js `http` сервер без Express/Fastify;
- CommonJS-модули;
- PostgreSQL через `pg`;
- versioned migrations в `src/db/migrations`;
- API-таблица в `src/api/routes.js`;
- доменная логика в `src/domain/*`;
- SQL-репозитории в `src/db/repositories/*`;
- frontend-монолит `public/app.js`;
- пользователи, сессии, админ-роль, челленджи, одиночные игры, Approved Ops результаты, Elo, leaderboard, profiles, stats.

## 2. Подтвержденные решения

Эти продуктовые решения подтверждены ревью 2026-08-02.

1. **Кто может создавать турниры.** Только текущие TGTV admins (`users.is_admin = true`) могут создавать и администрировать турниры в MVP. У турнира хранится `owner_user_id`, чтобы позже добавить tournament-specific admins или ownership transfer без ломки схемы.

2. **Участие в турнире.** Participant в MVP - это существующий TGTV user. Admin manual/bulk add может создать unregistered participant без `user_id`, но такой участник не сможет сам отправлять результаты или withdraw, пока admin не привяжет его к TGTV user.

3. **Влияют ли турнирные матчи на Elo.** Да. По умолчанию турнир `ranked`, но при создании можно выбрать `ratingPolicy = ranked | unranked`. Ranked tournament match после завершения применяет тот же `calculateElo`, что и обычная игра.

4. **Считаются ли турнирные матчи в All Kill Team Challenge.** Да, считаются по умолчанию. Настройка `challengeCreditPolicy = count | none` остается, но дефолт MVP - `count`.

5. **Формат результата.** Использовать существующий Approved Ops result payload текущего TGTV. Для standings считать tournament match outcome: win = 3, draw = 1, loss = 0. Tournament standings tiebreakers по умолчанию не используются (`tiebreakerOrder = []`); admin может явно включить нужные тайбрейкеры в настройках турнира.

6. **Публичные страницы.** MVP использует hash-route `/#tournaments/:slug`, чтобы не менять static fallback. Анонимный пользователь должен видеть публичный tournament page до login/register экрана.

7. **Late placement.** Новый игрок, добавленный после старта турнира, может войти в турнир только со следующего еще не стартовавшего раунда. Текущий active round и completed rounds не меняются. Система должна показать админу preview будущих пар и применить добавление только после подтверждения.

## 3. Целевой MVP

MVP должен покрыть полный цикл публичного турнира:

1. Admin создает private draft.
2. Admin заполняет базовые поля, выбирает формат и настройки.
3. Admin публикует tournament page как registration open или registration closed.
4. Participants присоединяются через публичную страницу, admin может добавлять участников вручную или bulk-списком.
5. До старта admin управляет участниками, withdrawal/removal, seed order и private preview.
6. Admin закрывает регистрацию и стартует турнир.
7. Round 1 становится active; будущие раунды not ready.
8. Admin стартует следующие раунды после выполнения prerequisites.
9. Assigned participant или admin отправляет result для active match.
10. Система атомарно завершает матч, обновляет bracket/schedule, standings, Elo и linked game history согласно настройкам турнира.
11. Admin может сделать constrained correction completed match result.
12. Admin может place after-start entrant через controlled preview и confirmation только со следующего еще не стартовавшего раунда.
13. Spectator без регистрации видит public page, bracket/schedule, participants, standings, match results, final results.
14. Admin завершает или отменяет турнир.

## 4. Вне MVP

Из `ktour` явно не переносить в первую реализацию:

- private tournaments и invite-only registration;
- custom registration fields;
- check-in;
- waitlist, payment, region restriction, blocklist;
- proof attachments, disputes, review states;
- forfeits как отдельный match result type;
- substitutions и drops после старта, кроме controlled late placement;
- two-stage tournaments;
- table assignment;
- structured missions, scenarios, deployment maps, round packets;
- round timers, scheduled round starts/ends, late-arrival handling;
- printable bracket и shareable image export;
- announcements и participant messaging;
- tournament templates.

Важно: out-of-scope функции не должны появляться полурабочими флагами в UI или API.

## 5. Роли и доступы

### 5.1 Admin

Admin - TGTV user с `is_admin = true`.

Admin может:

- create/edit tournament draft;
- publish tournament;
- close/reopen registration до старта;
- add/edit/remove participants до старта;
- edit participant faction metadata в любом non-cancelled состоянии;
- bulk-add participants;
- manage seed order и shuffle;
- preview bracket/schedule до старта;
- start tournament и rounds;
- report any active match result;
- correct completed match result через impact preview;
- place pending entrant после старта через controlled reflow;
- complete/cancel tournament.

### 5.2 Participant

Participant - TGTV user, привязанный к `tournament_participants.user_id`.

Participant может:

- join public tournament while registration open;
- request pending placement when tournament is in progress, если joining after start разрешен;
- withdraw до старта;
- view own status;
- submit active assigned match result;
- view public tournament data.

Participant не может:

- менять completed result;
- менять seed/order;
- видеть private admin preview, пока турнир не started;
- выполнять admin correction/reflow.

### 5.3 Spectator

Spectator - любой anonymous или signed-in viewer.

Spectator может:

- открыть published tournament page;
- видеть tournament details, participant list, bracket/schedule, standings, match status, final results.

Spectator не может выполнять write-действия.

## 6. Состояния

### 6.1 Tournament status

Разрешенные значения:

- `draft`: private to admin, не виден spectator;
- `registration_open`: public, joining allowed;
- `registration_closed`: public, joining blocked, ready to start if setup valid;
- `in_progress`: public, matches/rounds active by admin actions; joins become `pending_placement`;
- `completed`: public, terminal for competitive setup; разрешены только faction metadata edits и constrained completed match correction;
- `cancelled`: terminal read-only; cancelled draft остается private, previously published tournament остается public.

Нельзя добавлять состояния `paused` или `reopened` в MVP.

### 6.2 Participant status

Разрешенные значения:

- `joined`: зарегистрирован до старта, учитывается в preview;
- `active`: включен в started tournament;
- `pending_placement`: joined/added after start, не участвует до admin confirmation;
- `withdrawn`: participant withdrew before start, excluded from preview/start;
- `removed`: admin removed before start, excluded from preview/start;
- `eliminated`: single elimination participant lost and no longer has matches;
- `finished`: completed all required tournament matches.

`withdrawn` и `removed` должны оставаться видимыми admin до старта.

### 6.3 Round status

- `not_ready`: round exists, but admin has not started it;
- `active`: admin started round, match results can be submitted;
- `completed`: all required non-bye matches in round completed.

### 6.4 Match status

- `not_ready`: round not started;
- `active`: assigned participants/admin may submit result;
- `completed`: result saved; participant edits blocked; admin correction only through constrained flow.

Не добавлять MVP states `pending_confirmation`, `under_review`, `disputed`, `forfeited` для tournament matches. Существующий `games.pending_confirmation` остается только для обычных challenge games.

## 7. Форматы

### 7.1 Single elimination

Limits:

- active participants: 2-128;
- draw invalid;
- one loss eliminates participant;
- bracket size = smallest power of two >= active participant count;
- bye slots go to highest seeds;
- bye is auto-advancement and not score-reportable.

Seed slot order:

```text
start: [1, 2]
expand n from n / 2:
replace every seed s with [s, n + 1 - s]
```

Example for 8 slots:

```text
[1, 8, 4, 5, 2, 7, 3, 6]
```

Start behavior:

- create full bracket structure with future placeholder matches and source references;
- round 1 non-bye matches become `active`;
- future matches are `not_ready`;
- byes auto-advance participants in the same transaction.

Completion:

- tournament can complete when final match is completed;
- final placements:
  - 1st = final winner;
  - 2nd = final loser;
  - semifinal losers share 3rd because placement matches are later scope.

### 7.2 Swiss

Limits:

- active participants: 4-128;
- draws allowed;
- admin selects `swissRoundCount` before start;
- allowed range: 1 through `ceil(log2(activeParticipantCount))`.

Round 1:

- if odd participant count, first-round bye goes to lowest seed;
- remaining participants split into top half and bottom half by seed;
- pair top half against bottom half.

Later rounds:

- created only after previous round is completed;
- created as `not_ready`;
- admin starts when ready;
- standings at generation time drive pairings.

Pairing algorithm:

1. Sort participants by current standings, then seed for deterministic fallback.
2. If participant count is odd, assign bye to lowest-ranked participant without prior bye; if everyone has a bye, lowest-ranked participant gets it.
3. Group remaining participants by match points.
4. Pair within equal match-point groups.
5. If group count is odd, float lowest-ranked participant to next lower group.
6. Avoid rematches whenever a valid no-rematch pairing exists.
7. If rematch is unavoidable, choose the rematch whose previous meeting was earliest; seed order breaks any remaining tie.

Bye counts as win and 3 match points, but has no opponent tiebreak value.

## 8. Standings и tiebreakers

Swiss standings рассчитываются из completed tournament matches.

Base columns:

- rank;
- participant;
- wins;
- draws;
- losses;
- match points;
- byes;
- opponents played;
- configured tiebreaker values, only when enabled;
- rank explanation.

Points:

- win = 3;
- draw = 1;
- loss = 0;
- bye = win + 3 points.

MVP tiebreakers:

- `match_wins`: больше wins выше;
- `buchholz`: сумма match points реальных opponents, byes excluded;
- `head_to_head`: только для two-participant tie, если они играли друг с другом; skipped for draw/no meeting/more than two participants.
- `total_vp`: сумма Approved Ops `total`, набранная участником во всех completed non-bye tournament matches; больше выше.
- `vp_diff`: сумма `(own Approved Ops total - opponent Approved Ops total)` по всем completed non-bye tournament matches; больше выше.

Default tiebreaker order:

```json
[]
```

Rules:

- tournament standings tiebreakers are disabled by default;
- admin may choose ordered tiebreakers before start;
- scoring and tiebreaker order lock at tournament start;
- seed order never breaks published standings tie;
- byes do not add `total_vp` and do not affect `vp_diff`;
- result correction recalculates `total_vp` and `vp_diff` in the same operation as standings;
- if no tiebreakers are enabled, participants tied on match points share placement;
- if enabled tiebreakers do not separate participants, placement is shared;
- public page must show configured order and applied values only when tiebreakers are enabled.

## 9. Approved Ops integration

Tournament match result must reuse existing TGTV score structure from `src/domain/scoring.js`:

- per-player `crit`, `kill`, `tac`;
- selected `primary`;
- calculated `primaryBonus`;
- calculated `total`;
- optional `faction`;
- optional `tacOp`;
- optional `killzone`, `critOp`, `layout`;
- current TGTV tiebreaker flow for tied Approved Ops totals.

Tournament outcome derivation:

- if result has `winnerId`, winner gets win, opponent gets loss;
- if no `winnerId` and format allows draw, both get draw;
- if no `winnerId` in single elimination, reject result;
- if Approved Ops total tie in single elimination, UI must require TGTV match tiebreaker winner before submit.

Important distinction:

- Approved Ops / TGTV match tiebreaker decides the winner of one tied match when a winner is required.
- Tournament standings tiebreakers decide ranking between participants with equal match points.
- Tournament standings tiebreakers are off by default and are used only if admin enables them in tournament settings.
- `total_vp` and `vp_diff` are tournament standings tiebreakers, not match winner rules.

## 10. Elo and game history integration

### 10.1 Game table extension

Existing `games` table should be extended so tournament completed matches can appear in history/stats without using challenge lifecycle:

```sql
ALTER TABLE games
  ADD COLUMN source_type TEXT NOT NULL DEFAULT 'challenge',
  ADD COLUMN source_id INTEGER;
```

Rules:

- existing rows become `source_type = 'challenge'`;
- tournament completion inserts or updates a `games` row with `source_type = 'tournament'` and `source_id = tournament_matches.id`;
- tournament `games` rows are created only when a non-bye match is completed;
- tournament `games` rows are not used for active tournament state;
- existing challenge routes must not edit tournament-sourced games directly.

Admin correction route for ordinary games must reject `source_type = 'tournament'` and instruct the client to use tournament correction flow.

### 10.2 Rating policy

Tournament field:

```text
rating_policy: ranked | unranked
```

If `ranked`:

- result submit applies existing Elo K=32;
- Elo before/after/delta stored both on `games.elo` and `tournament_matches.elo`;
- correction reverses prior Elo and reapplies from current ratings in one transaction, matching existing admin override behavior.

If `unranked`:

- result does not update `users.rating`;
- no Elo delta is shown;
- match still affects tournament standings.

### 10.3 Challenge progress policy

Tournament field:

```text
challenge_credit_policy: count | none
```

Default: `count`.

If `count`, completed tournament matches count the same way as challenge games, using player factions from Approved Ops result.

If `none`, All Kill Team Challenge progress must ignore `games.source_type = 'tournament'`.

## 11. Database model

Add migration `003_tournaments.js`.

### 11.1 `tournaments`

```sql
CREATE TABLE tournaments (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  game_system TEXT NOT NULL DEFAULT 'Kill Team',
  starts_at TIMESTAMPTZ,
  rules_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  format TEXT NOT NULL,
  swiss_round_count INTEGER,
  tiebreaker_order TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  rating_policy TEXT NOT NULL DEFAULT 'ranked',
  challenge_credit_policy TEXT NOT NULL DEFAULT 'count',
  final_results JSONB,
  published_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
```

Constraints:

- `status in ('draft','registration_open','registration_closed','in_progress','completed','cancelled')`;
- `format in ('single_elimination','swiss')`;
- `rating_policy in ('ranked','unranked')`;
- `challenge_credit_policy in ('none','count')`;
- `swiss_round_count IS NOT NULL` only for Swiss;
- required publish fields must be validated at API/domain level because draft can be incomplete.

Indexes:

- `idx_tournaments_status`;
- `idx_tournaments_owner_user_id`;
- `idx_tournaments_starts_at`;
- unique `slug`.

### 11.2 `tournament_participants`

```sql
CREATE TABLE tournament_participants (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  display_name_key TEXT NOT NULL,
  faction TEXT,
  faction_rules TEXT,
  seed INTEGER,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  placed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

Constraints:

- `status in ('joined','active','pending_placement','withdrawn','removed','eliminated','finished')`;
- `source in ('self_join','admin_manual','admin_bulk')`;
- one non-removed/non-withdrawn participant per `user_id` per tournament;
- one active display name key per tournament unless the duplicate is withdrawn/removed.

Indexes:

- `idx_tournament_participants_tournament_id`;
- `idx_tournament_participants_user_id`;
- partial unique index on active `user_id`;
- partial unique index on active `display_name_key`.

### 11.3 `tournament_rounds`

```sql
CREATE TABLE tournament_rounds (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  generated_by TEXT NOT NULL DEFAULT 'system',
  metadata JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  UNIQUE (tournament_id, round_number)
);
```

Constraints:

- `status in ('not_ready','active','completed')`.

### 11.4 `tournament_matches`

```sql
CREATE TABLE tournament_matches (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_id INTEGER NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  bracket_position INTEGER,
  status TEXT NOT NULL,
  is_bye BOOLEAN NOT NULL DEFAULT FALSE,
  participant_a_id INTEGER REFERENCES tournament_participants(id) ON DELETE SET NULL,
  participant_b_id INTEGER REFERENCES tournament_participants(id) ON DELETE SET NULL,
  source_match_a_id INTEGER REFERENCES tournament_matches(id) ON DELETE SET NULL,
  source_match_b_id INTEGER REFERENCES tournament_matches(id) ON DELETE SET NULL,
  winner_participant_id INTEGER REFERENCES tournament_participants(id) ON DELETE SET NULL,
  result JSONB,
  match_points JSONB,
  elo JSONB,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  submitted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
```

Constraints:

- `status in ('not_ready','active','completed')`;
- `is_bye = true` implies no `participant_b_id`;
- non-bye match must have two participants before it can become active;
- completed non-bye match must have `result`;
- single elimination completed match must have `winner_participant_id`.

Indexes:

- `idx_tournament_matches_tournament_id`;
- `idx_tournament_matches_round_id`;
- `idx_tournament_matches_status`;
- unique partial `game_id` where not null.

### 11.5 `tournament_audit_events`

```sql
CREATE TABLE tournament_audit_events (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  before JSONB,
  after JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Audit required for:

- publish;
- close/reopen registration;
- participant add/edit/remove/withdraw;
- seed change/shuffle;
- start tournament;
- start round;
- result submit;
- result correction;
- late placement;
- complete;
- cancel.

## 12. Backend module structure

Follow existing architecture: `api -> domain -> db`.

New files:

```text
src/api/tournaments.js
src/api/admin-tournaments.js
src/domain/tournaments/lifecycle.js
src/domain/tournaments/participants.js
src/domain/tournaments/seeding.js
src/domain/tournaments/single-elimination.js
src/domain/tournaments/swiss.js
src/domain/tournaments/standings.js
src/domain/tournaments/corrections.js
src/domain/tournaments/late-placement.js
src/db/repositories/tournaments.js
src/db/repositories/tournament-participants.js
src/db/repositories/tournament-rounds.js
src/db/repositories/tournament-matches.js
src/db/repositories/tournament-audit-events.js
```

Also update:

```text
src/api/routes.js
src/api/views.js
src/db/rows.js
src/db/repositories/games.js
src/db/repositories/users.js
src/domain/scoring.js if tournament-specific helper is needed
public/app.js
public/styles.css
README.md
CHANGELOG.md
```

Module size guidance remains: keep files focused; split large tournament algorithms instead of creating one oversized `tournaments.js`.

## 13. API

All write routes that mutate tournament state must run with `tx: true`.

### 13.1 Public/spectator routes

```text
GET /api/tournaments
GET /api/tournaments/:slug
```

`GET /api/tournaments` returns published tournaments only:

- `registration_open`;
- `registration_closed`;
- `in_progress`;
- `completed`;
- `cancelled` if it was previously published.

`GET /api/tournaments/:slug` returns public view:

- tournament details;
- participant list with public fields;
- rounds and matches;
- standings for Swiss;
- final results when completed;
- viewer-specific actions if signed in and participant/admin.

Draft tournaments must return 404 to non-admin public route.

### 13.2 Participant routes

```text
POST /api/tournaments/:id/join
POST /api/tournaments/:id/withdraw
POST /api/tournaments/:id/matches/:matchId/result
GET /api/my-tournaments
```

`POST /join` body:

```json
{
  "displayName": "Player name"
}
```

Rules:

- requires signed-in user;
- registration open -> create `joined`;
- in progress -> create `pending_placement`;
- registration closed/completed/cancelled/draft -> reject;
- duplicate user/display name in active participant set -> 409.

`POST /withdraw`:

- requires signed-in participant;
- allowed only before tournament start;
- sets status `withdrawn`;
- excluded from preview/start.

`POST /matches/:matchId/result`:

- requires signed-in assigned participant;
- match must be `active`;
- participant must be assigned to the match;
- body uses current Approved Ops result form;
- completed result is final immediately;
- participant cannot edit completed match;
- admin correction remains available separately.

### 13.3 Admin routes

```text
GET    /api/admin/tournaments
POST   /api/admin/tournaments
GET    /api/admin/tournaments/:id
PATCH  /api/admin/tournaments/:id
POST   /api/admin/tournaments/:id/publish
POST   /api/admin/tournaments/:id/registration/close
POST   /api/admin/tournaments/:id/registration/reopen
POST   /api/admin/tournaments/:id/participants
POST   /api/admin/tournaments/:id/participants/bulk
PATCH  /api/admin/tournaments/:id/participants/:participantId
DELETE /api/admin/tournaments/:id/participants/:participantId
PUT    /api/admin/tournaments/:id/seeds
POST   /api/admin/tournaments/:id/seeds/shuffle
GET    /api/admin/tournaments/:id/preview
POST   /api/admin/tournaments/:id/start
POST   /api/admin/tournaments/:id/rounds/:roundId/start
POST   /api/admin/tournaments/:id/matches/:matchId/result
POST   /api/admin/tournaments/:id/matches/:matchId/correction-preview
POST   /api/admin/tournaments/:id/matches/:matchId/correct
POST   /api/admin/tournaments/:id/late-placement-preview
POST   /api/admin/tournaments/:id/late-placement
POST   /api/admin/tournaments/:id/complete
POST   /api/admin/tournaments/:id/cancel
```

Admin draft create body:

```json
{
  "name": "Summer Kill Team Open",
  "description": "",
  "gameSystem": "Kill Team",
  "startsAt": "2026-09-01T10:00:00.000Z",
  "rulesSummary": "",
  "format": "swiss",
  "swissRoundCount": 3,
  "tiebreakerOrder": [],
  "ratingPolicy": "ranked",
  "challengeCreditPolicy": "count"
}
```

Draft can be incomplete, but publish/start validation must require:

- name;
- description;
- game system/activity;
- start date;
- rules summary;
- MVP format;
- Swiss round count if Swiss;
- valid tiebreaker order for Swiss when tiebreakers are enabled.

Bulk participant body:

```json
{
  "names": "Alice\nBob\nCharlie"
}
```

Bulk rules:

- one participant per non-empty line;
- trim whitespace and collapse internal whitespace;
- reject invalid names with per-line errors;
- reject duplicate active display names in submitted list and tournament;
- recommended MVP behavior: all-or-nothing import.

Seed update body:

```json
{
  "participantIds": [12, 15, 18, 20]
}
```

Start rules:

- status must be `registration_closed`;
- required fields complete;
- participant count within format limits;
- no duplicate seeds;
- no gaps in active participant seed order;
- creates final rounds/matches from current preview;
- locks format, scoring model, tiebreaker order, seeds and bracket/schedule rules.

## 14. Public views

### 14.1 Tournament list

Add nav item:

```text
Tournaments
```

For signed-out users, root still shows auth screen, but `/#tournaments/:slug` must render public tournament page without requiring sign-in.

List cards:

- name;
- format;
- status;
- start date;
- participant count;
- CTA: View.

Admin sees Create button.

### 14.2 Tournament public page

Sections:

- header: name, status, format, start date, game system;
- rules summary;
- registration action/status;
- participants;
- bracket or schedule;
- standings if applicable;
- match list/results;
- final results if completed/cancelled status note if cancelled.

Anonymous spectator should never see:

- admin preview before start;
- admin actions;
- private draft;
- participant contact fields.

### 14.3 Admin tournament workspace

Admin sections:

- Setup;
- Registration;
- Participants;
- Seeding;
- Preview;
- Rounds and matches;
- Standings;
- Audit/history;
- Danger zone: cancel.

UI must make destructive/irreversible actions confirm explicitly:

- start tournament;
- result correction;
- late placement;
- complete tournament;
- cancel tournament.

## 15. Corrections

Admin may correct a completed match result in any non-cancelled tournament, including completed tournament.

Flow:

1. Admin opens completed match.
2. Admin enters replacement Approved Ops result.
3. API calculates impact preview.
4. If blocked, API returns 409 with reason.
5. If allowed, admin confirms.
6. API saves correction, recalculates affected data, writes audit event.

Blocked when:

- tournament is cancelled;
- match is not completed;
- replacement result invalid for format;
- single elimination correction would change entrant/opponent/pairing of a completed downstream match;
- Swiss correction would alter a completed later-round pairing;
- any reflow would modify completed match history.

Allowed effects:

- recompute standings/final placements;
- reverse/reapply Elo if ranked;
- update linked `games` row;
- reflow not-ready or active future competition only.

## 16. Controlled late placement

Late placement - это сценарий "игрок добавился после старта турнира".

Обычная регистрация уже закрыта, сетка или расписание уже созданы, часть матчей может быть сыграна. Поэтому нельзя просто вставить нового игрока в середину турнира как будто ничего не произошло: это может изменить пары, byes, standings или путь по сетке.

Правило MVP простое:

- сыгранные матчи никогда не переписываются;
- текущий active round никогда не меняется;
- новый игрок может появиться только в следующем еще не стартовавшем раунде;
- completed match не меняет участников, соперников, победителя и связь с будущими completed matches;
- admin сначала видит preview последствий;
- если изменение затрагивает только следующий not-ready round и более поздние раунды, admin может подтвердить placement;
- если изменение потребует переписать сыгранное, система блокирует placement и объясняет причину.

Пример: Swiss-турнир идет 2-й раунд. Новый игрок нажал join. Его нельзя вставить ни в уже сыгранный 1-й раунд, ни в текущий 2-й раунд, даже если часть матчей 2-го раунда еще не завершена. Система ставит его в `pending_placement`, а admin может добавить его только с 3-го раунда, если 3-й раунд еще не стартовал. Если можно, система показывает новые будущие пары и просит подтверждение.

After tournament start, public join/admin add creates `pending_placement`.

Admin placement must be two-step:

```text
preview -> confirm
```

Preview must show:

- entrant;
- proposed next not-ready round;
- affected future rounds;
- affected matches;
- changed byes;
- changed standings if applicable;
- blocked completed history if unsafe.

Hard MVP rule:

- placement is blocked if the target round is active or completed;
- placement is blocked if no next not-ready round exists for the tournament format;
- placement never changes the current active round.

Format-specific MVP guardrails:

### 16.1 Single elimination

Allowed only if entrant can be placed without changing completed downstream competition.

Safe placements:

- replace an unused bye/source slot in the next not-ready round if its downstream path has no completed match conflict;
- fill a not-ready future slot only when the current active round remains unchanged.

Blocked:

- resizing bracket after any affected completed match;
- changing the current active round;
- replacing eliminated participant;
- changing participant/opponent of completed match;
- changing source of completed downstream match.

### 16.2 Swiss

Allowed only from the next not-ready Swiss round:

- if current round is active, entrant remains pending until the next Swiss round is generated;
- if next round exists as not-ready, regenerate that round and future only;
- completed rounds and active completed matches stay unchanged;
- pairing preview must show any changed opponent/bye.

If no next not-ready round exists, participant remains `pending_placement` until admin cancels placement or tournament reaches the next round-generation point.

## 17. Validation and concurrency

Every mutating tournament action must:

- lock the tournament row `FOR UPDATE`;
- lock affected participant/match rows in deterministic order;
- run in a transaction;
- validate current status after lock;
- write audit event in the same transaction.

Concurrency expectations:

- two simultaneous result submissions for same match: one succeeds, one gets 409;
- starting same round twice: one succeeds, one gets idempotent 409 or current state response;
- participant joins while admin starts tournament: one transaction wins; loser receives state-specific error and can retry;
- admin correction while participant submits result: correction requires completed match, so active submission wins or correction gets 409.

Use advisory locks only when row locks are insufficient, for example seed shuffle/start race over participant set.

## 18. Serialization

Add public view helpers to `src/api/views.js`.

Public tournament view should not include:

- user contact fields;
- password/session fields;
- internal audit before/after payloads;
- admin-only preview before start.

Suggested top-level shape:

```json
{
  "tournament": {
    "id": 1,
    "slug": "summer-kill-team-open",
    "name": "Summer Kill Team Open",
    "status": "in_progress",
    "format": "swiss",
    "startsAt": "...",
    "rulesSummary": "...",
    "registration": {
      "canJoin": false,
      "message": "Registration is closed"
    },
    "viewer": {
      "role": "participant",
      "participantId": 10,
      "canSubmitMatchIds": [55],
      "canAdmin": false
    }
  },
  "participants": [],
  "rounds": [],
  "standings": [],
  "finalResults": null
}
```

Admin view can include:

- draft validation problems;
- private preview;
- withdrawn/removed participants;
- pending placement queue;
- audit events.

## 19. Testing requirements

### 19.1 Unit tests

Add tests for:

- slug generation and uniqueness fallback;
- participant name normalization and duplicate detection;
- seed slot order for single elimination;
- single elimination bracket generation with byes;
- Swiss round 1 pairing;
- Swiss bye assignment;
- Swiss no-rematch pairing and fallback;
- standings points and ranks;
- Buchholz excluding byes;
- head-to-head only for two-way tie;
- total VP sums Approved Ops totals and excludes byes;
- VP Diff sums own total minus opponent total and excludes byes;
- result outcome derivation from Approved Ops result;
- correction blocked when completed downstream match would change;
- late placement preview allowed only for next not-ready round and blocked for current active round.

### 19.2 Integration tests

Use existing `node:test` and PostgreSQL test helpers.

Cover:

1. Admin creates draft, publish validation blocks incomplete draft.
2. Publish public tournament, anonymous spectator can fetch public view.
3. Participant joins registration open tournament.
4. Participant withdraws before start and is excluded.
5. Admin manual add and bulk add.
6. Seed reorder and shuffle regenerate preview.
7. Single elimination start creates bracket and byes.
8. Participant submits single elimination result; match completes; winner advances.
9. Swiss configured rounds, next round generation after prior complete.
10. Admin starts next round.
11. Admin result submission for any active match.
12. Ranked tournament updates Elo and linked `games` row.
13. Unranked tournament does not update Elo.
14. Default challenge progress policy `count` includes tournament matches in All Kill Team Challenge.
15. Challenge progress policy `none` excludes tournament matches.
16. Completed correction updates standings/Elo and blocks unsafe downstream changes.
17. Late placement preview and confirmation for next not-ready round.
18. Cancellation blocks all write actions.
19. Completed tournament blocks setup edits but allows faction metadata and constrained correction.
20. Authorization matrix: anonymous/user/admin for every route.
21. Race: concurrent result submissions only complete once.

### 19.3 Manual smoke tests

After implementation:

```powershell
docker compose up -d postgres
npm test
npm start
```

Smoke flow:

- create admin;
- create 4-player single elimination tournament;
- publish, join with users, close registration, start;
- submit semifinal/final results;
- verify leaderboard/Elo/history;
- open public tournament page in signed-out browser;
- create Swiss tournament and verify next round generation.

## 20. Rollout slices

Keep each slice deployable.

### Slice 1: Data and read-only shell

- migration 003;
- repositories and row mappers;
- tournament list/detail public GET;
- admin create/edit draft;
- basic frontend nav/list/detail.

### Slice 2: Registration and preview

- publish;
- join/withdraw;
- admin manual/bulk participant management;
- seeding;
- single elimination preview;
- Swiss round 1 preview.

### Slice 3: Start and single elimination vertical

- close registration;
- start tournament;
- active round 1;
- result submit;
- bracket advancement;
- Elo/game integration;
- public bracket.

### Slice 4: Swiss

- Swiss full pairing generation;
- start later rounds;
- standings visibility and tiebreaker visibility when enabled.

### Slice 5: Admin recovery tools

- completed result correction;
- late placement;
- audit view;
- complete/cancel.

### Slice 6: Hardening

- full integration tests;
- concurrency tests;
- frontend responsive QA;
- README/CHANGELOG update.

## 21. Acceptance criteria

1. Admin can create an incomplete private draft.
2. Admin cannot publish/start until required fields and format setup are valid.
3. Published tournament is visible to anonymous spectators.
4. Registration open accepts signed-in participant join.
5. Registration closed blocks join with clear message.
6. In-progress join creates pending placement, not active participant.
7. Participant can withdraw before start.
8. Admin can add, bulk-add, edit and remove participants before start.
9. Admin can edit participant faction/faction rules in every non-cancelled state.
10. Seed reorder/shuffle regenerates admin preview before start.
11. Starting tournament locks format, scoring, tiebreaker configuration, seeds and rules.
12. Single elimination supports 2-128 active participants and byes.
13. Swiss supports 4-128 active participants and configured round count.
14. Admin starts every later round manually.
15. Active assigned participant can submit valid Approved Ops result.
16. Single elimination rejects draw/no winner.
17. Swiss accepts draw.
18. Completed match immediately updates bracket/schedule/standings.
19. Ranked completed match updates Elo exactly once.
20. Tournament-sourced game history cannot be edited through ordinary admin game route.
21. Standings show wins, draws, losses, match points and configured tiebreaker values when tiebreakers are enabled.
22. Buchholz excludes byes.
23. Head-to-head applies only to two-way tie with played non-draw match.
24. Total VP sums a participant's Approved Ops totals from completed non-bye matches.
25. VP Diff sums a participant's Approved Ops total minus opponent Approved Ops total from completed non-bye matches.
26. Admin completed result correction requires preview and confirmation.
27. Unsafe correction that changes completed downstream competition is blocked.
28. Safe correction recalculates standings, placements, Elo, Total VP and VP Diff.
29. Late placement requires preview and confirmation.
30. Late placement starts only from the next not-ready round and never changes current active round or completed match history.
31. Cancelled tournament is read-only.
32. Completed tournament blocks competitive setup edits.
33. Completed tournament still allows faction metadata edits and constrained correction.
34. Anonymous spectator never sees contact fields or admin-only draft/preview.
35. All write routes enforce auth and admin/participant permissions.
36. All tournament mutations write audit events.

## 22. Open questions

1. Confirm whether tournament discovery page should be public for anonymous users, or whether anonymous access is only through direct `/#tournaments/:slug` links.
2. Confirm whether cancelled published tournaments should remain listed or only accessible by direct link.
3. Confirm whether admin-added unregistered participant can be claimed by a later registered user, and how claim is verified.
4. Confirm whether `owner_user_id` has any MVP permission effect while global admins can administer every tournament.
5. Confirm final placement convention for single elimination semifinal losers.

## 23. Implementation constraints

- Do not add Express/Fastify/ORM unless separately approved.
- Keep CommonJS.
- Keep PostgreSQL as required runtime store.
- Use existing router route table.
- Use existing migration runner.
- Use focused domain modules for tournament algorithms.
- Keep ordinary challenge game behavior backward compatible.
- Do not mutate `.env` in committed changes.
- Do not expose user contacts on public tournament pages.
- Public page updates are refresh-based; no SSE/WebSockets/polling required in MVP.
