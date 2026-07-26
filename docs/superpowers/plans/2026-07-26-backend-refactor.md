# Backend Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разобрать монолитный `server.js` (2021 строка) на модули с одной ответственностью, заменить чтение-и-перезапись всей БД на транзакционные SQL-репозитории и закрыть найденные при ревью дефекты целостности, безопасности и корректности.

**Architecture:** Зависимости идут в одну сторону: `api → domain → db`. HTTP-слой (роутер с таблицей маршрутов) сам разбирает путь, применяет гард авторизации, при `tx: true` открывает транзакцию и передаёт `client` в обработчик. Обработчик — чистая функция `async (ctx) => body`, не знающая про `req`/`res` и не пишущая SQL. Доменные модули не знают ни про HTTP, ни про БД.

**Tech Stack:** Node.js 22.13 (встроенные `node:test` и `process.loadEnvFile`), PostgreSQL 16, `pg` 8.22. Новых зависимостей не добавляется.

**Спека:** `docs/superpowers/specs/2026-07-26-backend-refactor-design.md`

## Global Constraints

- **Node.js >= 22.** Используются `node:test`, `process.loadEnvFile`, глобальный `fetch`.
- **Единственная runtime-зависимость — `pg`.** Не добавлять express, fastify, dotenv, ORM, тест-раннеры и библиотеки rate limit.
- **CommonJS.** Проект использует `require`/`module.exports`; не переводить на ESM.
- **Только PostgreSQL.** JSON-хранилище удаляется; без `DATABASE_URL` сервер не стартует.
- **Целевой размер модуля — не более 200 строк.** Единственное задокументированное исключение — `src/db/repositories/users.js` (~220 строк): это плоский список однотипных запросов без ветвящейся логики, дробить его на части вреднее, чем оставить одним модулем.
- **Никакого дословного дублирования.** Перевод строк PostgreSQL в доменные объекты живёт только в `src/db/rows.js`; набор активных статусов игры объявлен только в `src/db/repositories/games.js`.
- **Публичный контракт API не меняется,** кроме явно перечисленных в задачах 14, 17 и 19 изменений (B1, D1, D2, D4, D5, D3).
- **`public/app.js` не трогать.**
- **Все тексты ошибок для клиента — на английском,** как в текущем коде.
- **Каждая задача завершается зелёными тестами и коммитом.**

## Порядок и связность

Задачи 1–5 создают инфраструктуру и HTTP-каркас, 6–9 — домен, 10–12 — слой данных и представления, 13–17 — переписанные маршруты, 18–21 — переключение, миграция данных и финальные фиксы. Приложение остаётся работоспособным после каждой задачи: до задачи 18 старый `handleApi` продолжает обслуживать все маршруты.

## File Structure

**Создаются:**

| Файл | Ответственность |
|---|---|
| `src/config.js` | Загрузка `.env`, все константы и лимиты |
| `src/db/pool.js` | Пул соединений, `withClient`, `withTransaction` |
| `src/db/migrate.js` | Таблица `schema_migrations`, применение миграций по порядку |
| `src/db/migrations/001_baseline.js` | Текущая схема, идемпотентно |
| `src/db/migrations/002_kill_team_names.js` | Канонизация названий в сохранённых данных |
| `src/db/rows.js` | Перевод строк PostgreSQL в доменные объекты, общий для всех репозиториев |
| `src/db/repositories/users.js` | Запросы к `users` |
| `src/db/repositories/sessions.js` | Запросы к `sessions` |
| `src/db/repositories/challenges.js` | Запросы к `challenges` |
| `src/db/repositories/games.js` | Запросы к `games` |
| `src/db/repositories/feedback.js` | Запросы к `feedback` |
| `src/domain/kill-teams.js` | Канонический реестр, треки, wildcards, алиасы, нормализация |
| `src/domain/scoring.js` | Approved Ops, killzone, crit op, тайбрейкеры |
| `src/domain/elo.js` | Расчёт Elo |
| `src/domain/challenge-progress.js` | Прогресс challenge-треков |
| `src/domain/passwords.js` | Асинхронный scrypt |
| `src/domain/validation.js` | Валидация ввода |
| `src/http/io.js` | `HttpError`, чтение тела, cookies, ответы, security-заголовки |
| `src/http/router.js` | Таблица маршрутов, гарды, транзакции, обработка ошибок |
| `src/http/static.js` | Отдача статики |
| `src/http/logger.js` | Логи запросов и ошибок |
| `src/http/rate-limit.js` | Ограничение попыток по IP |
| `src/api/routes.js` | Таблица маршрутов |
| `src/api/views.js` | Сериализация публичных представлений |
| `src/api/auth.js` | `register`, `setup-admin`, `login`, `logout`, `me` |
| `src/api/users.js` | Список, поиск, профиль |
| `src/api/challenges.js` | Челленджи и share-ссылки |
| `src/api/games.js` | Результаты игр |
| `src/api/feedback.js` | Обратная связь |
| `src/api/admin.js` | Административные маршруты |
| `scripts/import-json-db.js` | Разовый импорт legacy `data/db.json` |
| `test/helpers/*.js` | Тестовое окружение: БД, HTTP-клиент |
| `test/unit/*.test.js` | Юнит-тесты домена |
| `test/integration/*.test.js` | Интеграционные тесты |

**Изменяются:**

| Файл | Изменение |
|---|---|
| `server.js` | Сжимается до bootstrap (~45 строк) |
| `package.json` | Скрипты `test`, `test:unit`, `test:integration`, поле `engines` |
| `docker-compose.yml` | Публикуемый порт становится настраиваемым |
| `.env.example` | Новые переменные |
| `README.md`, `CHANGELOG.md` | Актуализация |

**Удаляются:** `netlify/` (нетронутый мусор от прежнего состояния, не под контролем git).

---

### Task 1: Тестовое окружение и характеризационные тесты текущего API

Первая задача не меняет поведение. Она создаёт сеть безопасности: тесты, которые описывают текущий контракт HTTP и должны оставаться зелёными весь рефакторинг.

**Почему характеризационные, а не юниты:** `server.js` экспортирует только `{ ensureDb, handleApi }`. Ни `calculateElo`, ни валидаторы наружу не видны, поэтому единственная честная точка опоры сейчас — HTTP-граница. Эти тесты переживут все последующие задачи без правок.

**Files:**
- Create: `test/helpers/db.js`
- Create: `test/helpers/client.js`
- Create: `test/integration/characterization.test.js`
- Modify: `package.json`
- Modify: `docker-compose.yml:12-13`
- Create: `.env`  (не под git)
- Modify: `.env.example`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `test/helpers/db.js` → `{ TEST_DATABASE_URL, resetDatabase(), closeTestPool() }`
  - `test/helpers/client.js` → `createClient(baseUrl)` → объект с `get(path)`, `post(path, body)`, `patch(path, body)`, `del(path)`, каждый возвращает `{ status, body }`; хранит cookie между вызовами.
  - `startApiServer()` из `test/helpers/client.js` → `{ baseUrl, close() }`

- [ ] **Step 1: Установить зависимости**

Node-модули в репозитории не установлены.

```bash
npm install
```

Ожидаемо: создан `node_modules/`, `pg` версии 8.22.x.

- [ ] **Step 2: Сделать публикуемый порт Postgres настраиваемым**

На машине разработчика порт 5432 уже занят хостовым Postgres, поэтому `docker compose up -d` падает с ошибкой привязки. Значение по умолчанию не меняем, чтобы не сломать существующие установки.

В `docker-compose.yml` заменить строку 13:

```yaml
    ports:
      - "${DB_PORT:-5432}:5432"
```

- [ ] **Step 3: Создать локальный `.env`**

Файл в `.gitignore`, в репозиторий не попадает.

```env
DB_PASSWORD=tgtv_dev_password
DB_PORT=5433
DATABASE_URL=postgres://tgtv:tgtv_dev_password@localhost:5433/tgtv_tournament
TEST_DATABASE_URL=postgres://tgtv:tgtv_dev_password@localhost:5433/tgtv_tournament_test
PORT=3000
```

И дописать в `.env.example`:

```env
# Порт, на котором docker-compose публикует Postgres на хосте.
# Поменяйте, если 5432 уже занят.
DB_PORT=5432

# Пароль Postgres, используется docker-compose.
DB_PASSWORD=

# База для интеграционных тестов. Создаётся вручную:
#   docker compose exec postgres createdb -U tgtv tgtv_tournament_test
TEST_DATABASE_URL=
```

- [ ] **Step 4: Поднять базу и создать тестовую БД**

```bash
docker compose up -d && sleep 5 && docker compose exec -T postgres createdb -U tgtv tgtv_tournament_test
```

Ожидаемо: контейнер `tgtv-tournament-postgres` в состоянии running, команда завершается без ошибок.

Проверить:

```bash
docker compose exec -T postgres psql -U tgtv -d tgtv_tournament_test -c "SELECT 1"
```

Ожидаемо: `1 row`.

- [ ] **Step 5: Добавить тестовые скрипты в `package.json`**

```json
{
  "name": "tgtv-ranking-tournament-system",
  "version": "1.0.0",
  "private": true,
  "description": "TGTV ranking, matchmaking, Approved Ops, and Kill Team challenge tracker.",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "start": "node server.js",
    "test": "node --test --test-concurrency=1 test/unit/ test/integration/",
    "test:unit": "node --test test/unit/",
    "test:integration": "node --test --test-concurrency=1 test/integration/"
  },
  "dependencies": {
    "pg": "^8.22.0"
  }
}
```

`--test-concurrency=1` обязателен для интеграционных тестов: они делят одну базу и чистят её между кейсами.

- [ ] **Step 6: Написать помощник для базы**

Create `test/helpers/db.js`:

```js
const { Pool } = require("pg");

process.loadEnvFile?.(require("node:path").join(__dirname, "..", "..", ".env"));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set. See .env.example.");
}

let pool = null;

function testPool() {
  if (!pool) pool = new Pool({ connectionString: TEST_DATABASE_URL });
  return pool;
}

const TABLES = ["sessions", "feedback", "games", "challenges", "users"];

async function resetDatabase() {
  const client = await testPool().connect();
  try {
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const existing = new Set(rows.map((row) => row.tablename));
    const present = TABLES.filter((table) => existing.has(table));
    if (present.length) {
      await client.query(`TRUNCATE ${present.join(", ")} RESTART IDENTITY CASCADE`);
    }
  } finally {
    client.release();
  }
}

async function closeTestPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { TEST_DATABASE_URL, testPool, resetDatabase, closeTestPool };
```

- [ ] **Step 7: Написать HTTP-помощник**

Create `test/helpers/client.js`:

```js
const http = require("node:http");

async function startApiServer(handleApi) {
  const server = http.createServer((req, res) => {
    handleApi(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function createClient(baseUrl) {
  let cookie = "";

  async function request(method, path, body) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    for (const entry of setCookie) {
      const pair = entry.split(";")[0];
      if (pair.startsWith("sid=")) cookie = pair;
    }
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body ?? {}),
    patch: (path, body) => request("PATCH", path, body ?? {}),
    del: (path) => request("DELETE", path),
    clearCookie: () => {
      cookie = "";
    }
  };
}

module.exports = { startApiServer, createClient };
```

- [ ] **Step 8: Написать характеризационный тест**

Ключевая деталь: `server.js` читает `DATABASE_URL` в константу на уровне модуля, поэтому переменную окружения надо подменить **до** `require("../../server")`.

Create `test/integration/characterization.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { TEST_DATABASE_URL, resetDatabase, closeTestPool } = require("../helpers/db");

process.env.DATABASE_URL = TEST_DATABASE_URL;

const { ensureDb, handleApi } = require("../../server");
const { startApiServer, createClient } = require("../helpers/client");

let server;

test.before(async () => {
  await ensureDb();
  server = await startApiServer(handleApi);
});

test.after(async () => {
  await server.close();
  await closeTestPool();
});

test.beforeEach(async () => {
  await resetDatabase();
});

function registration(name, overrides = {}) {
  return {
    name,
    password: "password123",
    confirmPassword: "password123",
    telegramContact: `@${name.toLowerCase()}`,
    registerNickname: name,
    ...overrides
  };
}

function approvedOps(faction, { crit, kill, tac, primary }) {
  return { crit, kill, tac, primary, faction, tacOp: "" };
}

test("первый зарегистрированный становится администратором", async () => {
  const client = createClient(server.baseUrl);
  const res = await client.post("/api/register", registration("Alpha"));

  assert.equal(res.status, 201);
  assert.equal(res.body.user.name, "Alpha");
  assert.equal(res.body.user.isAdmin, true);
  assert.equal(res.body.user.rating, 1000);
  assert.equal(res.body.hasAdmin, true);
});

test("второй зарегистрированный администратором не становится", async () => {
  const first = createClient(server.baseUrl);
  await first.post("/api/register", registration("Alpha"));

  const second = createClient(server.baseUrl);
  const res = await second.post("/api/register", registration("Bravo"));

  assert.equal(res.status, 201);
  assert.equal(res.body.user.isAdmin, false);
});

test("повторное имя отклоняется с 409", async () => {
  const client = createClient(server.baseUrl);
  await client.post("/api/register", registration("Alpha"));

  const other = createClient(server.baseUrl);
  const res = await other.post("/api/register", registration("alpha"));

  assert.equal(res.status, 409);
});

test("вход по неверному паролю отдаёт 401", async () => {
  const client = createClient(server.baseUrl);
  await client.post("/api/register", registration("Alpha"));
  client.clearCookie();

  const res = await client.post("/api/login", { name: "Alpha", password: "wrong" });
  assert.equal(res.status, 401);
});

test("защищённый маршрут без сессии отдаёт 401", async () => {
  const client = createClient(server.baseUrl);
  const res = await client.get("/api/games");
  assert.equal(res.status, 401);
});

test("сквозной сценарий: челлендж, результат, подтверждение, Elo", async () => {
  const alpha = createClient(server.baseUrl);
  const bravo = createClient(server.baseUrl);

  const alphaRes = await alpha.post("/api/register", registration("Alpha"));
  const bravoRes = await bravo.post("/api/register", registration("Bravo"));
  const alphaId = alphaRes.body.user.id;
  const bravoId = bravoRes.body.user.id;

  const challenge = await alpha.post("/api/challenges", { toUserId: bravoId });
  assert.equal(challenge.status, 201);
  assert.equal(challenge.body.challenge.status, "pending");

  const accepted = await bravo.post(`/api/challenges/${challenge.body.challenge.id}/accept`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.challenge.status, "accepted");

  const gameId = accepted.body.challenge.gameId;
  assert.ok(gameId);

  const submitted = await alpha.post(`/api/games/${gameId}/result`, {
    scores: {
      [alphaId]: approvedOps("Kasrkin", { crit: 6, kill: 4, tac: 5, primary: "crit" }),
      [bravoId]: approvedOps("Legionaries", { crit: 2, kill: 3, tac: 1, primary: "kill" })
    }
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.game.status, "pending_confirmation");

  const confirmed = await bravo.post(`/api/games/${gameId}/confirm-result`);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.game.status, "completed");
  assert.equal(confirmed.body.game.result.winnerId, alphaId);

  // Alpha: 6 + 4 + 5 + ceil(6/2) = 18. Bravo: 2 + 3 + 1 + ceil(3/2) = 8.
  assert.equal(confirmed.body.game.result.scores[alphaId].total, 18);
  assert.equal(confirmed.body.game.result.scores[bravoId].total, 8);

  // При равных рейтингах ожидание 0.5, дельта = round(32 * 0.5) = 16.
  assert.equal(confirmed.body.game.elo[alphaId].delta, 16);
  assert.equal(confirmed.body.game.elo[bravoId].delta, -16);

  const leaderboard = await alpha.get("/api/users");
  const alphaRow = leaderboard.body.users.find((user) => user.id === alphaId);
  const bravoRow = leaderboard.body.users.find((user) => user.id === bravoId);
  assert.equal(alphaRow.rating, 1016);
  assert.equal(bravoRow.rating, 984);
});

test("отправитель результата не может подтвердить его сам", async () => {
  const alpha = createClient(server.baseUrl);
  const bravo = createClient(server.baseUrl);
  const alphaId = (await alpha.post("/api/register", registration("Alpha"))).body.user.id;
  const bravoId = (await bravo.post("/api/register", registration("Bravo"))).body.user.id;

  const challenge = await alpha.post("/api/challenges", { toUserId: bravoId });
  const accepted = await bravo.post(`/api/challenges/${challenge.body.challenge.id}/accept`);
  const gameId = accepted.body.challenge.gameId;

  await alpha.post(`/api/games/${gameId}/result`, {
    scores: {
      [alphaId]: approvedOps("Kasrkin", { crit: 3, kill: 3, tac: 3, primary: "crit" }),
      [bravoId]: approvedOps("Legionaries", { crit: 1, kill: 1, tac: 1, primary: "kill" })
    }
  });

  const res = await alpha.post(`/api/games/${gameId}/confirm-result`);
  assert.equal(res.status, 403);
});

test("недопустимый Kill Team отклоняется", async () => {
  const alpha = createClient(server.baseUrl);
  const bravo = createClient(server.baseUrl);
  const alphaId = (await alpha.post("/api/register", registration("Alpha"))).body.user.id;
  const bravoId = (await bravo.post("/api/register", registration("Bravo"))).body.user.id;

  const challenge = await alpha.post("/api/challenges", { toUserId: bravoId });
  const accepted = await bravo.post(`/api/challenges/${challenge.body.challenge.id}/accept`);
  const gameId = accepted.body.challenge.gameId;

  const res = await alpha.post(`/api/games/${gameId}/result`, {
    scores: {
      [alphaId]: approvedOps("Not A Real Team", { crit: 3, kill: 3, tac: 3, primary: "crit" }),
      [bravoId]: approvedOps("Legionaries", { crit: 1, kill: 1, tac: 1, primary: "kill" })
    }
  });
  assert.equal(res.status, 400);
});

test("неизвестный маршрут отдаёт 404", async () => {
  const client = createClient(server.baseUrl);
  const res = await client.get("/api/nope");
  assert.equal(res.status, 404);
});
```

- [ ] **Step 9: Запустить тесты и убедиться, что они зелёные**

```bash
npm run test:integration
```

Ожидаемо: `pass 9`, `fail 0`. Эти тесты описывают **текущее** поведение и должны оставаться зелёными до задачи 14 включительно; изменения контракта в задачах 14, 17 и 19 обновят конкретные проверки, и это будет указано явно.

Если тест «первый зарегистрированный становится администратором» падает с ошибкой соединения — проверьте, что контейнер поднят и `TEST_DATABASE_URL` указывает на `tgtv_tournament_test`, а не на рабочую базу.

- [ ] **Step 10: Убрать нетронутый мусор**

Каталог `netlify/` остался от версии до v0.5, под git не находится.

```bash
rm -rf netlify
```

- [ ] **Step 11: Commit**

```bash
git add package.json docker-compose.yml .env.example test/
git commit -m "test: add characterization tests for the current API contract"
```

---

### Task 2: Конфигурация и запрет на запуск без Postgres

**Files:**
- Create: `src/config.js`
- Test: `test/unit/config.test.js`

**Interfaces:**
- Consumes: ничего.
- Produces: `src/config.js` экспортирует
  `{ ROOT, PUBLIC_DIR, PORT, HOST, DATABASE_URL, PGSSL, COOKIE_SECURE, SESSION_TTL_MS, INITIAL_RATING, MAX_REQUEST_BYTES, MAX_AVATAR_DATA_URL_LENGTH, LOGIN_RATE_LIMIT, requireDatabaseUrl() }`.
  `LOGIN_RATE_LIMIT` — `{ windowMs: 900000, max: 10 }`.

- [ ] **Step 1: Написать падающий тест**

Create `test/unit/config.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../../src/config");

test("конфигурация отдаёт значения по умолчанию", () => {
  assert.equal(config.PORT, Number(process.env.PORT) || 3000);
  assert.equal(config.SESSION_TTL_MS, 1000 * 60 * 60 * 24 * 14);
  assert.equal(config.INITIAL_RATING, 1000);
  assert.equal(config.MAX_REQUEST_BYTES, 2 * 1024 * 1024);
  assert.equal(config.MAX_AVATAR_DATA_URL_LENGTH, 1024 * 1024);
  assert.equal(config.LOGIN_RATE_LIMIT.max, 10);
});

test("requireDatabaseUrl бросает понятную ошибку при пустом значении", () => {
  assert.throws(
    () => config.requireDatabaseUrl(""),
    /DATABASE_URL is required/
  );
});

test("requireDatabaseUrl возвращает строку подключения", () => {
  const url = "postgres://user:pass@localhost:5432/db";
  assert.equal(config.requireDatabaseUrl(url), url);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/unit/config.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/config'`.

- [ ] **Step 3: Написать реализацию**

Самописный парсер `.env` из `server.js:238-253` заменяется на встроенный `process.loadEnvFile`, доступный с Node 21.7.

Create `src/config.js`:

```js
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const ENV_PATH = path.join(ROOT, ".env");
if (fs.existsSync(ENV_PATH)) {
  process.loadEnvFile(ENV_PATH);
}

function positiveIntegerEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 65535 ? number : fallback;
}

function booleanEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes"].includes(String(value).toLowerCase());
}

function requireDatabaseUrl(value = process.env.DATABASE_URL) {
  if (!value) {
    throw new Error(
      "DATABASE_URL is required. Start PostgreSQL with `docker compose up -d` " +
        "and set DATABASE_URL in .env. The JSON storage fallback has been removed."
    );
  }
  return value;
}

module.exports = {
  ROOT,
  PUBLIC_DIR,
  PORT: positiveIntegerEnv("PORT", 3000),
  HOST: process.env.HOST || "127.0.0.1",
  DATABASE_URL: process.env.DATABASE_URL || "",
  PGSSL: booleanEnv("PGSSL", false) || booleanEnv("DATABASE_SSL", false),
  COOKIE_SECURE: booleanEnv("COOKIE_SECURE", process.env.NODE_ENV === "production"),
  SESSION_TTL_MS: 1000 * 60 * 60 * 24 * 14,
  INITIAL_RATING: 1000,
  MAX_REQUEST_BYTES: 2 * 1024 * 1024,
  MAX_AVATAR_DATA_URL_LENGTH: 1024 * 1024,
  LOGIN_RATE_LIMIT: { windowMs: 15 * 60 * 1000, max: 10 },
  requireDatabaseUrl
};
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/unit/config.test.js
```

Ожидаемо: `pass 3`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/unit/config.test.js
git commit -m "feat: add config module with Postgres-only guard"
```

---

### Task 3: HTTP-примитивы — ошибки, чтение тела, cookies, ответы, security-заголовки

Закрывает B5 (security-заголовки), C1 (честные коды ошибок) и C3 (двойная запись ответа).

**Files:**
- Create: `src/http/io.js`
- Test: `test/unit/http-io.test.js`

**Interfaces:**
- Consumes: `src/config.js` → `MAX_REQUEST_BYTES`.
- Produces: `src/http/io.js` экспортирует
  `{ HttpError, ValidationError, SECURITY_HEADERS, readBody(req, maxBytes), parseCookies(req), sendJson(res, status, body, headers), sendText(res, status, text, headers), sessionCookie(token, ttlMs, secure), clearedSessionCookie(secure) }`.
  `HttpError` имеет поля `status` и `message`; `ValidationError` наследует `HttpError` со `status = 400`.

- [ ] **Step 1: Написать падающий тест**

Create `test/unit/http-io.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const {
  HttpError,
  ValidationError,
  SECURITY_HEADERS,
  readBody,
  parseCookies,
  sendJson,
  sessionCookie,
  clearedSessionCookie
} = require("../../src/http/io");

function fakeResponse() {
  return {
    statusCode: null,
    headers: null,
    payload: "",
    headersSent: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(chunk = "") {
      this.payload += chunk;
    }
  };
}

function fakeRequest(body, headers = {}) {
  const stream = Readable.from(body ? [Buffer.from(body)] : []);
  stream.headers = headers;
  stream.destroy = () => {};
  return stream;
}

test("HttpError несёт статус", () => {
  const err = new HttpError(409, "Conflict happened");
  assert.equal(err.status, 409);
  assert.equal(err.message, "Conflict happened");
  assert.ok(err instanceof Error);
});

test("ValidationError — это HttpError со статусом 400", () => {
  const err = new ValidationError("Bad input");
  assert.equal(err.status, 400);
  assert.ok(err instanceof HttpError);
});

test("readBody разбирает JSON", async () => {
  const body = await readBody(fakeRequest('{"a":1}'), 1000);
  assert.deepEqual(body, { a: 1 });
});

test("readBody на пустом теле возвращает пустой объект", async () => {
  assert.deepEqual(await readBody(fakeRequest(""), 1000), {});
});

test("readBody отвергает некорректный JSON как ValidationError", async () => {
  await assert.rejects(() => readBody(fakeRequest("{oops"), 1000), ValidationError);
});

test("readBody отвергает слишком большое тело", async () => {
  await assert.rejects(() => readBody(fakeRequest("x".repeat(50)), 10), HttpError);
});

test("parseCookies разбирает пары", () => {
  const req = { headers: { cookie: "sid=abc123; theme=dark" } };
  assert.deepEqual(parseCookies(req), { sid: "abc123", theme: "dark" });
});

test("parseCookies на пустом заголовке возвращает пустой объект", () => {
  assert.deepEqual(parseCookies({ headers: {} }), {});
});

test("sendJson проставляет security-заголовки и Content-Length", () => {
  const res = fakeResponse();
  sendJson(res, 200, { ok: true });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload, '{"ok":true}');
  assert.equal(res.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(res.headers["Content-Length"], Buffer.byteLength('{"ok":true}'));
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["X-Frame-Options"], "DENY");
  assert.ok(res.headers["Content-Security-Policy"].includes("script-src 'self'"));
});

test("sendJson ничего не пишет, если ответ уже отправлен", () => {
  const res = fakeResponse();
  sendJson(res, 200, { first: true });
  sendJson(res, 500, { second: true });
  assert.equal(res.payload, '{"first":true}');
});

test("sessionCookie ставит Secure только когда попрошено", () => {
  assert.ok(!sessionCookie("t", 1000, false).includes("Secure"));
  assert.ok(sessionCookie("t", 1000, true).includes("Secure"));
  assert.ok(sessionCookie("t", 1000, false).includes("HttpOnly"));
  assert.ok(sessionCookie("t", 1000, false).includes("Max-Age=1"));
});

test("clearedSessionCookie обнуляет срок жизни", () => {
  assert.ok(clearedSessionCookie(false).includes("Max-Age=0"));
});

test("SECURITY_HEADERS разрешает data: только для картинок", () => {
  const csp = SECURITY_HEADERS["Content-Security-Policy"];
  assert.ok(csp.includes("img-src 'self' data:"));
  assert.ok(!csp.includes("script-src 'self' data:"));
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/unit/http-io.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/http/io'`.

- [ ] **Step 3: Написать реализацию**

CSP допускает `'unsafe-inline'` только для стилей: инлайновых скриптов и `on*`-обработчиков в `public/` нет, инлайновых `style=` — два.

Create `src/http/io.js`:

```js
const { MAX_REQUEST_BYTES } = require("../config");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

class ValidationError extends HttpError {
  constructor(message) {
    super(400, message);
    this.name = "ValidationError";
  }
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join("; ")
};

function readBody(req, maxBytes = MAX_REQUEST_BYTES) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new HttpError(413, "Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new ValidationError("Could not parse JSON"));
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const cookie = req.headers.cookie || "";
  return Object.fromEntries(
    cookie
      .split(";")
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return ["", ""];
        return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
      })
      .filter(([key]) => key)
  );
}

function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...SECURITY_HEADERS,
    ...headers
  });
  res.end(payload);
}

function sendText(res, status, text, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...SECURITY_HEADERS,
    ...headers
  });
  res.end(text);
}

function sessionCookie(token, ttlMs, secure) {
  const parts = [
    `sid=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(ttlMs / 1000)}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearedSessionCookie(secure) {
  const parts = ["sid=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

module.exports = {
  HttpError,
  ValidationError,
  SECURITY_HEADERS,
  readBody,
  parseCookies,
  sendJson,
  sendText,
  sessionCookie,
  clearedSessionCookie
};
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/unit/http-io.test.js
```

Ожидаемо: `pass 13`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/http/io.js test/unit/http-io.test.js
git commit -m "feat: add http primitives with security headers and typed errors"
```

---

### Task 4: Логи и отдача статики

Закрывает C2 (логирование) и B4 (обход проверки пути).

**Files:**
- Create: `src/http/logger.js`
- Create: `src/http/static.js`
- Test: `test/unit/static.test.js`

**Interfaces:**
- Consumes: `src/config.js` → `PUBLIC_DIR`; `src/http/io.js` → `SECURITY_HEADERS`, `sendText`.
- Produces:
  - `src/http/logger.js` → `{ logRequest({ method, path, status, durationMs }), logError(message, err) }`
  - `src/http/static.js` → `{ resolveStaticPath(pathname), sendStatic(req, res) }`.
    `resolveStaticPath` возвращает абсолютный путь либо `null`, если путь выходит за пределы `PUBLIC_DIR`.

- [ ] **Step 1: Написать падающий тест**

Проверка `startsWith(PUBLIC_DIR)` без разделителя пропускает соседний каталог с тем же префиксом: `path.join("/app/public", "/../public-secrets")` нормализуется в `/app/public-secrets`, что проходит проверку.

Create `test/unit/static.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { PUBLIC_DIR } = require("../../src/config");
const { resolveStaticPath } = require("../../src/http/static");

test("корень отдаёт index.html", () => {
  assert.equal(resolveStaticPath("/"), path.join(PUBLIC_DIR, "index.html"));
});

test("обычный файл разрешается внутри public", () => {
  assert.equal(resolveStaticPath("/app.js"), path.join(PUBLIC_DIR, "app.js"));
});

test("подкаталог разрешается", () => {
  assert.equal(
    resolveStaticPath("/kill-team-logos/Kasrkin.png"),
    path.join(PUBLIC_DIR, "kill-team-logos", "Kasrkin.png")
  );
});

test("percent-encoded имя декодируется", () => {
  assert.equal(
    resolveStaticPath("/kill-team-logos/Death%20Korps.png"),
    path.join(PUBLIC_DIR, "kill-team-logos", "Death Korps.png")
  );
});

test("выход вверх по дереву отклоняется", () => {
  assert.equal(resolveStaticPath("/../server.js"), null);
});

test("соседний каталог с тем же префиксом отклоняется", () => {
  assert.equal(resolveStaticPath("/../public-secrets/keys.txt"), null);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/unit/static.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/http/static'`.

- [ ] **Step 3: Написать логгер**

Create `src/http/logger.js`:

```js
function line(level, payload) {
  const record = { level, time: new Date().toISOString(), ...payload };
  const text = JSON.stringify(record);
  if (level === "error") {
    console.error(text);
  } else {
    console.log(text);
  }
}

function logRequest({ method, path, status, durationMs }) {
  line("info", { msg: "request", method, path, status, durationMs });
}

function logError(message, err) {
  line("error", {
    msg: message,
    error: err?.message || String(err),
    stack: err?.stack || null
  });
}

module.exports = { logRequest, logError };
```

- [ ] **Step 4: Написать отдачу статики**

Create `src/http/static.js`:

```js
const fs = require("node:fs");
const path = require("node:path");

const { PUBLIC_DIR } = require("../config");
const { SECURITY_HEADERS, sendText } = require("./io");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const PUBLIC_PREFIX = PUBLIC_DIR.endsWith(path.sep) ? PUBLIC_DIR : PUBLIC_DIR + path.sep;

function resolveStaticPath(pathname) {
  let requested;
  try {
    requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_PREFIX)) return null;
  return filePath;
}

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath);
    const cacheControl = ext === ".html" ? "no-store, max-age=0" : "public, max-age=604800";
    if (res.headersSent) return;
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
      ...SECURITY_HEADERS
    });
    res.end(data);
  });
}

module.exports = { resolveStaticPath, sendStatic, MIME };
```

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

```bash
node --test test/unit/static.test.js
```

Ожидаемо: `pass 6`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/http/logger.js src/http/static.js test/unit/static.test.js
git commit -m "feat: add request logging and path-safe static serving"
```

---

### Task 5: Роутер с таблицей маршрутов, гардами и транзакциями

Ядро рефакторинга: заменяет 625-строчную цепочку `if`. Здесь же появляется структурная атомарность — маршрут объявляет `tx: true`, и роутер сам открывает транзакцию.

**Files:**
- Create: `src/http/router.js`
- Test: `test/unit/router.test.js`

**Interfaces:**
- Consumes: `src/http/io.js` → `HttpError`, `readBody`, `sendJson`; `src/http/logger.js`.
- Produces: `src/http/router.js` экспортирует `{ matchRoute(routes, method, pathname), normalizeApiPath(pathname), createRouter(routes, deps) }`.
  - Маршрут: `{ method, path, handler, auth = "none", tx = false }`, где `path` может содержать сегменты `:name`.
  - `matchRoute` возвращает `{ route, params }` либо `null`.
  - `deps`: `{ withClient, withTransaction, loadUser }`.
  - `loadUser(client, req)` → пользователь либо `null`.
  - Контекст обработчика: `{ params, query, body, user, client, req }`.
  - Обработчик возвращает `undefined` (204), тело ответа (200) либо `{ status, body, headers }`.

- [ ] **Step 1: Написать падающий тест**

Create `test/unit/router.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { matchRoute, normalizeApiPath, createRouter } = require("../../src/http/router");
const { HttpError } = require("../../src/http/io");

test("normalizeApiPath срезает завершающий слэш", () => {
  assert.equal(normalizeApiPath("/api/users/"), "/api/users");
  assert.equal(normalizeApiPath("/api/users"), "/api/users");
  assert.equal(normalizeApiPath("/"), "/");
});

test("matchRoute находит статический путь", () => {
  const routes = [{ method: "GET", path: "/api/me", handler: () => {} }];
  const match = matchRoute(routes, "GET", "/api/me");
  assert.ok(match);
  assert.deepEqual(match.params, {});
});

test("matchRoute извлекает параметры", () => {
  const routes = [{ method: "POST", path: "/api/games/:id/result", handler: () => {} }];
  const match = matchRoute(routes, "POST", "/api/games/42/result");
  assert.deepEqual(match.params, { id: "42" });
});

test("matchRoute различает методы", () => {
  const routes = [{ method: "GET", path: "/api/me", handler: () => {} }];
  assert.equal(matchRoute(routes, "PATCH", "/api/me"), null);
});

test("matchRoute не путает разное число сегментов", () => {
  const routes = [{ method: "GET", path: "/api/users/:id", handler: () => {} }];
  assert.equal(matchRoute(routes, "GET", "/api/users/1/extra"), null);
});

test("статический маршрут выигрывает у параметрического", () => {
  const routes = [
    { method: "GET", path: "/api/users/:id", handler: () => "param" },
    { method: "GET", path: "/api/users/search", handler: () => "static" }
  ];
  const match = matchRoute(routes, "GET", "/api/users/search");
  assert.equal(match.route.handler(), "static");
});

async function callRouter(routes, deps, method, path, body) {
  const router = createRouter(routes, deps);
  const server = http.createServer((req, res) => router(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  await new Promise((resolve) => server.close(resolve));
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const noDbDeps = {
  withClient: (fn) => fn(null),
  withTransaction: (fn) => fn(null),
  loadUser: async () => null
};

test("обработчик отдаёт 200 с телом", async () => {
  const routes = [{ method: "GET", path: "/api/ping", handler: async () => ({ pong: true }) }];
  const res = await callRouter(routes, noDbDeps, "GET", "/api/ping");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { pong: true });
});

test("обработчик может задать статус и заголовки", async () => {
  const routes = [
    {
      method: "POST",
      path: "/api/thing",
      handler: async () => ({ status: 201, body: { created: true } })
    }
  ];
  const res = await callRouter(routes, noDbDeps, "POST", "/api/thing", {});
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { created: true });
});

test("параметры и тело доезжают до обработчика", async () => {
  const routes = [
    {
      method: "POST",
      path: "/api/echo/:id",
      handler: async ({ params, body }) => ({ id: params.id, got: body.value })
    }
  ];
  const res = await callRouter(routes, noDbDeps, "POST", "/api/echo/7", { value: "x" });
  assert.deepEqual(res.body, { id: "7", got: "x" });
});

test("HttpError отдаётся заявленным статусом", async () => {
  const routes = [
    {
      method: "GET",
      path: "/api/conflict",
      handler: async () => {
        throw new HttpError(409, "Already handled");
      }
    }
  ];
  const res = await callRouter(routes, noDbDeps, "GET", "/api/conflict");
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "Already handled");
});

test("неожиданная ошибка отдаётся как 500 без деталей", async () => {
  const routes = [
    {
      method: "GET",
      path: "/api/boom",
      handler: async () => {
        throw new TypeError("secret internal detail");
      }
    }
  ];
  const res = await callRouter(routes, noDbDeps, "GET", "/api/boom");
  assert.equal(res.status, 500);
  assert.equal(res.body.error, "Server error");
  assert.ok(!JSON.stringify(res.body).includes("secret internal detail"));
});

test("неизвестный маршрут отдаёт 404", async () => {
  const res = await callRouter([], noDbDeps, "GET", "/api/nothing");
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "Route not found");
});

test("auth: user без сессии отдаёт 401", async () => {
  const routes = [
    { method: "GET", path: "/api/secret", auth: "user", handler: async () => ({ ok: true }) }
  ];
  const res = await callRouter(routes, noDbDeps, "GET", "/api/secret");
  assert.equal(res.status, 401);
});

test("auth: admin для обычного пользователя отдаёт 403", async () => {
  const deps = { ...noDbDeps, loadUser: async () => ({ id: 1, isAdmin: false }) };
  const routes = [
    { method: "GET", path: "/api/admin/thing", auth: "admin", handler: async () => ({ ok: true }) }
  ];
  const res = await callRouter(routes, deps, "GET", "/api/admin/thing");
  assert.equal(res.status, 403);
});

test("tx: true запускает обработчик в транзакции", async () => {
  const calls = [];
  const deps = {
    withClient: (fn) => {
      calls.push("client");
      return fn(null);
    },
    withTransaction: (fn) => {
      calls.push("transaction");
      return fn(null);
    },
    loadUser: async () => null
  };
  const routes = [
    { method: "POST", path: "/api/write", tx: true, handler: async () => ({ ok: true }) },
    { method: "GET", path: "/api/read", handler: async () => ({ ok: true }) }
  ];
  await callRouter(routes, deps, "POST", "/api/write", {});
  await callRouter(routes, deps, "GET", "/api/read");
  assert.deepEqual(calls, ["transaction", "client"]);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/unit/router.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/http/router'`.

- [ ] **Step 3: Написать реализацию**

Маршруты сортируются так, чтобы статические сегменты выигрывали у параметрических: иначе `/api/users/search` перехватывался бы шаблоном `/api/users/:id`.

Create `src/http/router.js`:

```js
const { HttpError, readBody, sendJson } = require("./io");
const { logRequest, logError } = require("./logger");

function normalizeApiPath(pathname) {
  let normalized = pathname || "/";
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function segmentsOf(path) {
  return path.split("/").filter(Boolean);
}

function matchSegments(routeSegments, pathSegments) {
  if (routeSegments.length !== pathSegments.length) return null;
  const params = {};
  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index];
    const pathSegment = pathSegments[index];
    if (routeSegment.startsWith(":")) {
      params[routeSegment.slice(1)] = decodeURIComponent(pathSegment);
      continue;
    }
    if (routeSegment !== pathSegment) return null;
  }
  return params;
}

function dynamicCount(path) {
  return segmentsOf(path).filter((segment) => segment.startsWith(":")).length;
}

function matchRoute(routes, method, pathname) {
  const pathSegments = segmentsOf(pathname);
  const candidates = routes
    .filter((route) => route.method === method)
    .sort((a, b) => dynamicCount(a.path) - dynamicCount(b.path));

  for (const route of candidates) {
    const params = matchSegments(segmentsOf(route.path), pathSegments);
    if (params) return { route, params };
  }
  return null;
}

const METHODS_WITH_BODY = new Set(["POST", "PATCH", "PUT"]);

function createRouter(routes, deps) {
  const { withClient, withTransaction, loadUser } = deps;

  async function runRoute(route, params, req, url) {
    const runner = route.tx ? withTransaction : withClient;
    return runner(async (client) => {
      const auth = route.auth || "none";
      let user = null;

      if (auth !== "none") {
        user = await loadUser(client, req);
        if (!user) throw new HttpError(401, "You need to sign in");
        if (auth === "admin" && !user.isAdmin) {
          throw new HttpError(403, "Administrator rights required");
        }
      } else if (route.loadUser) {
        user = await loadUser(client, req);
      }

      const body = METHODS_WITH_BODY.has(route.method) ? await readBody(req) : {};

      return route.handler({
        params,
        query: url.searchParams,
        body,
        user,
        client,
        req
      });
    });
  }

  return async function router(req, res) {
    const startedAt = Date.now();
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = normalizeApiPath(url.pathname);
    const method = req.method || "GET";
    let status = 500;

    try {
      const match = matchRoute(routes, method, pathname);
      if (!match) {
        status = 404;
        sendJson(res, 404, { error: "Route not found" });
        return;
      }

      const result = await runRoute(match.route, match.params, req, url);

      if (result === undefined) {
        status = 204;
        sendJson(res, 204, {});
        return;
      }
      if (result && typeof result === "object" && "body" in result) {
        status = result.status || 200;
        sendJson(res, status, result.body, result.headers || {});
        return;
      }
      status = 200;
      sendJson(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) {
        status = err.status;
        sendJson(res, err.status, { error: err.message });
      } else {
        status = 500;
        logError(`unhandled error on ${method} ${pathname}`, err);
        sendJson(res, 500, { error: "Server error" });
      }
    } finally {
      logRequest({ method, path: pathname, status, durationMs: Date.now() - startedAt });
    }
  };
}

module.exports = { matchRoute, normalizeApiPath, createRouter };
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/unit/router.test.js
```

Ожидаемо: `pass 16`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/http/router.js test/unit/router.test.js
git commit -m "feat: add route table router with auth guards and transactions"
```

---

### Task 6: Пул соединений и версионированные миграции

Закрывает D7: набор `ALTER TABLE ... IF NOT EXISTS`, исполняемых при каждом старте, заменяется на нумерованные миграции с журналом.

**Files:**
- Create: `src/db/pool.js`
- Create: `src/db/migrate.js`
- Create: `src/db/migrations/001_baseline.js`
- Test: `test/integration/migrate.test.js`

**Interfaces:**
- Consumes: `src/config.js` → `DATABASE_URL`, `PGSSL`, `requireDatabaseUrl`.
- Produces:
  - `src/db/pool.js` → `{ getPool(connectionString), closePool(), withClient(fn), withTransaction(fn) }`
  - `src/db/migrate.js` → `{ migrate(pool), MIGRATIONS }`; `migrate` возвращает массив применённых версий.
  - Каждая миграция — модуль `{ version: number, name: string, up(client) }`.

- [ ] **Step 1: Написать падающий тест**

Create `test/integration/migrate.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");

const { migrate, MIGRATIONS } = require("../../src/db/migrate");

let pool;

test.before(() => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
});

test("версии миграций уникальны и идут по возрастанию", () => {
  const versions = MIGRATIONS.map((item) => item.version);
  assert.deepEqual(versions, [...new Set(versions)], "версии должны быть уникальны");
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b), "версии должны возрастать");
});

test("migrate на пустой базе создаёт схему", async () => {
  const applied = await migrate(pool);
  assert.ok(applied.includes(1));

  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  const tables = rows.map((row) => row.tablename);
  for (const table of ["challenges", "feedback", "games", "schema_migrations", "sessions", "users"]) {
    assert.ok(tables.includes(table), `ожидалась таблица ${table}`);
  }
});

test("повторный migrate ничего не применяет", async () => {
  await migrate(pool);
  const applied = await migrate(pool);
  assert.deepEqual(applied, []);
});

test("migrate на живой базе не ломает данные", async () => {
  await migrate(pool);
  await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin)
     VALUES ('Alpha', 'alpha', 'salt:hash', 1000, true)`
  );

  await pool.query("DELETE FROM schema_migrations");
  const applied = await migrate(pool);
  assert.ok(applied.includes(1));

  const { rows } = await pool.query("SELECT name FROM users");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Alpha");
});

test("схема users содержит ожидаемые колонки", async () => {
  await migrate(pool);
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'users' ORDER BY column_name`
  );
  const columns = rows.map((row) => row.column_name);
  for (const column of [
    "avatar_data",
    "challenge_credits",
    "created_at",
    "id",
    "is_admin",
    "name",
    "name_key",
    "password_hash",
    "rating",
    "register_nickname",
    "telegram_contact",
    "updated_at"
  ]) {
    assert.ok(columns.includes(column), `ожидалась колонка users.${column}`);
  }
});

test("уникальный индекс share_token существует", async () => {
  await migrate(pool);
  const { rows } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'challenges'`
  );
  assert.ok(rows.some((row) => row.indexname === "idx_challenges_share_token"));
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/integration/migrate.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/db/migrate'`.

- [ ] **Step 3: Написать пул**

Create `src/db/pool.js`:

```js
const { Pool } = require("pg");

const { DATABASE_URL, PGSSL, requireDatabaseUrl } = require("../config");

let pool = null;

function getPool(connectionString = DATABASE_URL) {
  if (pool) return pool;
  pool = new Pool({
    connectionString: requireDatabaseUrl(connectionString),
    ssl: PGSSL ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getPool, closePool, withClient, withTransaction };
```

- [ ] **Step 4: Написать базовую миграцию**

Повторяет текущую схему из `server.js:322-399` дословно, включая `ALTER TABLE ... IF NOT EXISTS`, поэтому одинаково безопасна на пустой и на живой базе.

Create `src/db/migrations/001_baseline.js`:

```js
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    name_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_data TEXT,
    register_nickname TEXT,
    telegram_contact TEXT,
    challenge_credits JSONB,
    rating INTEGER NOT NULL DEFAULT 1000,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id SERIAL PRIMARY KEY,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    game_id INTEGER,
    share_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES challenges(id) ON DELETE SET NULL,
    player_ids INTEGER[] NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    pending_result JSONB,
    result JSONB,
    elo JSONB
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    screen TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_challenges_from_user_id ON challenges(from_user_id);
  CREATE INDEX IF NOT EXISTS idx_challenges_to_user_id ON challenges(to_user_id);
  CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
  CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
  CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
`;

const PATCHES = [
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS register_nickname TEXT",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_contact TEXT",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS challenge_credits JSONB",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS share_token TEXT",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_share_token ON challenges(share_token) WHERE share_token IS NOT NULL",
  "ALTER TABLE games ADD COLUMN IF NOT EXISTS pending_result JSONB",
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'",
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ",
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",
  "ALTER TABLE games ADD COLUMN IF NOT EXISTS elo JSONB",
  "CREATE INDEX IF NOT EXISTS idx_games_player_ids ON games USING GIN (player_ids)"
];

module.exports = {
  version: 1,
  name: "baseline",
  async up(client) {
    await client.query(SCHEMA);
    for (const statement of PATCHES) {
      await client.query(statement);
    }
  }
};
```

- [ ] **Step 5: Написать раннер миграций**

Create `src/db/migrate.js`:

```js
const { logError } = require("../http/logger");

const MIGRATIONS = [require("./migrations/001_baseline")].sort(
  (a, b) => a.version - b.version
);

const JOURNAL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

async function appliedVersions(client) {
  const { rows } = await client.query("SELECT version FROM schema_migrations");
  return new Set(rows.map((row) => row.version));
}

async function migrate(pool) {
  const setup = await pool.connect();
  try {
    await setup.query(JOURNAL);
  } finally {
    setup.release();
  }

  const listClient = await pool.connect();
  let done;
  try {
    done = await appliedVersions(listClient);
  } finally {
    listClient.release();
  }

  const applied = [];
  for (const migration of MIGRATIONS) {
    if (done.has(migration.version)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await migration.up(client);
      await client.query(
        "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
        [migration.version, migration.name]
      );
      await client.query("COMMIT");
      applied.push(migration.version);
      console.log(
        JSON.stringify({
          level: "info",
          time: new Date().toISOString(),
          msg: "migration applied",
          version: migration.version,
          name: migration.name
        })
      );
    } catch (err) {
      await client.query("ROLLBACK");
      logError(`migration ${migration.version} (${migration.name}) failed`, err);
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}

module.exports = { migrate, MIGRATIONS };
```

- [ ] **Step 6: Запустить тест и убедиться, что он проходит**

```bash
node --test test/integration/migrate.test.js
```

Ожидаемо: `pass 6`, `fail 0`.

- [ ] **Step 7: Восстановить схему рабочей тестовой базы**

Предыдущий тест удаляет схему, поэтому характеризационные тесты надо прогнать заново — они пересоздадут таблицы через старый `ensureDb`.

```bash
npm run test:integration
```

Ожидаемо: все тесты зелёные.

- [ ] **Step 8: Commit**

```bash
git add src/db/pool.js src/db/migrate.js src/db/migrations/ test/integration/migrate.test.js
git commit -m "feat: add connection pool and versioned migrations"
```

---

### Task 7: Единый реестр Kill Team

Закрывает D3. Сейчас в треках живут `Tempestus Aquillons` и `XV26 Stealth Suits`, а в списке для результатов — `Tempestus Aquilons` и `XV26 Stealth Battlesuits`. Ради этого расхождения существуют две карты алиасов и два разных нормализатора ключа. Канон выбирается по именам файлов логотипов и карте slug во фронте: `Tempestus Aquilons`, `XV26 Stealth Battlesuits`.

**Files:**
- Create: `src/domain/kill-teams.js`
- Test: `test/unit/kill-teams.test.js`

**Interfaces:**
- Consumes: `src/http/io.js` → `ValidationError`.
- Produces: `src/domain/kill-teams.js` экспортирует
  `{ KILL_TEAMS, CLASSIFIED_TRACK, ALL_KILL_TEAM_TRACK, WILDCARDS, KILLZONES, CRIT_OPS, LEGACY_NAMES, teamKey(value), canonicalKillTeam(value), requireKillTeam(value) }`.
  - `canonicalKillTeam` возвращает каноническое имя либо `null`.
  - `requireKillTeam` возвращает каноническое имя либо бросает `ValidationError`.
  - `LEGACY_NAMES` — карта «старое имя → каноническое», используется миграцией 002.

- [ ] **Step 1: Написать падающий тест**

Инвариант в последнем тесте — тот самый, что обнаружил D3. В виде теста расхождение больше не пройдёт в main.

Create `test/unit/kill-teams.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  KILL_TEAMS,
  CLASSIFIED_TRACK,
  ALL_KILL_TEAM_TRACK,
  WILDCARDS,
  KILLZONES,
  CRIT_OPS,
  LEGACY_NAMES,
  canonicalKillTeam,
  requireKillTeam
} = require("../../src/domain/kill-teams");
const { ValidationError } = require("../../src/http/io");

test("каждое каноническое имя нормализуется в себя", () => {
  for (const team of KILL_TEAMS) {
    assert.equal(canonicalKillTeam(team), team, `сломано на ${team}`);
  }
});

test("регистр и лишние пробелы не мешают", () => {
  assert.equal(canonicalKillTeam("  kasrkin  "), "Kasrkin");
  assert.equal(canonicalKillTeam("ANGELS OF DEATH"), "Angels of Death");
});

test("исторические написания приводятся к канону", () => {
  assert.equal(canonicalKillTeam("Tempestus Aquillons"), "Tempestus Aquilons");
  assert.equal(canonicalKillTeam("XV26 Stealth Suits"), "XV26 Stealth Battlesuits");
  assert.equal(canonicalKillTeam("Imperial Navy Breachers"), "Navy Breachers");
  assert.equal(canonicalKillTeam("Warp Coven"), "Warpcoven");
  assert.equal(canonicalKillTeam("Void Dancer Troupe"), "Void-Dancer Troupe");
  assert.equal(canonicalKillTeam("Angel of Death"), "Angels of Death");
});

test("варианты написания XV26 сходятся в одно имя", () => {
  for (const variant of [
    "Stealth Suits",
    "Stealth Battlesuits",
    "XV 26 Stealth Suits",
    "xv26 stealth battlesuit"
  ]) {
    assert.equal(canonicalKillTeam(variant), "XV26 Stealth Battlesuits", `сломано на ${variant}`);
  }
});

test("мусорный ввод не проходит", () => {
  assert.equal(canonicalKillTeam("Not A Real Team"), null);
  assert.equal(canonicalKillTeam(""), null);
  assert.equal(canonicalKillTeam(null), null);
});

test("requireKillTeam бросает ValidationError на мусоре", () => {
  assert.throws(() => requireKillTeam("Not A Real Team"), ValidationError);
  assert.equal(requireKillTeam("kasrkin"), "Kasrkin");
});

test("LEGACY_NAMES покрывает ровно расхождение старых словарей", () => {
  assert.equal(LEGACY_NAMES["Tempestus Aquillons"], "Tempestus Aquilons");
  assert.equal(LEGACY_NAMES["XV26 Stealth Suits"], "XV26 Stealth Battlesuits");
  for (const [from, to] of Object.entries(LEGACY_NAMES)) {
    assert.ok(KILL_TEAMS.includes(to), `цель ${to} должна быть в реестре`);
    assert.ok(!KILL_TEAMS.includes(from), `устаревшее ${from} не должно быть в реестре`);
  }
});

test("в реестре нет дубликатов", () => {
  assert.equal(new Set(KILL_TEAMS).size, KILL_TEAMS.length);
});

test("треки и wildcards не пересекаются", () => {
  const wildcards = new Set(WILDCARDS);
  for (const team of ALL_KILL_TEAM_TRACK) {
    assert.ok(!wildcards.has(team), `${team} не может быть одновременно в треке и в wildcards`);
  }
});

test("классифицированный трек — подмножество полного", () => {
  const all = new Set(ALL_KILL_TEAM_TRACK);
  for (const team of CLASSIFIED_TRACK) {
    assert.ok(all.has(team), `${team} отсутствует в полном треке`);
  }
});

test("ИНВАРИАНТ: треки и wildcards в точности покрывают реестр", () => {
  const covered = new Set([...ALL_KILL_TEAM_TRACK, ...WILDCARDS]);
  const registry = new Set(KILL_TEAMS);

  const missing = [...registry].filter((team) => !covered.has(team));
  const extra = [...covered].filter((team) => !registry.has(team));

  assert.deepEqual(missing, [], "команды реестра, не попавшие ни в один трек");
  assert.deepEqual(extra, [], "команды треков, отсутствующие в реестре");
});

test("справочники killzone и crit op непусты и без дубликатов", () => {
  assert.ok(KILLZONES.includes("Volkus"));
  assert.ok(KILLZONES.includes("Tomb World"));
  assert.ok(CRIT_OPS.includes("Secure"));
  assert.equal(new Set(KILLZONES).size, KILLZONES.length);
  assert.equal(new Set(CRIT_OPS).size, CRIT_OPS.length);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/unit/kill-teams.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/domain/kill-teams'`.

- [ ] **Step 3: Написать реализацию**

Один нормализатор ключа вместо `normalizeKillTeam` и `teamKey`. Алиасы задаются только для написаний, отличающихся не пунктуацией — совпадения по ключу разбираются автоматически.

Create `src/domain/kill-teams.js`:

```js
const { ValidationError } = require("../http/io");

const CLASSIFIED_TRACK = [
  "Kasrkin",
  "Inquisitorial Agents",
  "Exaction Squad",
  "Angels of Death",
  "Chaos Cult",
  "Fellgor Ravagers",
  "Hand of the Archon",
  "Farstalker Kinband",
  "Hearthkyn Salvagers",
  "Hierotek Circle",
  "Scout Squad",
  "Blades of Khaine",
  "Plague Marines",
  "Mandrakes",
  "Nemesis Claw",
  "Brood Brothers",
  "Hernkyn Yaegirs",
  "Tempestus Aquilons",
  "Wrecka Krew",
  "Vespid Stingwings",
  "Ratlings",
  "Sanctifiers",
  "Goremongers",
  "Raveners",
  "Battleclade",
  "Deathwatch",
  "Canoptek Circle",
  "Wolf Scouts",
  "Celestian Insidiants",
  "Murderwing",
  "Spectre Squad",
  "Dragon Masters"
];

const EXTRA_TRACK_TEAMS = [
  "Novitiates",
  "Elucidian Starstriders",
  "Hunter Clade",
  "Death Korps",
  "Phobos Strike Team",
  "Gellerpox Infected",
  "Legionaries",
  "Blooded",
  "Warpcoven",
  "Corsair Voidscarred",
  "Wyrmblade",
  "Void-Dancer Troupe",
  "Kommandos",
  "Pathfinders"
];

const ALL_KILL_TEAM_TRACK = [...EXTRA_TRACK_TEAMS, ...CLASSIFIED_TRACK];

const WILDCARDS = ["Navy Breachers", "XV26 Stealth Battlesuits"];

const KILL_TEAMS = [...ALL_KILL_TEAM_TRACK, ...WILDCARDS];

const KILLZONES = [
  "Volkus",
  "Gallowdark",
  "Bheta-Decima",
  "Octarius",
  "Tomb World",
  "WTC ITD",
  "WTC Open",
  "Non-specific"
];

const CRIT_OPS = [
  "Secure",
  "Loot",
  "Transmission",
  "Orb",
  "Stake Claim",
  "Energy Cells",
  "Download",
  "Data",
  "Reboot"
];

// Написания, встречавшиеся во вводе и в сохранённых данных до канонизации.
const ALIASES = {
  "angel of death": "Angels of Death",
  "brood brother": "Brood Brothers",
  "celestian insidiant": "Celestian Insidiants",
  "dragon master": "Dragon Masters",
  "elucidian starstrider": "Elucidian Starstriders",
  "fellgor ravager": "Fellgor Ravagers",
  goremonger: "Goremongers",
  "hearthkyn salvager": "Hearthkyn Salvagers",
  "hernkyn yaegir": "Hernkyn Yaegirs",
  "imperial navy breacher": "Navy Breachers",
  "imperial navy breachers": "Navy Breachers",
  "inquisitorial agent": "Inquisitorial Agents",
  legionary: "Legionaries",
  "navy breacher": "Navy Breachers",
  "tempestus aquillons": "Tempestus Aquilons",
  "tempestus aquillon": "Tempestus Aquilons",
  "warp coven": "Warpcoven",
  "stealth suit": "XV26 Stealth Battlesuits",
  "stealth suits": "XV26 Stealth Battlesuits",
  "stealth battlesuit": "XV26 Stealth Battlesuits",
  "stealth battlesuits": "XV26 Stealth Battlesuits",
  "xv 26 stealth suit": "XV26 Stealth Battlesuits",
  "xv 26 stealth suits": "XV26 Stealth Battlesuits",
  "xv 26 stealth battlesuit": "XV26 Stealth Battlesuits",
  "xv 26 stealth battlesuits": "XV26 Stealth Battlesuits",
  "xv26 stealth suit": "XV26 Stealth Battlesuits",
  "xv26 stealth suits": "XV26 Stealth Battlesuits",
  "xv26 stealth battlesuit": "XV26 Stealth Battlesuits"
};

// Имена, которые могли попасть в сохранённые данные под старым словарём.
// Используется миграцией 002.
const LEGACY_NAMES = {
  "Tempestus Aquillons": "Tempestus Aquilons",
  "XV26 Stealth Suits": "XV26 Stealth Battlesuits"
};

function teamKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[`']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_KEY = new Map();
for (const team of KILL_TEAMS) {
  BY_KEY.set(teamKey(team), team);
}
for (const [alias, team] of Object.entries(ALIASES)) {
  BY_KEY.set(teamKey(alias), team);
}

function canonicalKillTeam(value) {
  const key = teamKey(value);
  if (!key) return null;
  return BY_KEY.get(key) || null;
}

function requireKillTeam(value) {
  const team = canonicalKillTeam(value);
  if (!team) throw new ValidationError("Choose a valid Kill Team from the list");
  return team;
}

module.exports = {
  KILL_TEAMS,
  CLASSIFIED_TRACK,
  ALL_KILL_TEAM_TRACK,
  WILDCARDS,
  KILLZONES,
  CRIT_OPS,
  LEGACY_NAMES,
  teamKey,
  canonicalKillTeam,
  requireKillTeam
};
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/unit/kill-teams.test.js
```

Ожидаемо: `pass 13`, `fail 0`. Если падает инвариант — сверьте, что `WILDCARDS` содержит канонические имена и что ни одна команда не попала одновременно в трек и в wildcards.

- [ ] **Step 5: Commit**

```bash
git add src/domain/kill-teams.js test/unit/kill-teams.test.js
git commit -m "feat: add single canonical Kill Team registry with invariant test"
```

---

### Task 8: Валидация и пароли

Закрывает часть B3: `crypto.scryptSync` блокирует event loop на каждой проверке пароля.

**Files:**
- Create: `src/domain/validation.js`
- Create: `src/domain/passwords.js`
- Test: `test/unit/validation.test.js`
- Test: `test/unit/passwords.test.js`

**Interfaces:**
- Consumes: `src/http/io.js` → `ValidationError`; `src/config.js` → `MAX_AVATAR_DATA_URL_LENGTH`.
- Produces:
  - `src/domain/validation.js` → `{ normalizeName, requireName, profileText, requiredProfileText, validateAvatarData, scoreInput, primaryInput, aplInput, optionalTextInput, requireInteger }`
  - `src/domain/passwords.js` → `{ hashPassword(password), verifyPassword(password, stored), generateTemporaryPassword() }` — первые две асинхронные.

- [ ] **Step 1: Написать падающие тесты**

Create `test/unit/validation.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeName,
  requireName,
  profileText,
  requiredProfileText,
  validateAvatarData,
  scoreInput,
  primaryInput,
  aplInput,
  optionalTextInput
} = require("../../src/domain/validation");
const { ValidationError } = require("../../src/http/io");

test("normalizeName схлопывает пробелы", () => {
  assert.equal(normalizeName("  Alpha   Bravo "), "Alpha Bravo");
  assert.equal(normalizeName(null), "");
});

test("requireName принимает буквы, цифры и ._-", () => {
  assert.equal(requireName(" Alpha_1.2-3 "), "Alpha_1.2-3");
  assert.equal(requireName("Кириллица"), "Кириллица");
});

test("requireName отвергает слишком короткое и слишком длинное", () => {
  assert.throws(() => requireName("A"), ValidationError);
  assert.throws(() => requireName("x".repeat(25)), ValidationError);
  assert.throws(() => requireName("bad!name"), ValidationError);
});

test("profileText режет по длине", () => {
  assert.equal(profileText("  a  b ", "Field", 40), "a b");
  assert.throws(() => profileText("x".repeat(41), "Field", 40), ValidationError);
});

test("requiredProfileText требует непустое значение", () => {
  assert.throws(() => requiredProfileText("", "Telegram Contact", 80), ValidationError);
  assert.equal(requiredProfileText(" @user ", "Telegram Contact", 80), "@user");
});

test("validateAvatarData принимает data URL и пустое значение", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(validateAvatarData(png), png);
  assert.equal(validateAvatarData(null), null);
  assert.equal(validateAvatarData(""), null);
});

test("validateAvatarData отвергает не-картинки и переросшие", () => {
  assert.throws(() => validateAvatarData("https://example.com/a.png"), ValidationError);
  assert.throws(() => validateAvatarData(123), ValidationError);
  assert.throws(
    () => validateAvatarData(`data:image/png;base64,${"A".repeat(1024 * 1024 + 10)}`),
    ValidationError
  );
});

test("scoreInput ограничен диапазоном 0..6", () => {
  assert.equal(scoreInput(0), 0);
  assert.equal(scoreInput("6"), 6);
  assert.throws(() => scoreInput(7), ValidationError);
  assert.throws(() => scoreInput(-1), ValidationError);
  assert.throws(() => scoreInput(2.5), ValidationError);
  assert.throws(() => scoreInput(undefined), ValidationError);
});

test("primaryInput принимает только три значения", () => {
  assert.equal(primaryInput("crit"), "crit");
  assert.throws(() => primaryInput("other"), ValidationError);
});

test("aplInput ограничен диапазоном 0..99", () => {
  assert.equal(aplInput("12"), 12);
  assert.throws(() => aplInput(100), ValidationError);
});

test("optionalTextInput режет по длине", () => {
  assert.equal(optionalTextInput("  x ", "Tac Op"), "x");
  assert.throws(() => optionalTextInput("x".repeat(81), "Tac Op"), ValidationError);
});
```

Create `test/unit/passwords.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hashPassword,
  verifyPassword,
  generateTemporaryPassword
} = require("../../src/domain/passwords");

test("хеш имеет вид salt:hash и не совпадает с паролем", async () => {
  const stored = await hashPassword("password123");
  const [salt, hash] = stored.split(":");
  assert.equal(salt.length, 32);
  assert.equal(hash.length, 128);
  assert.ok(!stored.includes("password123"));
});

test("один пароль даёт разные хеши", async () => {
  assert.notEqual(await hashPassword("password123"), await hashPassword("password123"));
});

test("verifyPassword подтверждает верный пароль", async () => {
  const stored = await hashPassword("password123");
  assert.equal(await verifyPassword("password123", stored), true);
});

test("verifyPassword отвергает неверный пароль", async () => {
  const stored = await hashPassword("password123");
  assert.equal(await verifyPassword("wrong", stored), false);
});

test("verifyPassword не падает на битом хеше", async () => {
  assert.equal(await verifyPassword("x", ""), false);
  assert.equal(await verifyPassword("x", "no-colon"), false);
  assert.equal(await verifyPassword("x", "salt:zzzz"), false);
});

test("verifyPassword совместим с хешами, созданными scryptSync", async () => {
  const crypto = require("node:crypto");
  const salt = crypto.randomBytes(16).toString("hex");
  const legacy = `${salt}:${crypto.scryptSync("legacy-pass", salt, 64).toString("hex")}`;
  assert.equal(await verifyPassword("legacy-pass", legacy), true);
});

test("временный пароль достаточно длинный и каждый раз новый", () => {
  const first = generateTemporaryPassword();
  assert.ok(first.length >= 12);
  assert.notEqual(first, generateTemporaryPassword());
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

```bash
node --test test/unit/validation.test.js test/unit/passwords.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/domain/validation'`.

- [ ] **Step 3: Написать валидацию**

Create `src/domain/validation.js`:

```js
const { ValidationError } = require("../http/io");
const { MAX_AVATAR_DATA_URL_LENGTH } = require("../config");

const NAME_PATTERN = /^[\p{L}0-9 _.-]{2,24}$/u;
const AVATAR_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

function requireName(value) {
  const name = normalizeName(value);
  if (!NAME_PATTERN.test(name)) {
    throw new ValidationError("Name must be 2-24 characters: letters, numbers, spaces, ._-");
  }
  return name;
}

function profileText(value, label, maxLength) {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (text.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function requiredProfileText(value, label, maxLength) {
  const text = profileText(value, label, maxLength);
  if (!text) throw new ValidationError(`${label} is required`);
  return text;
}

function validateAvatarData(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new ValidationError("Avatar must be an image data URL");
  }
  if (value.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new ValidationError("Avatar image is too large");
  }
  if (!AVATAR_PATTERN.test(value)) {
    throw new ValidationError("Avatar must be a PNG, JPG, WebP, or GIF image");
  }
  return value;
}

function requireInteger(value, { min, max, message }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ValidationError(message);
  }
  return number;
}

function scoreInput(value) {
  return requireInteger(value, {
    min: 0,
    max: 6,
    message: "VP for each op must be between 0 and 6"
  });
}

function primaryInput(value) {
  if (!["crit", "kill", "tac"].includes(value)) {
    throw new ValidationError("Primary Op must be crit, kill, or tac");
  }
  return value;
}

function aplInput(value) {
  return requireInteger(value, {
    min: 0,
    max: 99,
    message: "APL on table must be an integer between 0 and 99"
  });
}

function optionalTextInput(value, label, maxLength = 80) {
  const text = String(value || "").trim();
  if (text.length > maxLength) throw new ValidationError(`${label} is too long`);
  return text;
}

module.exports = {
  normalizeName,
  requireName,
  profileText,
  requiredProfileText,
  validateAvatarData,
  requireInteger,
  scoreInput,
  primaryInput,
  aplInput,
  optionalTextInput
};
```

- [ ] **Step 4: Написать пароли**

Формат хранения `salt:hash` не меняется, поэтому существующие пароли продолжают работать.

Create `src/domain/passwords.js`:

```js
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

async function hashPassword(password, salt = crypto.randomBytes(SALT_BYTES).toString("hex")) {
  const derived = await scrypt(String(password), salt, KEY_LENGTH);
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;

  let expectedBuffer;
  try {
    expectedBuffer = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (expectedBuffer.length !== KEY_LENGTH) return false;

  const actual = await scrypt(String(password), salt, KEY_LENGTH);
  return crypto.timingSafeEqual(expectedBuffer, actual);
}

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

module.exports = { hashPassword, verifyPassword, generateTemporaryPassword };
```

- [ ] **Step 5: Запустить тесты и убедиться, что они проходят**

```bash
node --test test/unit/validation.test.js test/unit/passwords.test.js
```

Ожидаемо: `pass 18`, `fail 0`.

Тест «не падает на битом хеше» проверяет, что `Buffer.from("zzzz", "hex")` даёт буфер неверной длины и функция возвращает `false`, а не бросает исключение из `timingSafeEqual`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/validation.js src/domain/passwords.js test/unit/validation.test.js test/unit/passwords.test.js
git commit -m "feat: add validation module and async password hashing"
```

---

### Task 9: Elo и подсчёт Approved Ops

Закрывает часть D6: параметр `game` в `calculateSubmittedResult` не использовался.

**Files:**
- Create: `src/domain/elo.js`
- Create: `src/domain/scoring.js`
- Test: `test/unit/elo.test.js`
- Test: `test/unit/scoring.test.js`

**Interfaces:**
- Consumes: `src/domain/validation.js`, `src/domain/kill-teams.js`, `src/http/io.js` → `ValidationError`.
- Produces:
  - `src/domain/elo.js` → `{ ELO_K, calculateElo(ratingA, ratingB, scoreA) }` → `{ deltaA, deltaB }`
  - `src/domain/scoring.js` → `{ calculateApprovedOps(player), parseKillzone(input), calculateTieBreakers(input, playerAId, playerBId, scoreA, scoreB), calculateSubmittedResult(body, playerAId, playerBId), matchScoreFor(result, playerAId, playerBId) }`

- [ ] **Step 1: Написать падающие тесты**

Create `test/unit/elo.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { ELO_K, calculateElo } = require("../../src/domain/elo");

test("K равен 32", () => {
  assert.equal(ELO_K, 32);
});

test("победа при равных рейтингах даёт +16 и -16", () => {
  assert.deepEqual(calculateElo(1000, 1000, 1), { deltaA: 16, deltaB: -16 });
});

test("ничья при равных рейтингах не меняет рейтинги", () => {
  assert.deepEqual(calculateElo(1000, 1000, 0.5), { deltaA: 0, deltaB: -0 });
});

test("поражение при равных рейтингах даёт -16", () => {
  assert.deepEqual(calculateElo(1000, 1000, 0), { deltaA: -16, deltaB: 16 });
});

test("дельты всегда симметричны", () => {
  for (const [a, b, score] of [
    [1000, 1400, 1],
    [1400, 1000, 1],
    [1200, 1000, 0.5],
    [800, 1600, 0]
  ]) {
    const { deltaA, deltaB } = calculateElo(a, b, score);
    assert.equal(deltaA + deltaB, 0, `несимметрично для ${a}/${b}/${score}`);
  }
});

test("победа над сильным даёт больше, чем над слабым", () => {
  const overStronger = calculateElo(1000, 1400, 1).deltaA;
  const overWeaker = calculateElo(1400, 1000, 1).deltaA;
  assert.ok(overStronger > overWeaker);
  assert.ok(overStronger <= ELO_K);
});
```

Create `test/unit/scoring.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateApprovedOps,
  parseKillzone,
  calculateTieBreakers,
  calculateSubmittedResult,
  matchScoreFor
} = require("../../src/domain/scoring");
const { ValidationError } = require("../../src/http/io");

function ops(overrides = {}) {
  return { crit: 3, kill: 2, tac: 1, primary: "crit", faction: "Kasrkin", ...overrides };
}

test("итог складывается с бонусом за primary, округлённым вверх", () => {
  const score = calculateApprovedOps(ops({ crit: 5, kill: 2, tac: 1, primary: "crit" }));
  assert.equal(score.primaryScore, 5);
  assert.equal(score.primaryBonus, 3);
  assert.equal(score.total, 5 + 2 + 1 + 3);
});

test("бонус за чётный primary не округляется", () => {
  const score = calculateApprovedOps(ops({ crit: 4, kill: 0, tac: 0, primary: "crit" }));
  assert.equal(score.primaryBonus, 2);
  assert.equal(score.total, 6);
});

test("primary может указывать на kill и tac", () => {
  assert.equal(calculateApprovedOps(ops({ kill: 6, primary: "kill" })).primaryBonus, 3);
  assert.equal(calculateApprovedOps(ops({ tac: 3, primary: "tac" })).primaryBonus, 2);
});

test("faction приводится к каноническому имени", () => {
  assert.equal(calculateApprovedOps(ops({ faction: "xv26 stealth suits" })).faction,
    "XV26 Stealth Battlesuits");
  assert.equal(calculateApprovedOps(ops({ faction: "Tempestus Aquillons" })).faction,
    "Tempestus Aquilons");
});

test("недопустимые очки и Kill Team отклоняются", () => {
  assert.throws(() => calculateApprovedOps(ops({ crit: 7 })), ValidationError);
  assert.throws(() => calculateApprovedOps(ops({ primary: "nope" })), ValidationError);
  assert.throws(() => calculateApprovedOps(ops({ faction: "Nope" })), ValidationError);
});

test("parseKillzone принимает пустой ввод", () => {
  assert.equal(parseKillzone(undefined), null);
  assert.equal(parseKillzone({}), null);
});

test("parseKillzone проверяет справочники и layout", () => {
  assert.deepEqual(parseKillzone({ killzone: "Volkus", critOp: "Loot", layout: "3" }), {
    killzone: "Volkus",
    critOp: "Loot",
    layout: 3
  });
  assert.throws(() => parseKillzone({ killzone: "Nowhere" }), ValidationError);
  assert.throws(() => parseKillzone({ critOp: "Nothing" }), ValidationError);
  assert.throws(() => parseKillzone({ layout: "7" }), ValidationError);
});

test("тайбрейкер решается по primary", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 6, kill: 0, tac: 0, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 0, kill: 2, tac: 4, primary: "kill" }));
  const result = calculateTieBreakers({ enabled: true }, 1, 2, scoreA, scoreB);
  assert.equal(result.decidedBy, "primary");
  assert.equal(result.winnerId, 1);
});

test("тайбрейкер решается по сумме crit и tac", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 4, kill: 0, tac: 2, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 0, kill: 4, tac: 2, primary: "kill" }));
  const result = calculateTieBreakers({ enabled: true }, 1, 2, scoreA, scoreB);
  assert.equal(result.decidedBy, "critTac");
  assert.equal(result.winnerId, 1);
});

test("тайбрейкер решается по APL", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "kill" }));
  const result = calculateTieBreakers(
    { enabled: true, apl: { 1: 9, 2: 4 } },
    1,
    2,
    scoreA,
    scoreB
  );
  assert.equal(result.decidedBy, "apl");
  assert.equal(result.winnerId, 1);
});

test("при полном равенстве нужен победитель roll-off", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "kill" }));
  const input = { enabled: true, apl: { 1: 5, 2: 5 } };

  assert.throws(() => calculateTieBreakers(input, 1, 2, scoreA, scoreB), ValidationError);

  const decided = calculateTieBreakers({ ...input, rollOffWinnerId: 2 }, 1, 2, scoreA, scoreB);
  assert.equal(decided.decidedBy, "rollOff");
  assert.equal(decided.winnerId, 2);
  assert.equal(decided.rollOffWinnerId, 2);
});

test("roll-off не принимает постороннего игрока", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "kill" }));
  assert.throws(
    () =>
      calculateTieBreakers(
        { enabled: true, apl: { 1: 5, 2: 5 }, rollOffWinnerId: 99 },
        1,
        2,
        scoreA,
        scoreB
      ),
    ValidationError
  );
});

test("calculateSubmittedResult определяет победителя по сумме", () => {
  const result = calculateSubmittedResult(
    {
      scores: {
        1: ops({ crit: 6, kill: 6, tac: 6, primary: "crit" }),
        2: ops({ crit: 0, kill: 0, tac: 0, primary: "kill", faction: "Legionaries" })
      }
    },
    1,
    2
  );
  assert.equal(result.winnerId, 1);
  assert.equal(result.tiebreakers, null);
  assert.equal(result.scores[1].total, 21);
  assert.equal(result.scores[2].total, 0);
});

test("ничья без тайбрейкеров оставляет winnerId пустым", () => {
  const same = ops({ crit: 2, kill: 2, tac: 2, primary: "crit" });
  const result = calculateSubmittedResult(
    { scores: { 1: same, 2: { ...same, faction: "Legionaries" } } },
    1,
    2
  );
  assert.equal(result.winnerId, null);
});

test("matchScoreFor переводит результат в очки для Elo", () => {
  assert.equal(matchScoreFor({ winnerId: 1 }, 1, 2), 1);
  assert.equal(matchScoreFor({ winnerId: 2 }, 1, 2), 0);
  assert.equal(matchScoreFor({ winnerId: null }, 1, 2), 0.5);
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

```bash
node --test test/unit/elo.test.js test/unit/scoring.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/domain/elo'`.

- [ ] **Step 3: Написать Elo**

Create `src/domain/elo.js`:

```js
const ELO_K = 32;

function calculateElo(ratingA, ratingB, scoreA) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const deltaA = Math.round(ELO_K * (scoreA - expectedA));
  return { deltaA, deltaB: -deltaA };
}

module.exports = { ELO_K, calculateElo };
```

- [ ] **Step 4: Написать подсчёт результата**

Ключи в `body.scores` приходят из JSON и потому строковые — обращение идёт по строковому ключу, а в ответ кладутся те же ключи, что и раньше.

Create `src/domain/scoring.js`:

```js
const { ValidationError } = require("../http/io");
const { KILLZONES, CRIT_OPS, requireKillTeam } = require("./kill-teams");
const {
  scoreInput,
  primaryInput,
  aplInput,
  optionalTextInput,
  requireInteger
} = require("./validation");

function calculateApprovedOps(player = {}) {
  const ops = {
    crit: scoreInput(player.crit),
    kill: scoreInput(player.kill),
    tac: scoreInput(player.tac)
  };
  const primary = primaryInput(player.primary);
  const primaryBonus = Math.ceil(ops[primary] / 2);

  return {
    crit: ops.crit,
    kill: ops.kill,
    tac: ops.tac,
    faction: requireKillTeam(player.faction),
    tacOp: optionalTextInput(player.tacOp, "Tac Op"),
    primary,
    primaryScore: ops[primary],
    primaryBonus,
    total: ops.crit + ops.kill + ops.tac + primaryBonus
  };
}

function parseKillzone(input) {
  const source = input || {};
  const killzone = optionalTextInput(source.killzone, "Killzone");
  const critOp = optionalTextInput(source.critOp, "Crit Op");
  const layoutText = String(source.layout || "").trim();

  let layout = null;
  if (layoutText) {
    layout = requireInteger(layoutText, {
      min: 1,
      max: 6,
      message: "Killzone layout must be between 1 and 6"
    });
  }
  if (killzone && !KILLZONES.includes(killzone)) {
    throw new ValidationError("Choose a valid Killzone");
  }
  if (critOp && !CRIT_OPS.includes(critOp)) {
    throw new ValidationError("Choose a valid Crit Op");
  }
  return killzone || critOp || layout ? { killzone, critOp, layout } : null;
}

function calculateTieBreakers(input, playerAId, playerBId, scoreA, scoreB) {
  const primary = { [playerAId]: scoreA.primaryBonus, [playerBId]: scoreB.primaryBonus };
  const critTac = {
    [playerAId]: scoreA.crit + scoreA.tac,
    [playerBId]: scoreB.crit + scoreB.tac
  };
  const apl = {
    [playerAId]: aplInput(input.apl?.[playerAId]),
    [playerBId]: aplInput(input.apl?.[playerBId])
  };
  const rollOffWinnerId = input.rollOffWinnerId ? Number(input.rollOffWinnerId) : null;

  let winnerId = null;
  let decidedBy = null;

  if (primary[playerAId] !== primary[playerBId]) {
    winnerId = primary[playerAId] > primary[playerBId] ? playerAId : playerBId;
    decidedBy = "primary";
  } else if (critTac[playerAId] !== critTac[playerBId]) {
    winnerId = critTac[playerAId] > critTac[playerBId] ? playerAId : playerBId;
    decidedBy = "critTac";
  } else if (apl[playerAId] !== apl[playerBId]) {
    winnerId = apl[playerAId] > apl[playerBId] ? playerAId : playerBId;
    decidedBy = "apl";
  } else {
    if (![playerAId, playerBId].includes(rollOffWinnerId)) {
      throw new ValidationError("Choose the roll-off winner for this tied match");
    }
    winnerId = rollOffWinnerId;
    decidedBy = "rollOff";
  }

  return {
    enabled: true,
    winnerId,
    decidedBy,
    primary,
    critTac,
    apl,
    rollOffWinnerId: decidedBy === "rollOff" ? rollOffWinnerId : null
  };
}

function calculateSubmittedResult(body, playerAId, playerBId) {
  const scoresByUser = body.scores || {};
  const scoreA = calculateApprovedOps(scoresByUser[playerAId] || {});
  const scoreB = calculateApprovedOps(scoresByUser[playerBId] || {});

  let winnerId = null;
  let tiebreakers = null;

  if (scoreA.total > scoreB.total) {
    winnerId = playerAId;
  } else if (scoreB.total > scoreA.total) {
    winnerId = playerBId;
  } else if (body.tiebreakers?.enabled) {
    tiebreakers = calculateTieBreakers(body.tiebreakers, playerAId, playerBId, scoreA, scoreB);
    winnerId = tiebreakers.winnerId;
  }

  return {
    winnerId,
    scores: { [playerAId]: scoreA, [playerBId]: scoreB },
    killzone: parseKillzone(body.killzone),
    tiebreakers
  };
}

function matchScoreFor(result, playerAId, playerBId) {
  if (result.winnerId === playerAId) return 1;
  if (result.winnerId === playerBId) return 0;
  return 0.5;
}

module.exports = {
  calculateApprovedOps,
  parseKillzone,
  calculateTieBreakers,
  calculateSubmittedResult,
  matchScoreFor
};
```

- [ ] **Step 5: Запустить тесты и убедиться, что они проходят**

```bash
node --test test/unit/elo.test.js test/unit/scoring.test.js
```

Ожидаемо: `pass 22`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/elo.js src/domain/scoring.js test/unit/elo.test.js test/unit/scoring.test.js
git commit -m "feat: add Elo and Approved Ops scoring modules"
```

---

### Task 10: Прогресс challenge-треков

Закрывает часть D6: ветка `deduct` внутри `if (teamIndex !== -1)` в `server.js:778` недостижима, потому что `deduct` уже обработан выше на строке 767.

**Files:**
- Create: `src/domain/challenge-progress.js`
- Test: `test/unit/challenge-progress.test.js`

**Interfaces:**
- Consumes: `src/domain/kill-teams.js` → `canonicalKillTeam`, `CLASSIFIED_TRACK`, `ALL_KILL_TEAM_TRACK`, `WILDCARDS`.
- Produces: `src/domain/challenge-progress.js` → `{ buildChallengeEvents(games, user), buildTrackProgress(events, teams, wildcards), buildChallengeTracks(games, user) }`.
  - `buildTrackProgress` возвращает объект **без** поля `user`; поле добавляет `src/api/views.js` в задаче 12, чтобы форма ответа осталась прежней.
  - `buildChallengeTracks` возвращает `{ classified, allKillTeam }`.

- [ ] **Step 1: Написать падающий тест**

Create `test/unit/challenge-progress.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChallengeEvents,
  buildTrackProgress,
  buildChallengeTracks
} = require("../../src/domain/challenge-progress");
const { CLASSIFIED_TRACK, WILDCARDS } = require("../../src/domain/kill-teams");

function completedGame(id, winnerId, faction, at) {
  return {
    id,
    status: "completed",
    playerIds: [winnerId, 999],
    submittedAt: at,
    createdAt: at,
    result: { winnerId, scores: { [winnerId]: { faction } } }
  };
}

test("победы дают события credit", () => {
  const user = { id: 1, challengeCredits: [] };
  const games = [completedGame(1, 1, "Kasrkin", "2026-01-01T00:00:00.000Z")];
  const events = buildChallengeEvents(games, user);

  assert.equal(events.length, 1);
  assert.equal(events[0].team, "Kasrkin");
  assert.equal(events[0].action, "credit");
  assert.equal(events[0].source, "game");
  assert.equal(events[0].gameId, 1);
});

test("поражения и незавершённые игры событий не дают", () => {
  const user = { id: 1, challengeCredits: [] };
  const games = [
    completedGame(1, 2, "Kasrkin", "2026-01-01T00:00:00.000Z"),
    { id: 2, status: "open", playerIds: [1, 2], result: null }
  ];
  assert.deepEqual(buildChallengeEvents(games, user), []);
});

test("исторические названия в сохранённых данных приводятся к канону", () => {
  const user = { id: 1, challengeCredits: [] };
  const games = [completedGame(1, 1, "Tempestus Aquillons", "2026-01-01T00:00:00.000Z")];
  assert.equal(buildChallengeEvents(games, user)[0].team, "Tempestus Aquilons");
});

test("ручные начисления и списания попадают в события", () => {
  const user = {
    id: 1,
    challengeCredits: [
      { team: "Kasrkin", action: "credit", creditedBy: 5, creditedAt: "2026-01-02T00:00:00.000Z" },
      { team: "Kasrkin", action: "deduct", deductedBy: 5, deductedAt: "2026-01-03T00:00:00.000Z" }
    ]
  };
  const events = buildChallengeEvents([], user);
  assert.equal(events.length, 2);
  assert.equal(events[0].action, "credit");
  assert.equal(events[1].action, "deduct");
});

test("события сортируются по времени", () => {
  const user = {
    id: 1,
    challengeCredits: [
      { team: "Ratlings", action: "credit", creditedAt: "2026-01-01T00:00:00.000Z" }
    ]
  };
  const games = [completedGame(1, 1, "Kasrkin", "2026-01-05T00:00:00.000Z")];
  const events = buildChallengeEvents(games, user);
  assert.deepEqual(events.map((event) => event.team), ["Ratlings", "Kasrkin"]);
});

test("прогресс отмечает выполненные и следующую команду", () => {
  const events = [{ team: "Kasrkin", action: "credit", at: "2026-01-01T00:00:00.000Z" }];
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);

  assert.equal(progress.total, CLASSIFIED_TRACK.length);
  assert.equal(progress.completedCount, 1);
  assert.equal(progress.teams[0].status, "completed");
  assert.equal(progress.teams[0].order, 1);
  assert.equal(progress.teams[1].status, "current");
  assert.equal(progress.teams[2].status, "locked");
  assert.equal(progress.nextTeam, CLASSIFIED_TRACK[1]);
});

test("повторная победа той же командой не считается дважды", () => {
  const events = [
    { team: "Kasrkin", action: "credit", at: "2026-01-01T00:00:00.000Z" },
    { team: "Kasrkin", action: "credit", at: "2026-01-02T00:00:00.000Z" }
  ];
  assert.equal(buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS).completedCount, 1);
});

test("списание снимает отметку", () => {
  const events = [
    { team: "Kasrkin", action: "credit", at: "2026-01-01T00:00:00.000Z" },
    { team: "Kasrkin", action: "deduct", at: "2026-01-02T00:00:00.000Z" }
  ];
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);
  assert.equal(progress.completedCount, 0);
  assert.equal(progress.teams[0].status, "current");
});

test("wildcards учитываются отдельно от трека", () => {
  const events = [{ team: WILDCARDS[0], action: "credit", at: "2026-01-01T00:00:00.000Z" }];
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);

  assert.equal(progress.completedCount, 0);
  assert.equal(progress.wildcardCompleted.length, 1);
  assert.equal(progress.wildcards[0].status, "completed");
  assert.equal(progress.wildcards[1].status, "available");
});

test("списание wildcard снимает отметку", () => {
  const events = [
    { team: WILDCARDS[0], action: "credit", at: "2026-01-01T00:00:00.000Z" },
    { team: WILDCARDS[0], action: "deduct", at: "2026-01-02T00:00:00.000Z" }
  ];
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);
  assert.equal(progress.wildcards[0].status, "available");
});

test("команда не из трека игнорируется", () => {
  const events = [{ team: "Novitiates", action: "credit", at: "2026-01-01T00:00:00.000Z" }];
  assert.equal(buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS).completedCount, 0);
});

test("полностью пройденный трек не имеет следующей команды", () => {
  const events = CLASSIFIED_TRACK.map((team, index) => ({
    team,
    action: "credit",
    at: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`
  }));
  const progress = buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS);
  assert.equal(progress.completedCount, CLASSIFIED_TRACK.length);
  assert.equal(progress.nextTeam, null);
});

test("buildChallengeTracks отдаёт оба трека", () => {
  const user = { id: 1, challengeCredits: [] };
  const games = [completedGame(1, 1, "Novitiates", "2026-01-01T00:00:00.000Z")];
  const tracks = buildChallengeTracks(games, user);

  assert.equal(tracks.classified.completedCount, 0);
  assert.equal(tracks.allKillTeam.completedCount, 1);
});

test("прогресс не содержит поле user — его добавляет слой представлений", () => {
  const progress = buildTrackProgress([], CLASSIFIED_TRACK, WILDCARDS);
  assert.equal("user" in progress, false);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/unit/challenge-progress.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/domain/challenge-progress'`.

- [ ] **Step 3: Написать реализацию**

Недостижимая ветка не переносится: `deduct` обрабатывается один раз, до поиска команды в треке.

Create `src/domain/challenge-progress.js`:

```js
const {
  canonicalKillTeam,
  CLASSIFIED_TRACK,
  ALL_KILL_TEAM_TRACK,
  WILDCARDS
} = require("./kill-teams");

function buildChallengeEvents(games, user) {
  const gameEvents = games
    .filter((game) => game.status === "completed" && game.result?.winnerId === user.id)
    .map((game) => ({
      team: canonicalKillTeam(game.result.scores?.[user.id]?.faction),
      source: "game",
      action: "credit",
      gameId: game.id,
      at: game.submittedAt || game.createdAt || null
    }));

  const manualEvents = (user.challengeCredits || []).map((credit) => ({
    team: canonicalKillTeam(credit.team),
    source: "manual",
    action: credit.action === "deduct" ? "deduct" : "credit",
    creditedBy: credit.creditedBy || credit.deductedBy || null,
    at: credit.creditedAt || credit.deductedAt || null
  }));

  return [...gameEvents, ...manualEvents]
    .filter((event) => event.team)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function buildTrackProgress(events, teams, wildcards) {
  const completed = [];
  const wildcardCompleted = [];

  for (const event of events) {
    if (wildcards.includes(event.team)) {
      const index = wildcardCompleted.findIndex((item) => item.team === event.team);
      if (event.action === "deduct") {
        if (index !== -1) wildcardCompleted.splice(index, 1);
      } else if (index === -1) {
        wildcardCompleted.push({ ...event });
      }
      continue;
    }

    const teamIndex = teams.indexOf(event.team);
    if (teamIndex === -1) continue;

    const completedIndex = completed.findIndex((item) => item.team === event.team);
    if (event.action === "deduct") {
      if (completedIndex !== -1) completed.splice(completedIndex, 1);
      continue;
    }
    if (completedIndex === -1) {
      completed.push({ ...event, order: teamIndex + 1 });
    }
  }

  const completedTeams = new Set(completed.map((item) => item.team));
  const nextIndex = teams.findIndex((team) => !completedTeams.has(team));
  const currentIndex = nextIndex === -1 ? teams.length : nextIndex;

  return {
    total: teams.length,
    completedCount: completed.length,
    nextTeam: teams[currentIndex] || null,
    completed,
    wildcardCompleted,
    teams: teams.map((team, index) => ({
      order: index + 1,
      team,
      status: completedTeams.has(team)
        ? "completed"
        : index === currentIndex
          ? "current"
          : "locked",
      credit: completed.find((item) => item.team === team) || null
    })),
    wildcards: wildcards.map((team) => ({
      team,
      status: wildcardCompleted.some((item) => item.team === team) ? "completed" : "available",
      credit: wildcardCompleted.find((item) => item.team === team) || null
    }))
  };
}

function buildChallengeTracks(games, user) {
  const events = buildChallengeEvents(games, user);
  return {
    classified: buildTrackProgress(events, CLASSIFIED_TRACK, WILDCARDS),
    allKillTeam: buildTrackProgress(events, ALL_KILL_TEAM_TRACK, WILDCARDS)
  };
}

module.exports = { buildChallengeEvents, buildTrackProgress, buildChallengeTracks };
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/unit/challenge-progress.test.js
```

Ожидаемо: `pass 14`, `fail 0`.

- [ ] **Step 5: Прогнать все юнит-тесты**

```bash
npm run test:unit
```

Ожидаемо: все зелёные, ни одного падения.

- [ ] **Step 6: Commit**

```bash
git add src/domain/challenge-progress.js test/unit/challenge-progress.test.js
git commit -m "feat: add challenge track progress module"
```

---

### Task 11: Репозитории users и sessions

Начало замены чтения-и-перезаписи всей БД. Закрывает A2 (идентификаторы выдаёт `RETURNING id`) и A3 (сессия проверяется одним запросом с условием на срок, без записи).

**Files:**
- Create: `src/db/rows.js`
- Create: `src/db/repositories/users.js`
- Create: `src/db/repositories/sessions.js`
- Test: `test/integration/repositories-users.test.js`

**Interfaces:**
- Consumes: `src/db/pool.js`, `src/db/migrate.js`.
- Produces:
  - `src/db/rows.js` → `{ USER_COLUMNS, CHALLENGE_COLUMNS, GAME_COLUMNS, FEEDBACK_COLUMNS, toIso, mapUser, mapChallenge, mapGame, mapFeedback }` — единственное место перевода строк БД в доменные объекты.
  - `src/db/repositories/users.js` → `{ findById, findByIds, lockByIds, findByNameKey, isNameTaken, listLeaderboard, listWithGameCounts, search, insert, updateProfile, setPasswordHash, addRating, setRating, setAdmin, appendChallengeCredit, remove, countAdmins, hasAdmin }`
  - `findByIds` — обычное чтение для сборки представлений; `lockByIds` — только для мутаций, берёт `FOR UPDATE`.
  - `src/db/repositories/sessions.js` → `{ create, findActiveUser, deleteByToken, deleteByUserId, deleteExpired }`
  - Доменная форма пользователя: `{ id, name, passwordHash, avatarData, registerNickname, telegramContact, challengeCredits, rating, isAdmin, createdAt, updatedAt }`.
  - `findActiveUser(client, token)` возвращает пользователя в той же форме либо `null`.

- [ ] **Step 1: Написать падающий тест**

Create `test/integration/repositories-users.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const users = require("../../src/db/repositories/users");
const sessions = require("../../src/db/repositories/sessions");

let pool;
let client;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("TRUNCATE sessions, feedback, games, challenges, users RESTART IDENTITY CASCADE");
  client = await pool.connect();
});

test.afterEach(() => {
  client.release();
});

function newUser(name, overrides = {}) {
  return {
    name,
    passwordHash: "salt:hash",
    avatarData: null,
    registerNickname: name,
    telegramContact: `@${name.toLowerCase()}`,
    rating: 1000,
    isAdmin: false,
    ...overrides
  };
}

test("insert выдаёт идентификатор через RETURNING", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  assert.ok(Number.isInteger(created.id));
  assert.equal(created.name, "Alpha");
  assert.equal(created.rating, 1000);
  assert.deepEqual(created.challengeCredits, []);
});

test("последовательные вставки получают разные идентификаторы", async () => {
  const first = await users.insert(client, newUser("Alpha"));
  const second = await users.insert(client, newUser("Bravo"));
  assert.notEqual(first.id, second.id);
});

test("параллельные вставки не конфликтуют по идентификатору", async () => {
  const names = ["A1", "B2", "C3", "D4", "E5"];
  const created = await Promise.all(
    names.map(async (name) => {
      const own = await pool.connect();
      try {
        return await users.insert(own, newUser(name));
      } finally {
        own.release();
      }
    })
  );
  const ids = created.map((user) => user.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("findByNameKey ищет без учёта регистра", async () => {
  await users.insert(client, newUser("Alpha"));
  const found = await users.findByNameKey(client, "alpha");
  assert.equal(found.name, "Alpha");
  assert.equal(await users.findByNameKey(client, "missing"), null);
});

test("isNameTaken умеет исключать самого пользователя", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  assert.equal(await users.isNameTaken(client, "alpha"), true);
  assert.equal(await users.isNameTaken(client, "alpha", created.id), false);
});

test("addRating меняет рейтинг относительно текущего", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await users.addRating(client, created.id, 16);
  await users.addRating(client, created.id, -4);
  assert.equal((await users.findById(client, created.id)).rating, 1012);
});

test("updateProfile меняет только переданные поля", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await users.updateProfile(client, created.id, { telegramContact: "@new" });
  const updated = await users.findById(client, created.id);

  assert.equal(updated.telegramContact, "@new");
  assert.equal(updated.name, "Alpha");
  assert.equal(updated.registerNickname, "Alpha");
  assert.ok(updated.updatedAt);
});

test("appendChallengeCredit добавляет запись, не затирая прежние", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await users.appendChallengeCredit(client, created.id, { team: "Kasrkin", action: "credit" });
  await users.appendChallengeCredit(client, created.id, { team: "Ratlings", action: "credit" });

  const updated = await users.findById(client, created.id);
  assert.equal(updated.challengeCredits.length, 2);
  assert.equal(updated.challengeCredits[1].team, "Ratlings");
});

test("listLeaderboard сортирует по рейтингу и не отдаёт контакты", async () => {
  await users.insert(client, newUser("Alpha", { rating: 900 }));
  await users.insert(client, newUser("Bravo", { rating: 1100 }));

  const list = await users.listLeaderboard(client);
  assert.deepEqual(list.map((user) => user.name), ["Bravo", "Alpha"]);
  assert.equal("telegramContact" in list[0], false);
  assert.equal("passwordHash" in list[0], false);
});

test("search ищет по имени, нику и телеграму, исключая себя", async () => {
  const alpha = await users.insert(client, newUser("Alpha"));
  await users.insert(client, newUser("Bravo", { telegramContact: "@findme" }));

  const byName = await users.search(client, { q: "bra", excludeId: alpha.id, limit: 10 });
  assert.deepEqual(byName.map((user) => user.name), ["Bravo"]);

  const byTelegram = await users.search(client, { q: "findme", excludeId: alpha.id, limit: 10 });
  assert.deepEqual(byTelegram.map((user) => user.name), ["Bravo"]);

  const all = await users.search(client, { q: "", excludeId: alpha.id, limit: 10 });
  assert.equal(all.some((user) => user.id === alpha.id), false);
});

test("hasAdmin и countAdmins считают администраторов", async () => {
  assert.equal(await users.hasAdmin(client), false);
  await users.insert(client, newUser("Alpha", { isAdmin: true }));
  assert.equal(await users.hasAdmin(client), true);
  assert.equal(await users.countAdmins(client), 1);
});

test("remove удаляет пользователя и его сессии", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await sessions.create(client, {
    token: "token-1",
    userId: created.id,
    expiresAt: new Date(Date.now() + 60000).toISOString()
  });

  await users.remove(client, created.id);
  assert.equal(await users.findById(client, created.id), null);
  assert.equal(await sessions.findActiveUser(client, "token-1"), null);
});

test("findActiveUser возвращает пользователя по действующему токену", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await sessions.create(client, {
    token: "token-live",
    userId: created.id,
    expiresAt: new Date(Date.now() + 60000).toISOString()
  });

  const found = await sessions.findActiveUser(client, "token-live");
  assert.equal(found.id, created.id);
  assert.equal(found.passwordHash, "salt:hash");
});

test("findActiveUser не возвращает пользователя по истёкшему токену", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await sessions.create(client, {
    token: "token-dead",
    userId: created.id,
    expiresAt: new Date(Date.now() - 1000).toISOString()
  });

  assert.equal(await sessions.findActiveUser(client, "token-dead"), null);
});

test("deleteExpired убирает только просроченные сессии", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await sessions.create(client, {
    token: "live",
    userId: created.id,
    expiresAt: new Date(Date.now() + 60000).toISOString()
  });
  await sessions.create(client, {
    token: "dead",
    userId: created.id,
    expiresAt: new Date(Date.now() - 1000).toISOString()
  });

  await sessions.deleteExpired(client);
  assert.ok(await sessions.findActiveUser(client, "live"));
  const { rows } = await client.query("SELECT token FROM sessions");
  assert.deepEqual(rows.map((row) => row.token), ["live"]);
});

test("findByIds читает пачкой, пропускает лишние и терпит пустой список", async () => {
  const alpha = await users.insert(client, newUser("Alpha"));
  const bravo = await users.insert(client, newUser("Bravo"));

  const found = await users.findByIds(client, [bravo.id, alpha.id, 9999]);
  assert.deepEqual(found.map((user) => user.id), [alpha.id, bravo.id]);
  assert.deepEqual(await users.findByIds(client, []), []);
});

test("lockByIds возвращает строки в порядке идентификаторов", async () => {
  const alpha = await users.insert(client, newUser("Alpha"));
  const bravo = await users.insert(client, newUser("Bravo"));

  await client.query("BEGIN");
  const locked = await users.lockByIds(client, [bravo.id, alpha.id]);
  await client.query("COMMIT");

  assert.deepEqual(locked.map((user) => user.id), [alpha.id, bravo.id]);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/integration/repositories-users.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/db/repositories/users'`.

- [ ] **Step 3: Написать общий модуль перевода строк**

Единственное место, где строка PostgreSQL превращается в доменный объект. Раньше `toIso` пришлось бы копировать в каждый из пяти репозиториев.

Create `src/db/rows.js`:

```js
const USER_COLUMNS = `
  id, name, name_key, password_hash, avatar_data, register_nickname,
  telegram_contact, challenge_credits, rating, is_admin, created_at, updated_at
`;

const CHALLENGE_COLUMNS = `
  id, from_user_id, to_user_id, status, game_id, share_token, created_at, updated_at
`;

const GAME_COLUMNS = `
  id, challenge_id, player_ids, status, created_at,
  submitted_by, submitted_at, pending_result, result, elo
`;

const FEEDBACK_COLUMNS = `
  id, user_id, screen, description, status, resolved_by, resolved_at, updated_at, created_at
`;

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    passwordHash: row.password_hash,
    avatarData: row.avatar_data || null,
    registerNickname: row.register_nickname || "",
    telegramContact: row.telegram_contact || "",
    challengeCredits: Array.isArray(row.challenge_credits) ? row.challenge_credits : [],
    rating: row.rating,
    isAdmin: row.is_admin,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    status: row.status,
    gameId: row.game_id,
    shareToken: row.share_token || null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapGame(row) {
  if (!row) return null;
  return {
    id: row.id,
    challengeId: row.challenge_id,
    playerIds: row.player_ids || [],
    status: row.status,
    createdAt: toIso(row.created_at),
    submittedBy: row.submitted_by,
    submittedAt: toIso(row.submitted_at),
    pendingResult: row.pending_result,
    result: row.result,
    elo: row.elo
  };
}

function mapFeedback(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    screen: row.screen,
    description: row.description,
    status: row.status || "open",
    resolvedBy: row.resolved_by,
    resolvedAt: toIso(row.resolved_at),
    updatedAt: toIso(row.updated_at),
    createdAt: toIso(row.created_at)
  };
}

module.exports = {
  USER_COLUMNS,
  CHALLENGE_COLUMNS,
  GAME_COLUMNS,
  FEEDBACK_COLUMNS,
  toIso,
  mapUser,
  mapChallenge,
  mapGame,
  mapFeedback
};
```

- [ ] **Step 4: Написать репозиторий users**

`lockByIds` сортирует идентификаторы перед блокировкой: одинаковый порядок захвата строк во всех запросах исключает взаимную блокировку двух транзакций.

Create `src/db/repositories/users.js`:

```js
const { USER_COLUMNS: COLUMNS, mapUser } = require("../rows");

function nameKeyOf(name) {
  return String(name || "").toLowerCase();
}

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return mapUser(rows[0]);
}

async function findByIds(client, ids) {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id));
  if (!unique.length) return [];
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users WHERE id = ANY($1::int[]) ORDER BY id`,
    [unique]
  );
  return rows.map(mapUser);
}

async function lockByIds(client, ids) {
  const ordered = [...new Set(ids)].filter((id) => Number.isInteger(id)).sort((a, b) => a - b);
  if (!ordered.length) return [];
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
    [ordered]
  );
  return rows.map(mapUser);
}

async function findByNameKey(client, nameKey) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users WHERE name_key = $1`,
    [nameKeyOf(nameKey)]
  );
  return mapUser(rows[0]);
}

async function isNameTaken(client, name, excludeId = null) {
  const { rows } = await client.query(
    `SELECT 1 FROM users WHERE name_key = $1 AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
    [nameKeyOf(name), excludeId]
  );
  return rows.length > 0;
}

async function listLeaderboard(client) {
  const { rows } = await client.query(
    `SELECT id, name, avatar_data, rating, is_admin
     FROM users ORDER BY rating DESC, name ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    avatarData: row.avatar_data || null,
    rating: row.rating,
    isAdmin: row.is_admin
  }));
}

async function listWithGameCounts(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS},
            (SELECT COUNT(*)::int FROM games
              WHERE games.status = 'completed' AND users.id = ANY(games.player_ids)) AS games_played
     FROM users ORDER BY rating DESC, name ASC`
  );
  return rows.map((row) => ({ ...mapUser(row), gamesPlayed: row.games_played }));
}

async function search(client, { q, excludeId, limit = 10 }) {
  const term = String(q || "").toLowerCase();
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users
     WHERE id <> $1
       AND ($2 = '' OR name_key LIKE '%' || $2 || '%'
            OR LOWER(COALESCE(register_nickname, '')) LIKE '%' || $2 || '%'
            OR LOWER(COALESCE(telegram_contact, '')) LIKE '%' || $2 || '%')
     ORDER BY rating DESC, name ASC
     LIMIT $3`,
    [excludeId, term, limit]
  );
  return rows.map(mapUser);
}

async function insert(client, user) {
  const { rows } = await client.query(
    `INSERT INTO users
       (name, name_key, password_hash, avatar_data, register_nickname,
        telegram_contact, challenge_credits, rating, is_admin)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      user.name,
      nameKeyOf(user.name),
      user.passwordHash,
      user.avatarData || null,
      user.registerNickname || null,
      user.telegramContact || null,
      JSON.stringify(user.challengeCredits || []),
      user.rating,
      Boolean(user.isAdmin)
    ]
  );
  return mapUser(rows[0]);
}

const PROFILE_COLUMNS = {
  name: "name",
  avatarData: "avatar_data",
  registerNickname: "register_nickname",
  telegramContact: "telegram_contact"
};

async function updateProfile(client, id, patch) {
  const assignments = [];
  const values = [id];

  for (const [field, column] of Object.entries(PROFILE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    values.push(patch[field]);
    assignments.push(`${column} = $${values.length}`);
    if (field === "name") {
      values.push(nameKeyOf(patch.name));
      assignments.push(`name_key = $${values.length}`);
    }
  }
  if (!assignments.length) return findById(client, id);

  const { rows } = await client.query(
    `UPDATE users SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    values
  );
  return mapUser(rows[0]);
}

async function setPasswordHash(client, id, passwordHash) {
  const { rows } = await client.query(
    `UPDATE users SET password_hash = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, passwordHash]
  );
  return mapUser(rows[0]);
}

async function addRating(client, id, delta) {
  const { rows } = await client.query(
    `UPDATE users SET rating = rating + $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, delta]
  );
  return mapUser(rows[0]);
}

async function setRating(client, id, rating) {
  const { rows } = await client.query(
    `UPDATE users SET rating = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, rating]
  );
  return mapUser(rows[0]);
}

async function setAdmin(client, id, isAdmin) {
  const { rows } = await client.query(
    `UPDATE users SET is_admin = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, Boolean(isAdmin)]
  );
  return mapUser(rows[0]);
}

async function appendChallengeCredit(client, id, credit) {
  const { rows } = await client.query(
    `UPDATE users
     SET challenge_credits = COALESCE(challenge_credits, '[]'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, JSON.stringify([credit])]
  );
  return mapUser(rows[0]);
}

async function remove(client, id) {
  await client.query("DELETE FROM games WHERE $1 = ANY(player_ids)", [id]);
  await client.query("DELETE FROM users WHERE id = $1", [id]);
}

async function countAdmins(client) {
  const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE is_admin");
  return rows[0].count;
}

async function hasAdmin(client) {
  return (await countAdmins(client)) > 0;
}

module.exports = {
  findById,
  findByIds,
  lockByIds,
  findByNameKey,
  isNameTaken,
  listLeaderboard,
  listWithGameCounts,
  search,
  insert,
  updateProfile,
  setPasswordHash,
  addRating,
  setRating,
  setAdmin,
  appendChallengeCredit,
  remove,
  countAdmins,
  hasAdmin
};
```

- [ ] **Step 5: Написать репозиторий sessions**

Create `src/db/repositories/sessions.js`:

```js
const { mapUser } = require("../rows");

const USER_COLUMNS = `
  u.id, u.name, u.name_key, u.password_hash, u.avatar_data, u.register_nickname,
  u.telegram_contact, u.challenge_credits, u.rating, u.is_admin, u.created_at, u.updated_at
`;

async function create(client, { token, userId, expiresAt }) {
  await client.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
  return token;
}

async function findActiveUser(client, token) {
  if (!token) return null;
  const { rows } = await client.query(
    `SELECT ${USER_COLUMNS}
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  return mapUser(rows[0]);
}

async function deleteByToken(client, token) {
  if (!token) return;
  await client.query("DELETE FROM sessions WHERE token = $1", [token]);
}

async function deleteByUserId(client, userId) {
  await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

async function deleteExpired(client) {
  await client.query("DELETE FROM sessions WHERE expires_at <= NOW()");
}

module.exports = { create, findActiveUser, deleteByToken, deleteByUserId, deleteExpired };
```

- [ ] **Step 6: Запустить тест и убедиться, что он проходит**

```bash
node --test test/integration/repositories-users.test.js
```

Ожидаемо: `pass 17`, `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/db/rows.js src/db/repositories/users.js src/db/repositories/sessions.js test/integration/repositories-users.test.js
git commit -m "feat: add users and sessions repositories"
```

---

### Task 12: Репозитории challenges, games и feedback

**Files:**
- Create: `src/db/repositories/challenges.js`
- Create: `src/db/repositories/games.js`
- Create: `src/db/repositories/feedback.js`
- Test: `test/integration/repositories-games.test.js`

**Interfaces:**
- Consumes: `src/db/repositories/users.js` (для подготовки данных в тестах).
- Produces:
  - `challenges.js` → `{ findById, lockById, findByShareToken, findPendingBetween, listForUser, insert, setStatus, attachGame }`
  - `games.js` → `{ findById, lockById, listCompleted, listCompletedForUser, listForUser, listActive, listPendingForUser, findActiveBetween, insert, savePendingResult, clearResult, saveFinalResult, cancel }`
  - `feedback.js` → `{ findById, listAll, insert, setStatus, remove }`
  - Доменная форма игры: `{ id, challengeId, playerIds, status, createdAt, submittedBy, submittedAt, pendingResult, result, elo }`.
  - Доменная форма челленджа: `{ id, fromUserId, toUserId, status, gameId, shareToken, createdAt, updatedAt }`.

- [ ] **Step 1: Написать падающий тест**

Create `test/integration/repositories-games.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const users = require("../../src/db/repositories/users");
const challenges = require("../../src/db/repositories/challenges");
const games = require("../../src/db/repositories/games");
const feedback = require("../../src/db/repositories/feedback");

let pool;
let client;
let alpha;
let bravo;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("TRUNCATE sessions, feedback, games, challenges, users RESTART IDENTITY CASCADE");
  client = await pool.connect();
  alpha = await users.insert(client, {
    name: "Alpha", passwordHash: "s:h", registerNickname: "", telegramContact: "@a",
    rating: 1000, isAdmin: true
  });
  bravo = await users.insert(client, {
    name: "Bravo", passwordHash: "s:h", registerNickname: "", telegramContact: "@b",
    rating: 1000, isAdmin: false
  });
});

test.afterEach(() => {
  client.release();
});

test("челлендж создаётся со статусом pending и share-токеном", async () => {
  const created = await challenges.insert(client, {
    fromUserId: alpha.id, toUserId: bravo.id, shareToken: "a".repeat(36)
  });
  assert.ok(Number.isInteger(created.id));
  assert.equal(created.status, "pending");
  assert.equal(created.shareToken, "a".repeat(36));
  assert.equal(created.gameId, null);
});

test("findByShareToken находит челлендж", async () => {
  const token = "b".repeat(36);
  await challenges.insert(client, { fromUserId: alpha.id, toUserId: bravo.id, shareToken: token });
  assert.ok(await challenges.findByShareToken(client, token));
  assert.equal(await challenges.findByShareToken(client, "c".repeat(36)), null);
});

test("share-токен уникален", async () => {
  const token = "d".repeat(36);
  await challenges.insert(client, { fromUserId: alpha.id, toUserId: bravo.id, shareToken: token });
  await assert.rejects(() =>
    challenges.insert(client, { fromUserId: bravo.id, toUserId: alpha.id, shareToken: token })
  );
});

test("findPendingBetween находит челлендж в обе стороны", async () => {
  await challenges.insert(client, {
    fromUserId: alpha.id, toUserId: bravo.id, shareToken: "e".repeat(36)
  });
  assert.ok(await challenges.findPendingBetween(client, alpha.id, bravo.id));
  assert.ok(await challenges.findPendingBetween(client, bravo.id, alpha.id));
});

test("setStatus и attachGame обновляют челлендж", async () => {
  const created = await challenges.insert(client, {
    fromUserId: alpha.id, toUserId: bravo.id, shareToken: "f".repeat(36)
  });
  const game = await games.insert(client, {
    challengeId: created.id, playerIds: [alpha.id, bravo.id]
  });

  const attached = await challenges.attachGame(client, created.id, game.id);
  assert.equal(attached.gameId, game.id);

  const declined = await challenges.setStatus(client, created.id, "declined");
  assert.equal(declined.status, "declined");
  assert.ok(declined.updatedAt);
});

test("игра создаётся открытой и с пустым результатом", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  assert.equal(game.status, "open");
  assert.deepEqual(game.playerIds, [alpha.id, bravo.id]);
  assert.equal(game.result, null);
  assert.equal(game.pendingResult, null);
  assert.equal(game.elo, null);
});

test("savePendingResult переводит игру в ожидание подтверждения", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const result = { winnerId: alpha.id, scores: {}, killzone: null, tiebreakers: null };

  const updated = await games.savePendingResult(client, game.id, {
    submittedBy: alpha.id,
    pendingResult: { submittedBy: alpha.id, submittedAt: "2026-01-01T00:00:00.000Z", result }
  });

  assert.equal(updated.status, "pending_confirmation");
  assert.equal(updated.submittedBy, alpha.id);
  assert.ok(updated.submittedAt);
  assert.equal(updated.pendingResult.result.winnerId, alpha.id);
  assert.equal(updated.result, null);
});

test("saveFinalResult завершает игру и сохраняет Elo", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const result = { winnerId: alpha.id, scores: {}, killzone: null, tiebreakers: null };
  const elo = { k: 32, [alpha.id]: { before: 1000, after: 1016, delta: 16 } };

  const finished = await games.saveFinalResult(client, game.id, { result, elo });
  assert.equal(finished.status, "completed");
  assert.equal(finished.pendingResult, null);
  assert.equal(finished.elo[alpha.id].delta, 16);
});

test("clearResult возвращает игру в открытое состояние", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await games.savePendingResult(client, game.id, {
    submittedBy: alpha.id,
    pendingResult: { submittedBy: alpha.id, submittedAt: "2026-01-01T00:00:00.000Z", result: {} }
  });

  const cleared = await games.clearResult(client, game.id);
  assert.equal(cleared.status, "open");
  assert.equal(cleared.submittedBy, null);
  assert.equal(cleared.submittedAt, null);
  assert.equal(cleared.pendingResult, null);
});

test("cancel отменяет игру", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const cancelled = await games.cancel(client, game.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.result, null);
  assert.equal(cancelled.elo, null);
});

test("findActiveBetween видит открытые и ожидающие игры, но не завершённые", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  assert.ok(await games.findActiveBetween(client, alpha.id, bravo.id));

  await games.saveFinalResult(client, game.id, { result: { winnerId: alpha.id }, elo: {} });
  assert.equal(await games.findActiveBetween(client, alpha.id, bravo.id), null);
});

test("listCompleted отдаёт только завершённые, свежие первыми", async () => {
  const first = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const second = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });

  await games.saveFinalResult(client, first.id, { result: { winnerId: alpha.id }, elo: {} });
  await games.saveFinalResult(client, second.id, { result: { winnerId: bravo.id }, elo: {} });

  const list = await games.listCompleted(client);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, second.id);
});

test("lockById блокирует строку игры", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await client.query("BEGIN");
  const locked = await games.lockById(client, game.id);
  assert.equal(locked.id, game.id);
  await client.query("COMMIT");
});

test("feedback создаётся, меняет статус и удаляется", async () => {
  const created = await feedback.insert(client, {
    userId: alpha.id, screen: "Leaderboard", description: "Broken"
  });
  assert.equal(created.status, "open");

  const resolved = await feedback.setStatus(client, created.id, "resolved", alpha.id);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolvedBy, alpha.id);
  assert.ok(resolved.resolvedAt);

  const reopened = await feedback.setStatus(client, created.id, "open", alpha.id);
  assert.equal(reopened.resolvedBy, null);
  assert.equal(reopened.resolvedAt, null);

  await feedback.remove(client, created.id);
  assert.equal(await feedback.findById(client, created.id), null);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/integration/repositories-games.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/db/repositories/challenges'`.

- [ ] **Step 3: Написать репозиторий challenges**

Create `src/db/repositories/challenges.js`:

```js
const { CHALLENGE_COLUMNS: COLUMNS, mapChallenge } = require("../rows");

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM challenges WHERE id = $1`, [id]);
  return mapChallenge(rows[0]);
}

async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM challenges WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return mapChallenge(rows[0]);
}

async function findByShareToken(client, token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (!/^[a-f0-9]{36}$/.test(normalized)) return null;
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM challenges WHERE share_token = $1 FOR UPDATE`,
    [normalized]
  );
  return mapChallenge(rows[0]);
}

async function findPendingBetween(client, userId, otherUserId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM challenges
     WHERE status = 'pending'
       AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))
     LIMIT 1`,
    [userId, otherUserId]
  );
  return mapChallenge(rows[0]);
}

async function listForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM challenges
     WHERE from_user_id = $1 OR to_user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows.map(mapChallenge);
}

async function insert(client, { fromUserId, toUserId, shareToken }) {
  const { rows } = await client.query(
    `INSERT INTO challenges (from_user_id, to_user_id, status, share_token)
     VALUES ($1, $2, 'pending', $3)
     RETURNING ${COLUMNS}`,
    [fromUserId, toUserId, shareToken]
  );
  return mapChallenge(rows[0]);
}

async function setStatus(client, id, status) {
  const { rows } = await client.query(
    `UPDATE challenges SET status = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status]
  );
  return mapChallenge(rows[0]);
}

async function attachGame(client, id, gameId) {
  const { rows } = await client.query(
    `UPDATE challenges SET game_id = $2, status = 'accepted', updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, gameId]
  );
  return mapChallenge(rows[0]);
}

module.exports = {
  findById,
  lockById,
  findByShareToken,
  findPendingBetween,
  listForUser,
  insert,
  setStatus,
  attachGame
};
```

- [ ] **Step 4: Написать репозиторий games**

Create `src/db/repositories/games.js`:

```js
const { GAME_COLUMNS: COLUMNS, mapGame } = require("../rows");

// Единственное объявление набора активных статусов. src/api/games.js импортирует его отсюда.
const ACTIVE_STATUSES = ["open", "pending_confirmation"];

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM games WHERE id = $1`, [id]);
  return mapGame(rows[0]);
}

async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return mapGame(rows[0]);
}

async function listCompleted(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games WHERE status = 'completed'
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`
  );
  return rows.map(mapGame);
}

async function listCompletedForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = 'completed' AND $1 = ANY(player_ids)
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`,
    [userId]
  );
  return rows.map(mapGame);
}

async function listForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games WHERE $1 = ANY(player_ids)
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows.map(mapGame);
}

async function listActive(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games WHERE status = ANY($1::text[])
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`,
    [ACTIVE_STATUSES]
  );
  return rows.map(mapGame);
}

async function listPendingForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = 'pending_confirmation' AND $1 = ANY(player_ids)
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`,
    [userId]
  );
  return rows.map(mapGame);
}

async function findActiveBetween(client, userId, otherUserId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = ANY($3::text[]) AND $1 = ANY(player_ids) AND $2 = ANY(player_ids)
     LIMIT 1`,
    [userId, otherUserId, ACTIVE_STATUSES]
  );
  return mapGame(rows[0]);
}

async function insert(client, { challengeId, playerIds }) {
  const { rows } = await client.query(
    `INSERT INTO games (challenge_id, player_ids, status)
     VALUES ($1, $2, 'open') RETURNING ${COLUMNS}`,
    [challengeId || null, playerIds]
  );
  return mapGame(rows[0]);
}

async function savePendingResult(client, id, { submittedBy, pendingResult }) {
  const { rows } = await client.query(
    `UPDATE games
     SET status = 'pending_confirmation',
         submitted_by = $2,
         submitted_at = NOW(),
         pending_result = $3::jsonb,
         result = NULL,
         elo = NULL
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, submittedBy, JSON.stringify(pendingResult)]
  );
  return mapGame(rows[0]);
}

async function clearResult(client, id) {
  const { rows } = await client.query(
    `UPDATE games
     SET status = 'open', submitted_by = NULL, submitted_at = NULL,
         pending_result = NULL, result = NULL, elo = NULL
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id]
  );
  return mapGame(rows[0]);
}

async function saveFinalResult(client, id, { result, elo, submittedBy = null }) {
  const { rows } = await client.query(
    `UPDATE games
     SET status = 'completed',
         result = $2::jsonb,
         elo = $3::jsonb,
         pending_result = NULL,
         submitted_by = COALESCE($4, submitted_by),
         submitted_at = COALESCE(submitted_at, NOW())
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, JSON.stringify(result), JSON.stringify(elo), submittedBy]
  );
  return mapGame(rows[0]);
}

async function cancel(client, id) {
  const { rows } = await client.query(
    `UPDATE games
     SET status = 'cancelled', submitted_by = NULL, submitted_at = NULL,
         pending_result = NULL, result = NULL, elo = NULL
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id]
  );
  return mapGame(rows[0]);
}

module.exports = {
  ACTIVE_STATUSES,
  findById,
  lockById,
  listCompleted,
  listCompletedForUser,
  listForUser,
  listActive,
  listPendingForUser,
  findActiveBetween,
  insert,
  savePendingResult,
  clearResult,
  saveFinalResult,
  cancel
};
```

- [ ] **Step 5: Написать репозиторий feedback**

Create `src/db/repositories/feedback.js`:

```js
const { FEEDBACK_COLUMNS: COLUMNS, mapFeedback } = require("../rows");

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM feedback WHERE id = $1`, [id]);
  return mapFeedback(rows[0]);
}

async function listAll(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM feedback ORDER BY created_at DESC, id DESC`
  );
  return rows.map(mapFeedback);
}

async function insert(client, { userId, screen, description }) {
  const { rows } = await client.query(
    `INSERT INTO feedback (user_id, screen, description, status)
     VALUES ($1, $2, $3, 'open') RETURNING ${COLUMNS}`,
    [userId, screen, description]
  );
  return mapFeedback(rows[0]);
}

async function setStatus(client, id, status, adminId) {
  const resolved = status === "resolved";
  const { rows } = await client.query(
    `UPDATE feedback
     SET status = $2,
         resolved_by = CASE WHEN $3 THEN $4::int ELSE NULL END,
         resolved_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, resolved ? "resolved" : "open", resolved, adminId]
  );
  return mapFeedback(rows[0]);
}

async function remove(client, id) {
  await client.query("DELETE FROM feedback WHERE id = $1", [id]);
}

module.exports = { findById, listAll, insert, setStatus, remove };
```

- [ ] **Step 6: Запустить тест и убедиться, что он проходит**

```bash
node --test test/integration/repositories-games.test.js
```

Ожидаемо: `pass 14`, `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/db/repositories/ test/integration/repositories-games.test.js
git commit -m "feat: add challenges, games and feedback repositories"
```

---

### Task 13: Слой представлений

Закрывает D4: `challengeCredits` уезжает в каждом объекте игрока, хотя во фронтенде поле не используется ни разу; `avatarData` ограничивается лимитом только в `/api/users`, а в `gameView` идёт целиком, до 1 МБ base64 на игрока на игру.

**Files:**
- Create: `src/api/views.js`
- Test: `test/unit/views.test.js`

**Interfaces:**
- Consumes: `src/config.js` → `MAX_AVATAR_DATA_URL_LENGTH`; `src/domain/challenge-progress.js`; `src/domain/kill-teams.js`.
- Produces: `src/api/views.js` → `{ publicUser, publicUserSummary, leaderboardUser, challengeView, gameView, feedbackView, challengeProgressView, userSummary, publicProfileSummary }`.
  - `challengeProgressView(games, user)` возвращает прежнюю форму: поля классифицированного трека на верхнем уровне плюс `tracks: { classified, allKillTeam }`, и в каждом треке — поле `user`.

- [ ] **Step 1: Написать падающий тест**

Create `test/unit/views.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  publicUser,
  publicUserSummary,
  leaderboardUser,
  challengeView,
  gameView,
  feedbackView,
  challengeProgressView
} = require("../../src/api/views");

function user(overrides = {}) {
  return {
    id: 1,
    name: "Alpha",
    passwordHash: "salt:hash",
    avatarData: "data:image/png;base64,AAA=",
    registerNickname: "Alpha",
    telegramContact: "@alpha",
    challengeCredits: [{ team: "Kasrkin", action: "credit" }],
    rating: 1000,
    isAdmin: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

test("publicUser никогда не отдаёт хеш пароля", () => {
  assert.equal("passwordHash" in publicUser(user()), false);
});

test("publicUser не отдаёт challengeCredits", () => {
  assert.equal("challengeCredits" in publicUser(user()), false);
});

test("publicUser отбрасывает переросший аватар", () => {
  const big = `data:image/png;base64,${"A".repeat(1024 * 1024 + 10)}`;
  assert.equal(publicUser(user({ avatarData: big })).avatarData, null);
  assert.ok(publicUser(user()).avatarData);
});

test("leaderboardUser не содержит контактов", () => {
  const row = leaderboardUser(user());
  assert.deepEqual(Object.keys(row).sort(), ["avatarData", "id", "isAdmin", "name", "rating"]);
});

test("publicUserSummary сохраняет контакты для авторизованных представлений", () => {
  const summary = publicUserSummary(user());
  assert.equal(summary.telegramContact, "@alpha");
  assert.equal(summary.registerNickname, "Alpha");
  assert.equal("passwordHash" in summary, false);
  assert.equal("challengeCredits" in summary, false);
});

test("challengeView подставляет участников", () => {
  const challenge = {
    id: 5, fromUserId: 1, toUserId: 2, status: "pending", gameId: null,
    shareToken: "x".repeat(36), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null
  };
  const view = challengeView(challenge, [user(), user({ id: 2, name: "Bravo" })]);

  assert.equal(view.id, 5);
  assert.equal(view.from.name, "Alpha");
  assert.equal(view.to.name, "Bravo");
  assert.equal(view.gameId, null);
  assert.equal(view.shareToken, "x".repeat(36));
});

test("challengeView не падает на удалённых участниках", () => {
  const challenge = { id: 5, fromUserId: 1, toUserId: 99, status: "pending", gameId: null };
  const view = challengeView(challenge, [user()]);
  assert.equal(view.to, null);
});

test("gameView подставляет игроков и не тащит их кредиты", () => {
  const game = { id: 7, playerIds: [1, 2], status: "open", result: null };
  const view = gameView(game, [user(), user({ id: 2, name: "Bravo" })]);

  assert.equal(view.players.length, 2);
  assert.equal("challengeCredits" in view.players[0], false);
  assert.equal("passwordHash" in view.players[0], false);
});

test("feedbackView подставляет автора и закрывшего", () => {
  const item = { id: 3, userId: 1, screen: "Top", description: "x", status: "resolved", resolvedBy: 2 };
  const view = feedbackView(item, [user(), user({ id: 2, name: "Bravo" })]);

  assert.equal(view.user.name, "Alpha");
  assert.equal(view.resolvedByUser.name, "Bravo");
});

test("challengeProgressView сохраняет прежнюю форму ответа", () => {
  const view = challengeProgressView([], user({ challengeCredits: [] }));

  assert.ok(Array.isArray(view.teams));
  assert.equal(typeof view.total, "number");
  assert.equal(typeof view.completedCount, "number");
  assert.ok(view.tracks.classified);
  assert.ok(view.tracks.allKillTeam);
  assert.equal(view.user.id, 1);
  assert.equal(view.tracks.classified.user.id, 1);
  assert.equal(view.tracks.allKillTeam.user.id, 1);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/unit/views.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/api/views'`.

- [ ] **Step 3: Написать реализацию**

Create `src/api/views.js`:

```js
const { MAX_AVATAR_DATA_URL_LENGTH } = require("../config");
const { buildChallengeTracks } = require("../domain/challenge-progress");

function safeAvatar(value) {
  if (!value || value.length > MAX_AVATAR_DATA_URL_LENGTH) return null;
  return value;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    avatarData: safeAvatar(user.avatarData),
    registerNickname: user.registerNickname || "",
    telegramContact: user.telegramContact || "",
    rating: user.rating,
    isAdmin: Boolean(user.isAdmin),
    createdAt: user.createdAt
  };
}

function publicUserSummary(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    registerNickname: user.registerNickname || "",
    telegramContact: user.telegramContact || "",
    rating: user.rating,
    isAdmin: Boolean(user.isAdmin),
    createdAt: user.createdAt
  };
}

function leaderboardUser(user) {
  return {
    id: user.id,
    name: user.name,
    avatarData: safeAvatar(user.avatarData),
    rating: user.rating,
    isAdmin: Boolean(user.isAdmin)
  };
}

function findUser(people, id) {
  return people.find((person) => person.id === id) || null;
}

function challengeView(challenge, people) {
  return {
    ...challenge,
    from: publicUser(findUser(people, challenge.fromUserId)),
    to: publicUser(findUser(people, challenge.toUserId)),
    gameId: challenge.gameId || null
  };
}

function gameView(game, people) {
  return {
    ...game,
    players: (game.playerIds || [])
      .map((id) => findUser(people, id))
      .filter(Boolean)
      .map(publicUser)
  };
}

function feedbackView(item, people) {
  return {
    ...item,
    status: item.status || "open",
    user: publicUser(findUser(people, item.userId)),
    resolvedByUser: publicUser(findUser(people, item.resolvedBy))
  };
}

function challengeProgressView(games, user) {
  const view = publicUserSummary(user);
  const tracks = buildChallengeTracks(games, user);
  const classified = { user: view, ...tracks.classified };
  const allKillTeam = { user: view, ...tracks.allKillTeam };
  return { ...classified, tracks: { classified, allKillTeam } };
}

function userSummary({ user, hasAdmin, challenges, games, people }) {
  return {
    user: publicUser(user),
    hasAdmin,
    challenges: challenges.map((challenge) => challengeView(challenge, people)),
    games: games.map((game) => gameView(game, people))
  };
}

function publicProfileSummary({
  user,
  completedGames,
  people,
  activeGame,
  pendingChallenge,
  adminPendingGames,
  allGamesForProgress
}) {
  const wins = completedGames.filter((game) => game.result?.winnerId === user.id).length;
  const draws = completedGames.filter((game) => game.result && !game.result.winnerId).length;
  const losses = completedGames.filter(
    (game) => game.result?.winnerId && game.result.winnerId !== user.id
  ).length;
  const eloDelta = completedGames.reduce(
    (sum, game) => sum + Number(game.elo?.[user.id]?.delta || 0),
    0
  );
  const winRate = completedGames.length
    ? Math.round((wins / completedGames.length) * 100)
    : 0;

  return {
    user: publicUser(user),
    stats: { matches: completedGames.length, wins, draws, losses, eloDelta, winRate },
    challengeProgress: challengeProgressView(allGamesForProgress, user),
    activeMatchup: {
      game: activeGame ? gameView(activeGame, people) : null,
      challenge: pendingChallenge ? challengeView(pendingChallenge, people) : null
    },
    pendingGames: adminPendingGames.map((game) => gameView(game, people)),
    recentGames: completedGames.slice(0, 5).map((game) => gameView(game, people))
  };
}

module.exports = {
  publicUser,
  publicUserSummary,
  leaderboardUser,
  challengeView,
  gameView,
  feedbackView,
  challengeProgressView,
  userSummary,
  publicProfileSummary
};
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/unit/views.test.js
```

Ожидаемо: `pass 10`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/api/views.js test/unit/views.test.js
git commit -m "feat: add view layer and drop unused credits from payloads"
```

---

### Task 14: Маршруты аутентификации

**Files:**
- Create: `src/api/auth.js`
- Test: `test/integration/api-auth.test.js`

**Interfaces:**
- Consumes: репозитории `users`, `sessions`, `challenges`, `games`; `src/domain/passwords.js`, `src/domain/validation.js`; `src/api/views.js`; `src/http/io.js`; `src/config.js`.
- Produces: `src/api/auth.js` → `{ me, updateMe, register, setupAdmin, login, logout, loadUserFromRequest(client, req), buildUserSummary(client, user) }`.
  `loadUserFromRequest` передаётся роутеру как `deps.loadUser` в задаче 18.

- [ ] **Step 1: Написать падающий тест**

Create `test/integration/api-auth.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const auth = require("../../src/api/auth");
const users = require("../../src/db/repositories/users");
const { HttpError } = require("../../src/http/io");

let pool;
let client;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("TRUNCATE sessions, feedback, games, challenges, users RESTART IDENTITY CASCADE");
  client = await pool.connect();
});

test.afterEach(() => {
  client.release();
});

function body(name, overrides = {}) {
  return {
    name,
    password: "password123",
    confirmPassword: "password123",
    telegramContact: `@${name.toLowerCase()}`,
    registerNickname: name,
    ...overrides
  };
}

function requestWithCookie(token) {
  return { headers: { cookie: `sid=${token}` } };
}

test("регистрация возвращает 201 и ставит cookie", async () => {
  const result = await auth.register({ client, body: body("Alpha") });

  assert.equal(result.status, 201);
  assert.equal(result.body.user.name, "Alpha");
  assert.equal(result.body.user.isAdmin, true);
  assert.ok(result.headers["Set-Cookie"].startsWith("sid="));
  assert.ok(result.headers["Set-Cookie"].includes("HttpOnly"));
  assert.ok(result.headers["Set-Cookie"].includes("SameSite=Lax"));
});

test("хеш пароля не попадает в ответ", async () => {
  const result = await auth.register({ client, body: body("Alpha") });
  assert.ok(!JSON.stringify(result.body).includes("passwordHash"));
});

test("второй пользователь администратором не становится", async () => {
  await auth.register({ client, body: body("Alpha") });
  const second = await auth.register({ client, body: body("Bravo") });
  assert.equal(second.body.user.isAdmin, false);
});

test("занятое имя отклоняется с 409", async () => {
  await auth.register({ client, body: body("Alpha") });
  await assert.rejects(
    () => auth.register({ client, body: body("alpha") }),
    (err) => err instanceof HttpError && err.status === 409
  );
});

test("короткий пароль и несовпадение отклоняются", async () => {
  await assert.rejects(
    () => auth.register({ client, body: body("Alpha", { password: "12345", confirmPassword: "12345" }) }),
    (err) => err.status === 400
  );
  await assert.rejects(
    () => auth.register({ client, body: body("Alpha", { confirmPassword: "other12345" }) }),
    (err) => err.status === 400
  );
});

test("Telegram обязателен", async () => {
  await assert.rejects(
    () => auth.register({ client, body: body("Alpha", { telegramContact: "" }) }),
    (err) => err.status === 400
  );
});

test("setup-admin требует пароль от 8 символов и работает только пока админов нет", async () => {
  await assert.rejects(
    () => auth.setupAdmin({ client, body: body("Root", { password: "1234567", confirmPassword: "1234567" }) }),
    (err) => err.status === 400
  );

  const created = await auth.setupAdmin({
    client,
    body: body("Root", { password: "password1234", confirmPassword: "password1234" })
  });
  assert.equal(created.body.user.isAdmin, true);

  await assert.rejects(
    () => auth.setupAdmin({ client, body: body("Second", { password: "password1234", confirmPassword: "password1234" }) }),
    (err) => err.status === 409
  );
});

test("вход по верному паролю выдаёт сессию", async () => {
  await auth.register({ client, body: body("Alpha") });
  const result = await auth.login({ client, body: { name: "alpha", password: "password123" } });

  assert.equal(result.status, 200);
  assert.equal(result.body.user.name, "Alpha");
  assert.ok(result.headers["Set-Cookie"].startsWith("sid="));
});

test("неверный пароль и неизвестное имя дают один и тот же 401", async () => {
  await auth.register({ client, body: body("Alpha") });

  const wrongPassword = await auth
    .login({ client, body: { name: "Alpha", password: "nope" } })
    .catch((err) => err);
  const unknownName = await auth
    .login({ client, body: { name: "Ghost", password: "nope" } })
    .catch((err) => err);

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownName.status, 401);
  assert.equal(wrongPassword.message, unknownName.message);
});

test("loadUserFromRequest узнаёт пользователя по cookie", async () => {
  const registered = await auth.register({ client, body: body("Alpha") });
  const token = /sid=([^;]+)/.exec(registered.headers["Set-Cookie"])[1];

  const loaded = await auth.loadUserFromRequest(client, requestWithCookie(token));
  assert.equal(loaded.name, "Alpha");

  assert.equal(await auth.loadUserFromRequest(client, { headers: {} }), null);
  assert.equal(await auth.loadUserFromRequest(client, requestWithCookie("bogus")), null);
});

test("logout гасит сессию и обнуляет cookie", async () => {
  const registered = await auth.register({ client, body: body("Alpha") });
  const token = /sid=([^;]+)/.exec(registered.headers["Set-Cookie"])[1];

  const result = await auth.logout({ client, req: requestWithCookie(token) });
  assert.equal(result.body.ok, true);
  assert.ok(result.headers["Set-Cookie"].includes("Max-Age=0"));
  assert.equal(await auth.loadUserFromRequest(client, requestWithCookie(token)), null);
});

test("me без сессии сообщает только о наличии администратора", async () => {
  const empty = await auth.me({ client, user: null });
  assert.equal(empty.user, null);
  assert.equal(empty.hasAdmin, false);

  await auth.register({ client, body: body("Alpha") });
  const withAdmin = await auth.me({ client, user: null });
  assert.equal(withAdmin.hasAdmin, true);
});

test("updateMe меняет профиль и требует текущий пароль для смены пароля", async () => {
  await auth.register({ client, body: body("Alpha") });
  const user = await users.findByNameKey(client, "alpha");

  const renamed = await auth.updateMe({ client, user, body: { name: "Alpha Two" } });
  assert.equal(renamed.user.name, "Alpha Two");

  const fresh = await users.findById(client, user.id);
  await assert.rejects(
    () => auth.updateMe({ client, user: fresh, body: { currentPassword: "wrong", newPassword: "brandnew1" } }),
    (err) => err.status === 401
  );

  await auth.updateMe({
    client,
    user: fresh,
    body: { currentPassword: "password123", newPassword: "brandnew1" }
  });
  const after = await users.findById(client, user.id);
  const { verifyPassword } = require("../../src/domain/passwords");
  assert.equal(await verifyPassword("brandnew1", after.passwordHash), true);
});

test("updateMe отклоняет занятое имя", async () => {
  await auth.register({ client, body: body("Alpha") });
  await auth.register({ client, body: body("Bravo") });
  const alpha = await users.findByNameKey(client, "alpha");

  await assert.rejects(
    () => auth.updateMe({ client, user: alpha, body: { name: "Bravo" } }),
    (err) => err.status === 409
  );
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/integration/api-auth.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/api/auth'`.

- [ ] **Step 3: Написать реализацию**

Вход отвечает одинаковым сообщением на неизвестное имя и на неверный пароль, чтобы не подтверждать существование учётной записи.

Create `src/api/auth.js`:

```js
const crypto = require("node:crypto");

const { SESSION_TTL_MS, INITIAL_RATING, COOKIE_SECURE } = require("../config");
const { HttpError, ValidationError, parseCookies, sessionCookie, clearedSessionCookie } =
  require("../http/io");
const users = require("../db/repositories/users");
const sessions = require("../db/repositories/sessions");
const challenges = require("../db/repositories/challenges");
const games = require("../db/repositories/games");
const { hashPassword, verifyPassword } = require("../domain/passwords");
const {
  requireName,
  profileText,
  requiredProfileText,
  validateAvatarData
} = require("../domain/validation");
const { userSummary } = require("./views");

async function loadUserFromRequest(client, req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  return sessions.findActiveUser(client, token);
}

async function startSession(client, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await sessions.deleteExpired(client);
  await sessions.create(client, { token, userId, expiresAt });
  return token;
}

async function buildUserSummary(client, user) {
  const [userChallenges, userGames] = await Promise.all([
    challenges.listForUser(client, user.id),
    games.listForUser(client, user.id)
  ]);

  const peopleIds = new Set([user.id]);
  for (const challenge of userChallenges) {
    peopleIds.add(challenge.fromUserId);
    peopleIds.add(challenge.toUserId);
  }
  for (const game of userGames) {
    for (const id of game.playerIds) peopleIds.add(id);
  }

  const people = await users.findByIds(client, [...peopleIds]);
  const hasAdmin = await users.hasAdmin(client);

  return userSummary({
    user,
    hasAdmin,
    challenges: userChallenges,
    games: userGames,
    people
  });
}

function readCredentials(body, minPasswordLength, tooShortMessage) {
  const name = requireName(body.name);
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  const registerNickname = profileText(body.registerNickname, "Register Nickname", 40);
  const telegramContact = requiredProfileText(body.telegramContact, "Telegram Contact", 80);

  if (password.length < minPasswordLength) throw new ValidationError(tooShortMessage);
  if (password !== confirmPassword) throw new ValidationError("Passwords do not match");

  return { name, password, registerNickname, telegramContact };
}

async function createAccount(client, credentials, isAdmin) {
  if (await users.isNameTaken(client, credentials.name)) {
    throw new HttpError(409, "This name is already taken");
  }

  const user = await users.insert(client, {
    name: credentials.name,
    passwordHash: await hashPassword(credentials.password),
    avatarData: null,
    registerNickname: credentials.registerNickname,
    telegramContact: credentials.telegramContact,
    challengeCredits: [],
    rating: INITIAL_RATING,
    isAdmin
  });

  const token = await startSession(client, user.id);
  return {
    status: 201,
    body: await buildUserSummary(client, user),
    headers: { "Set-Cookie": sessionCookie(token, SESSION_TTL_MS, COOKIE_SECURE) }
  };
}

async function me({ client, user }) {
  if (!user) {
    return { user: null, hasAdmin: await users.hasAdmin(client) };
  }
  return buildUserSummary(client, user);
}

async function updateMe({ client, user, body }) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = requireName(body.name);
    if (await users.isNameTaken(client, name, user.id)) {
      throw new HttpError(409, "This name is already taken");
    }
    patch.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body, "avatarData")) {
    patch.avatarData = validateAvatarData(body.avatarData);
  }
  if (Object.prototype.hasOwnProperty.call(body, "registerNickname")) {
    patch.registerNickname = profileText(body.registerNickname, "Register Nickname", 40);
  }
  if (Object.prototype.hasOwnProperty.call(body, "telegramContact")) {
    patch.telegramContact = requiredProfileText(body.telegramContact, "Telegram Contact", 80);
  }

  let updated = Object.keys(patch).length
    ? await users.updateProfile(client, user.id, patch)
    : user;

  if (body.currentPassword || body.newPassword) {
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(401, "Current password is incorrect");
    }
    if (newPassword.length < 6) {
      throw new ValidationError("New password must be at least 6 characters");
    }
    updated = await users.setPasswordHash(client, user.id, await hashPassword(newPassword));
  }

  return buildUserSummary(client, updated);
}

async function register({ client, body }) {
  const credentials = readCredentials(body, 6, "Password must be at least 6 characters");
  const isFirstAdmin = !(await users.hasAdmin(client));
  return createAccount(client, credentials, isFirstAdmin);
}

async function setupAdmin({ client, body }) {
  if (await users.hasAdmin(client)) {
    throw new HttpError(409, "An administrator already exists");
  }
  const credentials = readCredentials(
    body,
    8,
    "Administrator password must be at least 8 characters"
  );
  return createAccount(client, credentials, true);
}

// Заглушка нужной длины: verifyPassword на ней действительно считает scrypt,
// поэтому время ответа не выдаёт, существует ли учётная запись.
const ABSENT_USER_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

async function login({ client, body }) {
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  const user = await users.findByNameKey(client, name);
  const stored = user ? user.passwordHash : ABSENT_USER_HASH;
  const matches = await verifyPassword(String(body.password || ""), stored);

  if (!user || !matches) {
    throw new HttpError(401, "Invalid name or password");
  }

  const token = await startSession(client, user.id);
  return {
    status: 200,
    body: await buildUserSummary(client, user),
    headers: { "Set-Cookie": sessionCookie(token, SESSION_TTL_MS, COOKIE_SECURE) }
  };
}

async function logout({ client, req }) {
  await sessions.deleteByToken(client, parseCookies(req).sid);
  return {
    status: 200,
    body: { ok: true },
    headers: { "Set-Cookie": clearedSessionCookie(COOKIE_SECURE) }
  };
}

module.exports = {
  loadUserFromRequest,
  buildUserSummary,
  me,
  updateMe,
  register,
  setupAdmin,
  login,
  logout
};
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/integration/api-auth.test.js
```

Ожидаемо: `pass 14`, `fail 0`.

Заметка про `login`: на неизвестном имени всё равно вызывается `verifyPassword` с заглушкой `ABSENT_USER_HASH`, чтобы время ответа не выдавало существование учётной записи. Заглушка имеет правильную длину (128 hex-символов, 64 байта), поэтому `verifyPassword` реально считает scrypt, а не отсекает значение по длине; совпасть с настоящим паролем она не может, так как это нулевой ключ при нулевой соли.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.js test/integration/api-auth.test.js
git commit -m "feat: add transactional auth handlers"
```

---

### Task 15: Маршруты пользователей

Закрывает B1 (`GET /api/users` без авторизации отдаёт Telegram всех игроков) и D5 (пустая выборка поиска отвечает `404`).

**Files:**
- Create: `src/api/users.js`
- Test: `test/integration/api-users.test.js`

**Interfaces:**
- Consumes: репозитории `users`, `games`, `challenges`; `src/api/views.js`; `src/http/io.js`.
- Produces: `src/api/users.js` → `{ list, search, profile, challengeProgress }`.

**Изменения контракта:**
- `GET /api/users` отдаёт `{id, name, avatarData, rating, isAdmin}` — без `telegramContact`, `registerNickname` и `createdAt`. Лидерборд во фронтенде рендерит только имя и рейтинг, поэтому правок `app.js` не требуется.
- `GET /api/users/search` без совпадений отдаёт `200 { users: [] }` вместо `404`. Фронтенд покажет «No players found.» — ветка пустого результата в `renderSearchResults` уже существует.

- [ ] **Step 1: Написать падающий тест**

Create `test/integration/api-users.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const api = require("../../src/api/users");
const usersRepo = require("../../src/db/repositories/users");
const gamesRepo = require("../../src/db/repositories/games");

let pool;
let client;
let alpha;
let bravo;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("TRUNCATE sessions, feedback, games, challenges, users RESTART IDENTITY CASCADE");
  client = await pool.connect();
  alpha = await usersRepo.insert(client, {
    name: "Alpha", passwordHash: "s:h", registerNickname: "AlphaNick",
    telegramContact: "@alpha", rating: 1200, isAdmin: true
  });
  bravo = await usersRepo.insert(client, {
    name: "Bravo", passwordHash: "s:h", registerNickname: "BravoNick",
    telegramContact: "@bravo", rating: 900, isAdmin: false
  });
});

test.afterEach(() => {
  client.release();
});

test("список отсортирован по рейтингу", async () => {
  const result = await api.list({ client });
  assert.deepEqual(result.users.map((user) => user.name), ["Alpha", "Bravo"]);
});

test("РЕГРЕСС B1: список не содержит контактов", async () => {
  const result = await api.list({ client });
  const serialized = JSON.stringify(result);

  assert.ok(!serialized.includes("@alpha"), "Telegram не должен уезжать анониму");
  assert.ok(!serialized.includes("AlphaNick"), "ник не должен уезжать анониму");
  assert.deepEqual(
    Object.keys(result.users[0]).sort(),
    ["avatarData", "id", "isAdmin", "name", "rating"]
  );
});

test("РЕГРЕСС D5: поиск без совпадений отдаёт 200 и пустой список", async () => {
  const result = await api.search({ client, user: alpha, query: new URLSearchParams("q=ghost") });
  assert.deepEqual(result, { users: [] });
});

test("поиск находит по нику и телеграму и не возвращает самого себя", async () => {
  const byNick = await api.search({
    client, user: alpha, query: new URLSearchParams("q=bravonick")
  });
  assert.deepEqual(byNick.users.map((user) => user.name), ["Bravo"]);

  const byTelegram = await api.search({
    client, user: alpha, query: new URLSearchParams("q=@bravo")
  });
  assert.deepEqual(byTelegram.users.map((user) => user.name), ["Bravo"]);

  const all = await api.search({ client, user: alpha, query: new URLSearchParams("q=") });
  assert.equal(all.users.some((user) => user.id === alpha.id), false);
});

test("поиск сохраняет контакты для авторизованного вызова", async () => {
  const result = await api.search({
    client, user: alpha, query: new URLSearchParams("q=bravo")
  });
  assert.equal(result.users[0].telegramContact, "@bravo");
});

test("профиль считает статистику по завершённым играм", async () => {
  const first = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const second = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });

  await gamesRepo.saveFinalResult(client, first.id, {
    result: { winnerId: alpha.id, scores: { [alpha.id]: { faction: "Kasrkin" } } },
    elo: { [alpha.id]: { delta: 16 }, [bravo.id]: { delta: -16 } }
  });
  await gamesRepo.saveFinalResult(client, second.id, {
    result: { winnerId: bravo.id, scores: {} },
    elo: { [alpha.id]: { delta: -14 }, [bravo.id]: { delta: 14 } }
  });

  const result = await api.profile({ client, user: alpha, params: { id: String(alpha.id) } });

  assert.equal(result.stats.matches, 2);
  assert.equal(result.stats.wins, 1);
  assert.equal(result.stats.losses, 1);
  assert.equal(result.stats.draws, 0);
  assert.equal(result.stats.winRate, 50);
  assert.equal(result.stats.eloDelta, 2);
});

test("профиль отражает прогресс по challenge-треку", async () => {
  const game = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await gamesRepo.saveFinalResult(client, game.id, {
    result: { winnerId: alpha.id, scores: { [alpha.id]: { faction: "Kasrkin" } } },
    elo: {}
  });

  const result = await api.profile({ client, user: alpha, params: { id: String(alpha.id) } });
  assert.equal(result.challengeProgress.completedCount, 1);
  assert.equal(result.challengeProgress.teams[0].status, "completed");
});

test("несуществующий профиль отдаёт 404", async () => {
  await assert.rejects(
    () => api.profile({ client, user: alpha, params: { id: "9999" } }),
    (err) => err.status === 404
  );
});

test("обычный пользователь не видит чужие ожидающие игры", async () => {
  const game = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await gamesRepo.savePendingResult(client, game.id, {
    submittedBy: alpha.id,
    pendingResult: { submittedBy: alpha.id, submittedAt: "2026-01-01T00:00:00.000Z", result: {} }
  });

  const asAdmin = await api.profile({ client, user: alpha, params: { id: String(bravo.id) } });
  assert.equal(asAdmin.pendingGames.length, 1);

  const asPlayer = await api.profile({ client, user: bravo, params: { id: String(alpha.id) } });
  assert.equal(asPlayer.pendingGames.length, 0);
});

test("challengeProgress отдаёт справочники треков", async () => {
  const result = await api.challengeProgress({
    client, user: alpha, query: new URLSearchParams("")
  });

  assert.ok(Array.isArray(result.teams));
  assert.ok(Array.isArray(result.wildcards));
  assert.ok(Array.isArray(result.allKillTeamTeams));
  assert.equal(result.users.length, 1);
  assert.equal(result.users[0].user.id, alpha.id);
});

test("challengeProgress умеет отдавать прогресс другого игрока", async () => {
  const result = await api.challengeProgress({
    client, user: alpha, query: new URLSearchParams(`userId=${bravo.id}`)
  });
  assert.equal(result.users[0].user.id, bravo.id);

  await assert.rejects(
    () => api.challengeProgress({ client, user: alpha, query: new URLSearchParams("userId=9999") }),
    (err) => err.status === 404
  );
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/integration/api-users.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/api/users'`.

- [ ] **Step 3: Написать реализацию**

Create `src/api/users.js`:

```js
const { HttpError } = require("../http/io");
const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const challengesRepo = require("../db/repositories/challenges");
const {
  leaderboardUser,
  publicUserSummary,
  challengeProgressView,
  publicProfileSummary
} = require("./views");
const {
  CLASSIFIED_TRACK,
  ALL_KILL_TEAM_TRACK,
  WILDCARDS
} = require("../domain/kill-teams");

const SEARCH_LIMIT = 10;

async function list({ client }) {
  const rows = await usersRepo.listLeaderboard(client);
  return { users: rows.map(leaderboardUser) };
}

async function search({ client, user, query }) {
  const q = String(query.get("q") || "").trim().replace(/\s+/g, " ");
  const found = await usersRepo.search(client, {
    q,
    excludeId: user.id,
    limit: SEARCH_LIMIT
  });
  return { users: found.map(publicUserSummary) };
}

async function requireUser(client, id) {
  const found = await usersRepo.findById(client, Number(id));
  if (!found) throw new HttpError(404, "User not found");
  return found;
}

async function profile({ client, user, params }) {
  const target = await requireUser(client, params.id);
  const isSelf = target.id === user.id;

  const completedGames = await gamesRepo.listCompletedForUser(client, target.id);
  const activeGame = isSelf ? null : await gamesRepo.findActiveBetween(client, user.id, target.id);
  const pendingChallenge = isSelf
    ? null
    : await challengesRepo.findPendingBetween(client, user.id, target.id);
  const adminPendingGames = user.isAdmin
    ? await gamesRepo.listPendingForUser(client, target.id)
    : [];

  const peopleIds = new Set([target.id, user.id]);
  for (const game of [...completedGames, ...adminPendingGames]) {
    for (const id of game.playerIds) peopleIds.add(id);
  }
  if (activeGame) for (const id of activeGame.playerIds) peopleIds.add(id);
  if (pendingChallenge) {
    peopleIds.add(pendingChallenge.fromUserId);
    peopleIds.add(pendingChallenge.toUserId);
  }
  const people = await usersRepo.findByIds(client, [...peopleIds]);

  return publicProfileSummary({
    user: target,
    completedGames,
    people,
    activeGame,
    pendingChallenge,
    adminPendingGames,
    allGamesForProgress: completedGames
  });
}

async function challengeProgress({ client, user, query }) {
  const requestedId = Number(query.get("userId") || user.id);
  const target = await requireUser(client, requestedId);
  const completedGames = await gamesRepo.listCompletedForUser(client, target.id);

  return {
    teams: CLASSIFIED_TRACK,
    wildcards: WILDCARDS,
    allKillTeamTeams: ALL_KILL_TEAM_TRACK,
    users: [challengeProgressView(completedGames, target)]
  };
}

module.exports = { list, search, profile, challengeProgress };
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/integration/api-users.test.js
```

Ожидаемо: `pass 11`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/api/users.js test/integration/api-users.test.js
git commit -m "feat: add user routes and stop leaking contacts to anonymous callers"
```

---

### Task 16: Маршруты челленджей

**Files:**
- Create: `src/api/challenges.js`
- Test: `test/integration/api-challenges.test.js`

**Interfaces:**
- Consumes: репозитории `users`, `challenges`, `games`; `src/api/views.js`; `src/http/io.js`.
- Produces: `src/api/challenges.js` → `{ create, respond, byShareToken, acceptByShareToken }`.
  Внутренняя `acceptChallenge(client, challenge)` возвращает созданную игру либо бросает `HttpError`.

- [ ] **Step 1: Написать падающий тест**

Create `test/integration/api-challenges.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const api = require("../../src/api/challenges");
const usersRepo = require("../../src/db/repositories/users");
const gamesRepo = require("../../src/db/repositories/games");
const challengesRepo = require("../../src/db/repositories/challenges");

let pool;
let client;
let alpha;
let bravo;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("TRUNCATE sessions, feedback, games, challenges, users RESTART IDENTITY CASCADE");
  client = await pool.connect();
  alpha = await usersRepo.insert(client, {
    name: "Alpha", passwordHash: "s:h", registerNickname: "", telegramContact: "@a",
    rating: 1000, isAdmin: false
  });
  bravo = await usersRepo.insert(client, {
    name: "Bravo", passwordHash: "s:h", registerNickname: "", telegramContact: "@b",
    rating: 1000, isAdmin: false
  });
});

test.afterEach(() => {
  client.release();
});

test("создание челленджа отдаёт 201 и share-токен", async () => {
  const result = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });

  assert.equal(result.status, 201);
  assert.equal(result.body.challenge.status, "pending");
  assert.equal(result.body.challenge.from.id, alpha.id);
  assert.equal(result.body.challenge.to.id, bravo.id);
  assert.match(result.body.challenge.shareToken, /^[a-f0-9]{36}$/);
});

test("нельзя вызвать себя или несуществующего игрока", async () => {
  await assert.rejects(
    () => api.create({ client, user: alpha, body: { toUserId: alpha.id } }),
    (err) => err.status === 400
  );
  await assert.rejects(
    () => api.create({ client, user: alpha, body: { toUserId: 9999 } }),
    (err) => err.status === 400
  );
});

test("повторный челлендж той же паре отклоняется", async () => {
  await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  await assert.rejects(
    () => api.create({ client, user: bravo, body: { toUserId: alpha.id } }),
    (err) => err.status === 409
  );
});

test("челлендж поверх активной игры отклоняется", async () => {
  await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await assert.rejects(
    () => api.create({ client, user: alpha, body: { toUserId: bravo.id } }),
    (err) => err.status === 409
  );
});

test("принятие создаёт игру и связывает её с челленджем", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const id = String(created.body.challenge.id);

  const accepted = await api.respond({
    client, user: bravo, params: { id, action: "accept" }
  });

  assert.equal(accepted.challenge.status, "accepted");
  assert.ok(accepted.challenge.gameId);

  const game = await gamesRepo.findById(client, accepted.challenge.gameId);
  assert.equal(game.status, "open");
  assert.deepEqual(game.playerIds.sort(), [alpha.id, bravo.id].sort());
});

test("принять может только получатель, отменить — только отправитель", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const id = String(created.body.challenge.id);

  await assert.rejects(
    () => api.respond({ client, user: alpha, params: { id, action: "accept" } }),
    (err) => err.status === 403
  );
  await assert.rejects(
    () => api.respond({ client, user: bravo, params: { id, action: "cancel" } }),
    (err) => err.status === 403
  );

  const cancelled = await api.respond({ client, user: alpha, params: { id, action: "cancel" } });
  assert.equal(cancelled.challenge.status, "cancelled");
});

test("отклонение переводит челлендж в declined", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const declined = await api.respond({
    client, user: bravo, params: { id: String(created.body.challenge.id), action: "decline" }
  });
  assert.equal(declined.challenge.status, "declined");
});

test("повторный ответ на обработанный челлендж отклоняется", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const id = String(created.body.challenge.id);
  await api.respond({ client, user: bravo, params: { id, action: "decline" } });

  await assert.rejects(
    () => api.respond({ client, user: bravo, params: { id, action: "accept" } }),
    (err) => err.status === 409
  );
});

test("несуществующий челлендж отдаёт 404", async () => {
  await assert.rejects(
    () => api.respond({ client, user: bravo, params: { id: "9999", action: "accept" } }),
    (err) => err.status === 404
  );
});

test("share-ссылка доступна только участникам", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const token = created.body.challenge.shareToken;

  const seen = await api.byShareToken({ client, user: bravo, params: { token } });
  assert.equal(seen.challenge.id, created.body.challenge.id);

  const charlie = await usersRepo.insert(client, {
    name: "Charlie", passwordHash: "s:h", registerNickname: "", telegramContact: "@c",
    rating: 1000, isAdmin: false
  });
  await assert.rejects(
    () => api.byShareToken({ client, user: charlie, params: { token } }),
    (err) => err.status === 403
  );
});

test("принятие по share-ссылке доступно только получателю", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const token = created.body.challenge.shareToken;

  await assert.rejects(
    () => api.acceptByShareToken({ client, user: alpha, params: { token } }),
    (err) => err.status === 403
  );

  const accepted = await api.acceptByShareToken({ client, user: bravo, params: { token } });
  assert.equal(accepted.challenge.status, "accepted");
  assert.equal(accepted.game.status, "open");
});

test("неизвестный share-токен отдаёт 404", async () => {
  await assert.rejects(
    () => api.byShareToken({ client, user: alpha, params: { token: "f".repeat(36) } }),
    (err) => err.status === 404
  );
});

test("share-токены уникальны", async () => {
  const charlie = await usersRepo.insert(client, {
    name: "Charlie", passwordHash: "s:h", registerNickname: "", telegramContact: "@c",
    rating: 1000, isAdmin: false
  });
  const first = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const second = await api.create({ client, user: alpha, body: { toUserId: charlie.id } });
  assert.notEqual(first.body.challenge.shareToken, second.body.challenge.shareToken);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/integration/api-challenges.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/api/challenges'`.

- [ ] **Step 3: Написать реализацию**

Уникальность share-токена обеспечена уникальным индексом в базе, поэтому цикл проверки существующих токенов из старого кода не нужен: 18 случайных байт делают коллизию невероятной, а индекс поймал бы её как ошибку вставки.

Create `src/api/challenges.js`:

```js
const crypto = require("node:crypto");

const { HttpError } = require("../http/io");
const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const challengesRepo = require("../db/repositories/challenges");
const { challengeView, gameView } = require("./views");

function newShareToken() {
  return crypto.randomBytes(18).toString("hex");
}

async function peopleFor(client, challenge) {
  return usersRepo.findByIds(client, [challenge.fromUserId, challenge.toUserId]);
}

async function acceptChallenge(client, challenge) {
  const existingGame = await gamesRepo.findActiveBetween(
    client,
    challenge.fromUserId,
    challenge.toUserId
  );
  if (existingGame) {
    throw new HttpError(409, "These players already have an active game");
  }

  const game = await gamesRepo.insert(client, {
    challengeId: challenge.id,
    playerIds: [challenge.fromUserId, challenge.toUserId]
  });
  const updated = await challengesRepo.attachGame(client, challenge.id, game.id);
  return { game, challenge: updated };
}

async function create({ client, user, body }) {
  const target = await usersRepo.findById(client, Number(body.toUserId));
  if (!target || target.id === user.id) {
    throw new HttpError(400, "Challenge target user not found");
  }

  const pending = await challengesRepo.findPendingBetween(client, user.id, target.id);
  if (pending) {
    throw new HttpError(409, "These players already have a pending challenge");
  }
  const activeGame = await gamesRepo.findActiveBetween(client, user.id, target.id);
  if (activeGame) {
    throw new HttpError(409, "These players already have an active game");
  }

  const challenge = await challengesRepo.insert(client, {
    fromUserId: user.id,
    toUserId: target.id,
    shareToken: newShareToken()
  });

  return {
    status: 201,
    body: { challenge: challengeView(challenge, [user, target]) }
  };
}

async function respond({ client, user, params }) {
  const challenge = await challengesRepo.lockById(client, Number(params.id));
  if (!challenge) throw new HttpError(404, "Challenge not found");
  if (challenge.status !== "pending") {
    throw new HttpError(409, "This challenge has already been handled");
  }

  let updated;
  if (params.action === "cancel") {
    if (challenge.fromUserId !== user.id) {
      throw new HttpError(403, "Only the sender can cancel this challenge");
    }
    updated = await challengesRepo.setStatus(client, challenge.id, "cancelled");
  } else {
    if (challenge.toUserId !== user.id) {
      throw new HttpError(403, "Only the recipient can answer this challenge");
    }
    if (params.action === "decline") {
      updated = await challengesRepo.setStatus(client, challenge.id, "declined");
    } else {
      updated = (await acceptChallenge(client, challenge)).challenge;
    }
  }

  return { challenge: challengeView(updated, await peopleFor(client, updated)) };
}

async function loadShared(client, user, token) {
  const challenge = await challengesRepo.findByShareToken(client, token);
  if (!challenge) throw new HttpError(404, "Challenge link not found");
  if (challenge.fromUserId !== user.id && challenge.toUserId !== user.id) {
    throw new HttpError(403, "This challenge link is for another player");
  }
  return challenge;
}

async function byShareToken({ client, user, params }) {
  const challenge = await loadShared(client, user, params.token);
  return { challenge: challengeView(challenge, await peopleFor(client, challenge)) };
}

async function acceptByShareToken({ client, user, params }) {
  const challenge = await loadShared(client, user, params.token);
  if (challenge.status !== "pending") {
    throw new HttpError(409, "This challenge has already been handled");
  }
  if (challenge.toUserId !== user.id) {
    throw new HttpError(403, "Only the recipient can accept this challenge link");
  }

  const accepted = await acceptChallenge(client, challenge);
  const people = await peopleFor(client, accepted.challenge);

  return {
    challenge: challengeView(accepted.challenge, people),
    game: gameView(accepted.game, people)
  };
}

module.exports = { create, respond, byShareToken, acceptByShareToken, acceptChallenge };
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/integration/api-challenges.test.js
```

Ожидаемо: `pass 13`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/api/challenges.js test/integration/api-challenges.test.js
git commit -m "feat: add transactional challenge handlers"
```

---

### Task 17: Маршруты игр и устранение гонки A1

Главная задача плана. Здесь появляется тест, который на старом коде падает: два одновременных подтверждения одного результата применяют Elo дважды.

**Files:**
- Create: `src/api/games.js`
- Test: `test/integration/api-games.test.js`

**Interfaces:**
- Consumes: репозитории `users`, `games`, `challenges`; `src/domain/scoring.js`, `src/domain/elo.js`; `src/api/views.js`; `src/http/io.js`.
- Produces: `src/api/games.js` → `{ listCompleted, submitResult, exitGame, respondToResult, finalizeResult(client, game, confirmedBy), cancelGame(client, game) }`.
  `finalizeResult` и `cancelGame` переиспользуются админскими маршрутами в задаче 18.

- [ ] **Step 1: Написать падающий тест**

Ключевой кейс — «параллельное подтверждение применяет Elo один раз». Он гоняет два независимых соединения через `withTransaction`; блокировка строки игры делает второй запрос ожидающим, и после снятия блокировки он видит статус `completed` и отдаёт 409.

Create `test/integration/api-games.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const api = require("../../src/api/games");
const usersRepo = require("../../src/db/repositories/users");
const gamesRepo = require("../../src/db/repositories/games");

let pool;
let client;
let alpha;
let bravo;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("TRUNCATE sessions, feedback, games, challenges, users RESTART IDENTITY CASCADE");
  client = await pool.connect();
  alpha = await usersRepo.insert(client, {
    name: "Alpha", passwordHash: "s:h", registerNickname: "", telegramContact: "@a",
    rating: 1000, isAdmin: false
  });
  bravo = await usersRepo.insert(client, {
    name: "Bravo", passwordHash: "s:h", registerNickname: "", telegramContact: "@b",
    rating: 1000, isAdmin: false
  });
});

test.afterEach(() => {
  client.release();
});

function scores(winnerId, loserId) {
  return {
    [winnerId]: { crit: 6, kill: 4, tac: 5, primary: "crit", faction: "Kasrkin", tacOp: "" },
    [loserId]: { crit: 2, kill: 3, tac: 1, primary: "kill", faction: "Legionaries", tacOp: "" }
  };
}

async function openGame() {
  return gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
}

async function withOwnTransaction(fn) {
  const own = await pool.connect();
  try {
    await own.query("BEGIN");
    const result = await fn(own);
    await own.query("COMMIT");
    return result;
  } catch (err) {
    await own.query("ROLLBACK");
    throw err;
  } finally {
    own.release();
  }
}

test("отправка результата переводит игру в ожидание подтверждения", async () => {
  const game = await openGame();
  const result = await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  assert.equal(result.game.status, "pending_confirmation");
  assert.equal(result.game.pendingResult.submittedBy, alpha.id);
  assert.equal(result.game.pendingResult.result.winnerId, alpha.id);
  assert.equal(result.game.result, null);
});

test("посторонний не может отправить результат", async () => {
  const game = await openGame();
  const charlie = await usersRepo.insert(client, {
    name: "Charlie", passwordHash: "s:h", registerNickname: "", telegramContact: "@c",
    rating: 1000, isAdmin: false
  });

  await assert.rejects(
    () => api.submitResult({
      client, user: charlie, params: { id: String(game.id) },
      body: { scores: scores(alpha.id, bravo.id) }
    }),
    (err) => err.status === 403
  );
});

test("подтверждение начисляет Elo обоим игрокам", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  const confirmed = await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "confirm-result" }
  });

  assert.equal(confirmed.game.status, "completed");
  assert.equal(confirmed.game.elo[alpha.id].delta, 16);
  assert.equal(confirmed.game.elo[bravo.id].delta, -16);
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1016);
  assert.equal((await usersRepo.findById(client, bravo.id)).rating, 984);
});

test("отправитель не может подтвердить свой же результат", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  await assert.rejects(
    () => api.respondToResult({
      client, user: alpha, params: { id: String(game.id), action: "confirm-result" }
    }),
    (err) => err.status === 403
  );
});

test("отклонение возвращает игру в открытое состояние", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  const rejected = await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "reject-result" }
  });

  assert.equal(rejected.game.status, "open");
  assert.equal(rejected.game.pendingResult, null);
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1000);
});

test("повторное сохранение завершённой игры отклоняется", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });
  await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "confirm-result" }
  });

  await assert.rejects(
    () => api.submitResult({
      client, user: alpha, params: { id: String(game.id) },
      body: { scores: scores(alpha.id, bravo.id) }
    }),
    (err) => err.status === 409
  );
});

test("РЕГРЕСС A1: параллельное подтверждение применяет Elo ровно один раз", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  const confirm = () =>
    withOwnTransaction((own) =>
      api.respondToResult({
        client: own,
        user: bravo,
        params: { id: String(game.id), action: "confirm-result" }
      })
    );

  const outcomes = await Promise.allSettled([confirm(), confirm()]);
  const fulfilled = outcomes.filter((item) => item.status === "fulfilled");
  const rejected = outcomes.filter((item) => item.status === "rejected");

  assert.equal(fulfilled.length, 1, "подтвердиться должен ровно один запрос");
  assert.equal(rejected.length, 1, "второй запрос должен получить отказ");
  assert.equal(rejected[0].reason.status, 409);

  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1016);
  assert.equal((await usersRepo.findById(client, bravo.id)).rating, 984);
});

test("РЕГРЕСС A1: параллельная отправка результата не задваивается", async () => {
  const game = await openGame();

  const submit = (user) =>
    withOwnTransaction((own) =>
      api.submitResult({
        client: own, user, params: { id: String(game.id) },
        body: { scores: scores(alpha.id, bravo.id) }
      })
    );

  const outcomes = await Promise.allSettled([submit(alpha), submit(bravo)]);
  const fulfilled = outcomes.filter((item) => item.status === "fulfilled");
  assert.equal(fulfilled.length, 1, "принять надо только одну отправку");

  const stored = await gamesRepo.findById(client, game.id);
  assert.equal(stored.status, "pending_confirmation");
});

test("выход из игры отменяет её без начисления Elo", async () => {
  const game = await openGame();
  const exited = await api.exitGame({
    client, user: alpha, params: { id: String(game.id) }
  });

  assert.equal(exited.game.status, "cancelled");
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1000);
});

test("выйти из завершённой игры нельзя", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });
  await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "confirm-result" }
  });

  await assert.rejects(
    () => api.exitGame({ client, user: alpha, params: { id: String(game.id) } }),
    (err) => err.status === 409
  );
});

test("ожидающую игру может удалить только отправивший результат", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  await assert.rejects(
    () => api.exitGame({ client, user: bravo, params: { id: String(game.id) } }),
    (err) => err.status === 403
  );
});

test("список завершённых игр содержит игроков", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });
  await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "confirm-result" }
  });

  const list = await api.listCompleted({ client });
  assert.equal(list.games.length, 1);
  assert.equal(list.games[0].players.length, 2);
  assert.equal("challengeCredits" in list.games[0].players[0], false);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/integration/api-games.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/api/games'`.

- [ ] **Step 3: Написать реализацию**

Каждый мутирующий обработчик начинается с `gamesRepo.lockById`. Это и есть исправление A1: параллельный запрос ждёт снятия блокировки и затем видит уже изменённое состояние.

Create `src/api/games.js`:

```js
const { HttpError } = require("../http/io");
const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const challengesRepo = require("../db/repositories/challenges");
const { calculateSubmittedResult, matchScoreFor } = require("../domain/scoring");
const { calculateElo, ELO_K } = require("../domain/elo");
const { gameView } = require("./views");

const { ACTIVE_STATUSES } = gamesRepo;

async function lockGame(client, id) {
  const game = await gamesRepo.lockById(client, Number(id));
  if (!game) throw new HttpError(404, "Game not found");
  return game;
}

function requireParticipant(game, user, message) {
  if (!game.playerIds.includes(user.id)) throw new HttpError(403, message);
}

async function lockPlayers(client, game) {
  const players = await usersRepo.lockByIds(client, game.playerIds);
  const playerA = players.find((player) => player.id === game.playerIds[0]);
  const playerB = players.find((player) => player.id === game.playerIds[1]);
  if (!playerA || !playerB) {
    throw new HttpError(409, "One of the players has been deleted");
  }
  return { playerA, playerB, players };
}

async function viewOf(client, game) {
  const people = await usersRepo.findByIds(client, game.playerIds);
  return gameView(game, people);
}

async function applyElo(client, game, playerA, playerB, result, confirmedBy) {
  const matchScoreA = matchScoreFor(result, playerA.id, playerB.id);
  const { deltaA, deltaB } = calculateElo(playerA.rating, playerB.rating, matchScoreA);

  const updatedA = await usersRepo.addRating(client, playerA.id, deltaA);
  const updatedB = await usersRepo.addRating(client, playerB.id, deltaB);

  const elo = {
    k: ELO_K,
    [playerA.id]: { before: playerA.rating, after: updatedA.rating, delta: deltaA },
    [playerB.id]: { before: playerB.rating, after: updatedB.rating, delta: deltaB }
  };

  return gamesRepo.saveFinalResult(client, game.id, {
    result: { ...result, confirmedBy, confirmedAt: confirmedBy ? new Date().toISOString() : null },
    elo,
    submittedBy: game.submittedBy
  });
}

async function reverseElo(client, game) {
  if (!game.elo) return;
  for (const playerId of game.playerIds) {
    const delta = Number(game.elo?.[playerId]?.delta || 0);
    if (delta) await usersRepo.addRating(client, playerId, -delta);
  }
}

async function finalizeResult(client, game, confirmedBy) {
  if (game.status !== "pending_confirmation" || !game.pendingResult?.result) {
    throw new HttpError(409, "There is no submitted result to confirm");
  }
  const { playerA, playerB } = await lockPlayers(client, game);
  const pending = game.pendingResult.result;
  const normalized = calculateSubmittedResult(
    { scores: pending.scores, killzone: pending.killzone, tiebreakers: pending.tiebreakers },
    playerA.id,
    playerB.id
  );
  return applyElo(client, game, playerA, playerB, normalized, confirmedBy);
}

async function cancelGame(client, game) {
  const cancelled = await gamesRepo.cancel(client, game.id);
  if (game.challengeId) {
    const challenge = await challengesRepo.findById(client, game.challengeId);
    if (challenge && challenge.status === "accepted") {
      await challengesRepo.setStatus(client, challenge.id, "cancelled");
    }
  }
  return cancelled;
}

async function listCompleted({ client }) {
  const completed = await gamesRepo.listCompleted(client);
  const peopleIds = new Set();
  for (const game of completed) {
    for (const id of game.playerIds) peopleIds.add(id);
  }
  const people = await usersRepo.findByIds(client, [...peopleIds]);
  return { games: completed.map((game) => gameView(game, people)) };
}

async function submitResult({ client, user, params, body }) {
  const game = await lockGame(client, params.id);
  requireParticipant(game, user, "Only a game participant can submit the result");

  if (game.status === "completed") {
    throw new HttpError(409, "This game result has already been saved");
  }
  if (game.status === "cancelled") {
    throw new HttpError(409, "This game has been cancelled");
  }
  if (game.status === "pending_confirmation" && game.pendingResult?.submittedBy !== user.id) {
    throw new HttpError(409, "This result is waiting for your confirmation");
  }

  const { playerA, playerB } = await lockPlayers(client, game);
  const result = calculateSubmittedResult(body, playerA.id, playerB.id);
  const submittedAt = new Date().toISOString();

  const updated = await gamesRepo.savePendingResult(client, game.id, {
    submittedBy: user.id,
    pendingResult: { submittedBy: user.id, submittedAt, result }
  });

  return { game: await viewOf(client, updated) };
}

async function exitGame({ client, user, params }) {
  const game = await lockGame(client, params.id);
  requireParticipant(game, user, "Only a game participant can exit this game");

  if (!ACTIVE_STATUSES.includes(game.status)) {
    throw new HttpError(409, "Only open or pending games can be exited");
  }
  if (game.status === "pending_confirmation" && game.pendingResult?.submittedBy !== user.id) {
    throw new HttpError(403, "Only the player waiting for confirmation can delete this pending game");
  }

  const cancelled = await cancelGame(client, game);
  return { game: await viewOf(client, cancelled) };
}

async function respondToResult({ client, user, params }) {
  const game = await lockGame(client, params.id);
  requireParticipant(game, user, "Only a game participant can confirm the result");

  if (game.status !== "pending_confirmation" || !game.pendingResult?.result) {
    throw new HttpError(409, "There is no submitted result to confirm");
  }
  if (game.pendingResult.submittedBy === user.id) {
    throw new HttpError(403, "The other player must confirm this result");
  }

  if (params.action === "reject-result") {
    const cleared = await gamesRepo.clearResult(client, game.id);
    return { game: await viewOf(client, cleared) };
  }

  const finalized = await finalizeResult(client, game, user.id);
  return { game: await viewOf(client, finalized) };
}

module.exports = {
  listCompleted,
  submitResult,
  exitGame,
  respondToResult,
  finalizeResult,
  cancelGame,
  reverseElo,
  applyElo,
  lockGame,
  lockPlayers
};
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
node --test test/integration/api-games.test.js
```

Ожидаемо: `pass 12`, `fail 0`.

Если тест «параллельное подтверждение» зависает — значит блокировка берётся не в первую очередь: убедитесь, что `lockGame` вызывается до любых других запросов в обработчике.

- [ ] **Step 5: Commit**

```bash
git add src/api/games.js test/integration/api-games.test.js
git commit -m "fix: make game result handling atomic and kill the lost-update race"
```

---

### Task 18: Маршруты обратной связи и администратора

Закрывает D1 (админ может завершить отменённую игру) и D2 (частично применённый патч теряется).

**Files:**
- Create: `src/api/feedback.js`
- Create: `src/api/admin.js`
- Test: `test/integration/api-admin.test.js`

**Interfaces:**
- Consumes: репозитории; `src/api/games.js` → `finalizeResult`, `cancelGame`, `lockGame`, `lockPlayers`, `reverseElo`, `applyElo`; `src/domain/passwords.js` → `generateTemporaryPassword`, `hashPassword`; `src/domain/kill-teams.js`.
- Produces:
  - `src/api/feedback.js` → `{ create, list, updateStatus, remove }` — обратная связь целиком живёт здесь, включая административные действия
  - `src/api/admin.js` → `{ listActiveGames, confirmGameResult, deleteGame, saveGameResult, listUsers, updateUser, deleteUser, resetPassword, challengeCredit }`

- [ ] **Step 1: Написать падающий тест**

Create `test/integration/api-admin.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const admin = require("../../src/api/admin");
const feedbackApi = require("../../src/api/feedback");
const gamesApi = require("../../src/api/games");
const usersRepo = require("../../src/db/repositories/users");
const gamesRepo = require("../../src/db/repositories/games");
const { verifyPassword } = require("../../src/domain/passwords");

let pool;
let client;
let root;
let player;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("TRUNCATE sessions, feedback, games, challenges, users RESTART IDENTITY CASCADE");
  client = await pool.connect();
  root = await usersRepo.insert(client, {
    name: "Root", passwordHash: "s:h", registerNickname: "", telegramContact: "@root",
    rating: 1000, isAdmin: true
  });
  player = await usersRepo.insert(client, {
    name: "Player", passwordHash: "s:h", registerNickname: "", telegramContact: "@player",
    rating: 1000, isAdmin: false
  });
});

test.afterEach(() => {
  client.release();
});

function scores(a, b) {
  return {
    [a]: { crit: 6, kill: 4, tac: 5, primary: "crit", faction: "Kasrkin", tacOp: "" },
    [b]: { crit: 2, kill: 3, tac: 1, primary: "kill", faction: "Legionaries", tacOp: "" }
  };
}

test("РЕГРЕСС D1: результат для отменённой игры отклоняется", async () => {
  const game = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  await gamesRepo.cancel(client, game.id);

  await assert.rejects(
    () => admin.saveGameResult({
      client, user: root, params: { id: String(game.id) },
      body: { scores: scores(root.id, player.id) }
    }),
    (err) => err.status === 409
  );

  assert.equal((await usersRepo.findById(client, root.id)).rating, 1000);
});

test("админ может переписать результат завершённой игры, откатив прежнее Elo", async () => {
  const game = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  await gamesApi.submitResult({
    client, user: root, params: { id: String(game.id) },
    body: { scores: scores(root.id, player.id) }
  });
  await gamesApi.respondToResult({
    client, user: player, params: { id: String(game.id), action: "confirm-result" }
  });
  assert.equal((await usersRepo.findById(client, root.id)).rating, 1016);

  await admin.saveGameResult({
    client, user: root, params: { id: String(game.id) },
    body: { scores: scores(player.id, root.id) }
  });

  assert.equal((await usersRepo.findById(client, root.id)).rating, 984);
  assert.equal((await usersRepo.findById(client, player.id)).rating, 1016);
});

test("РЕГРЕСС D2: неудачный патч не оставляет частичных изменений", async () => {
  await assert.rejects(
    () => admin.updateUser({
      client, user: root, params: { id: String(root.id) },
      body: { rating: 1500, isAdmin: false }
    }),
    (err) => err.status === 400
  );

  const unchanged = await usersRepo.findById(client, root.id);
  assert.equal(unchanged.rating, 1000, "рейтинг не должен примениться при отказе");
  assert.equal(unchanged.isAdmin, true);
});

test("патч рейтинга проверяет границы", async () => {
  await assert.rejects(
    () => admin.updateUser({
      client, user: root, params: { id: String(player.id) }, body: { rating: 99999 }
    }),
    (err) => err.status === 400
  );

  const updated = await admin.updateUser({
    client, user: root, params: { id: String(player.id) }, body: { rating: 1234 }
  });
  assert.equal(updated.user.rating, 1234);
});

test("админ может выдать и снять права другому игроку", async () => {
  const promoted = await admin.updateUser({
    client, user: root, params: { id: String(player.id) }, body: { isAdmin: true }
  });
  assert.equal(promoted.user.isAdmin, true);

  const demoted = await admin.updateUser({
    client, user: root, params: { id: String(player.id) }, body: { isAdmin: false }
  });
  assert.equal(demoted.user.isAdmin, false);
});

test("нельзя удалить самого себя", async () => {
  await assert.rejects(
    () => admin.deleteUser({ client, user: root, params: { id: String(root.id) } }),
    (err) => err.status === 400
  );
});

test("удаление игрока убирает его игры", async () => {
  await gamesRepo.insert(client, { challengeId: null, playerIds: [root.id, player.id] });
  await admin.deleteUser({ client, user: root, params: { id: String(player.id) } });

  assert.equal(await usersRepo.findById(client, player.id), null);
  assert.equal((await gamesRepo.listForUser(client, root.id)).length, 0);
});

test("сброс пароля выдаёт временный пароль и гасит сессии", async () => {
  const result = await admin.resetPassword({
    client, user: root, params: { id: String(player.id) }
  });

  assert.ok(result.password.length >= 12);
  const updated = await usersRepo.findById(client, player.id);
  assert.equal(await verifyPassword(result.password, updated.passwordHash), true);

  await assert.rejects(
    () => admin.resetPassword({ client, user: root, params: { id: String(root.id) } }),
    (err) => err.status === 400
  );
});

test("админ начисляет и списывает Kill Team в треке", async () => {
  const credited = await admin.challengeCredit({
    client, user: root, params: { id: String(player.id) },
    body: { team: "Kasrkin", action: "credit", track: "classified" }
  });
  assert.equal(credited.progress.completedCount, 1);

  const again = await admin.challengeCredit({
    client, user: root, params: { id: String(player.id) },
    body: { team: "Kasrkin", action: "credit", track: "classified" }
  });
  assert.equal(again.progress.completedCount, 1, "повторное начисление ничего не меняет");

  const removed = await admin.challengeCredit({
    client, user: root, params: { id: String(player.id) },
    body: { team: "Kasrkin", action: "remove", track: "classified" }
  });
  assert.equal(removed.progress.completedCount, 0);
});

test("начисление принимает историческое написание и отвергает мусор", async () => {
  const credited = await admin.challengeCredit({
    client, user: root, params: { id: String(player.id) },
    body: { team: "Tempestus Aquillons", action: "credit", track: "classified" }
  });
  const entry = credited.progress.teams.find((item) => item.team === "Tempestus Aquilons");
  assert.equal(entry.status, "completed");

  await assert.rejects(
    () => admin.challengeCredit({
      client, user: root, params: { id: String(player.id) },
      body: { team: "Not A Team", action: "credit", track: "classified" }
    }),
    (err) => err.status === 400
  );
});

test("список активных игр показывает открытые и ожидающие", async () => {
  const open = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  const done = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  await gamesRepo.saveFinalResult(client, done.id, { result: { winnerId: root.id }, elo: {} });

  const result = await admin.listActiveGames({ client });
  assert.deepEqual(result.games.map((game) => game.id), [open.id]);
});

test("админ подтверждает ожидающий результат за игрока", async () => {
  const game = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  await gamesApi.submitResult({
    client, user: root, params: { id: String(game.id) },
    body: { scores: scores(root.id, player.id) }
  });

  const confirmed = await admin.confirmGameResult({
    client, user: root, params: { id: String(game.id) }
  });
  assert.equal(confirmed.game.status, "completed");
  assert.equal((await usersRepo.findById(client, root.id)).rating, 1016);
});

test("админ удаляет только активные игры", async () => {
  const game = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  const deleted = await admin.deleteGame({
    client, user: root, params: { id: String(game.id) }
  });
  assert.equal(deleted.game.status, "cancelled");

  await assert.rejects(
    () => admin.deleteGame({ client, user: root, params: { id: String(game.id) } }),
    (err) => err.status === 409
  );
});

test("обратная связь создаётся, закрывается, переоткрывается и удаляется", async () => {
  const created = await feedbackApi.create({
    client, user: player, body: { screen: "Leaderboard", description: "Something is off" }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.feedback.status, "open");
  assert.equal(created.body.feedback.user.name, "Player");

  const id = String(created.body.feedback.id);
  const resolved = await feedbackApi.updateStatus({
    client, user: root, params: { id }, body: { status: "resolved" }
  });
  assert.equal(resolved.feedback.status, "resolved");
  assert.equal(resolved.feedback.resolvedByUser.name, "Root");

  const listed = await feedbackApi.list({ client });
  assert.equal(listed.feedback.length, 1);

  await feedbackApi.remove({ client, user: root, params: { id } });
  assert.equal((await feedbackApi.list({ client })).feedback.length, 0);
});

test("обратная связь требует экран и описание", async () => {
  await assert.rejects(
    () => feedbackApi.create({ client, user: player, body: { screen: "", description: "x" } }),
    (err) => err.status === 400
  );
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/integration/api-admin.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/api/admin'`.

- [ ] **Step 3: Написать обработчики обратной связи**

Create `src/api/feedback.js`:

```js
const { HttpError } = require("../http/io");
const usersRepo = require("../db/repositories/users");
const feedbackRepo = require("../db/repositories/feedback");
const { requiredProfileText } = require("../domain/validation");
const { feedbackView } = require("./views");

async function create({ client, user, body }) {
  const screen = requiredProfileText(body.screen, "Screen", 80);
  const description = requiredProfileText(body.description, "Description", 1200);

  const item = await feedbackRepo.insert(client, { userId: user.id, screen, description });
  const people = await usersRepo.findByIds(client, [user.id]);

  return { status: 201, body: { feedback: feedbackView(item, people) } };
}

async function list({ client }) {
  const items = await feedbackRepo.listAll(client);
  const ids = new Set();
  for (const item of items) {
    if (item.userId) ids.add(item.userId);
    if (item.resolvedBy) ids.add(item.resolvedBy);
  }
  const people = await usersRepo.findByIds(client, [...ids]);
  return { feedback: items.map((item) => feedbackView(item, people)) };
}

async function requireItem(client, id) {
  const existing = await feedbackRepo.findById(client, Number(id));
  if (!existing) throw new HttpError(404, "Feedback not found");
  return existing;
}

async function updateStatus({ client, user, params, body }) {
  const existing = await requireItem(client, params.id);
  const status = body.status === "resolved" ? "resolved" : "open";
  const updated = await feedbackRepo.setStatus(client, existing.id, status, user.id);
  const people = await usersRepo.findByIds(
    client,
    [updated.userId, updated.resolvedBy].filter(Boolean)
  );
  return { feedback: feedbackView(updated, people) };
}

async function remove({ client, params }) {
  const existing = await requireItem(client, params.id);
  await feedbackRepo.remove(client, existing.id);
  return { ok: true };
}

module.exports = { create, list, updateStatus, remove };
```

- [ ] **Step 4: Написать административные обработчики**

`updateUser` сначала полностью проверяет патч и только потом применяет его — это исправление D2. `saveGameResult` проверяет статус игры — исправление D1.

Create `src/api/admin.js`:

```js
const { HttpError, ValidationError } = require("../http/io");
const usersRepo = require("../db/repositories/users");
const sessionsRepo = require("../db/repositories/sessions");
const gamesRepo = require("../db/repositories/games");
const games = require("./games");
const { publicUser, publicUserSummary, gameView, challengeProgressView } = require("./views");
const { requireInteger } = require("../domain/validation");
const { calculateSubmittedResult } = require("../domain/scoring");
const { hashPassword, generateTemporaryPassword } = require("../domain/passwords");
const {
  requireKillTeam,
  CLASSIFIED_TRACK,
  ALL_KILL_TEAM_TRACK,
  WILDCARDS
} = require("../domain/kill-teams");

const EDITABLE_GAME_STATUSES = ["open", "pending_confirmation", "completed"];

async function peopleForGames(client, list) {
  const ids = new Set();
  for (const game of list) {
    for (const id of game.playerIds) ids.add(id);
  }
  return usersRepo.findByIds(client, [...ids]);
}

async function requireTarget(client, id) {
  const target = await usersRepo.findById(client, Number(id));
  if (!target) throw new HttpError(404, "User not found");
  return target;
}

async function listActiveGames({ client }) {
  const active = await gamesRepo.listActive(client);
  const people = await peopleForGames(client, active);
  return { games: active.map((game) => gameView(game, people)) };
}

async function confirmGameResult({ client, user, params }) {
  const game = await games.lockGame(client, params.id);
  const finalized = await games.finalizeResult(client, game, user.id);
  const people = await usersRepo.findByIds(client, finalized.playerIds);
  return { game: gameView(finalized, people) };
}

async function deleteGame({ client, params }) {
  const game = await games.lockGame(client, params.id);
  if (!["open", "pending_confirmation"].includes(game.status)) {
    throw new HttpError(409, "Only active or pending games can be deleted here");
  }
  const cancelled = await games.cancelGame(client, game);
  const people = await usersRepo.findByIds(client, cancelled.playerIds);
  return { game: gameView(cancelled, people) };
}

async function saveGameResult({ client, user, params, body }) {
  const game = await games.lockGame(client, params.id);
  if (!EDITABLE_GAME_STATUSES.includes(game.status)) {
    throw new HttpError(409, "Only active, pending, or completed games can be edited");
  }

  const { playerA, playerB } = await games.lockPlayers(client, game);
  const result = calculateSubmittedResult(body, playerA.id, playerB.id);

  // Сначала откатываем прежнее Elo, затем перечитываем рейтинги: applyElo должен
  // считать от состояния «как если бы этой игры не было».
  await games.reverseElo(client, game);
  const refreshed = await usersRepo.findByIds(client, [playerA.id, playerB.id]);
  const beforeA = refreshed.find((person) => person.id === playerA.id);
  const beforeB = refreshed.find((person) => person.id === playerB.id);

  const updated = await games.applyElo(
    client,
    { ...game, submittedBy: user.id },
    beforeA,
    beforeB,
    result,
    user.id
  );

  const people = await usersRepo.findByIds(client, updated.playerIds);
  return { game: gameView(updated, people) };
}

async function listUsers({ client }) {
  const rows = await usersRepo.listWithGameCounts(client);
  return {
    users: rows.map((row) => ({ ...publicUserSummary(row), gamesPlayed: row.gamesPlayed }))
  };
}

async function updateUser({ client, user, params, body }) {
  const target = await requireTarget(client, params.id);

  let rating = null;
  if (body.rating !== undefined) {
    rating = requireInteger(body.rating, {
      min: 0,
      max: 5000,
      message: "Rating must be an integer between 0 and 5000"
    });
  }

  let isAdmin = null;
  if (body.isAdmin !== undefined) {
    isAdmin = Boolean(body.isAdmin);
    if (target.id === user.id && !isAdmin) {
      throw new ValidationError("You cannot remove administrator rights from yourself");
    }
  }

  let updated = target;
  if (rating !== null) updated = await usersRepo.setRating(client, target.id, rating);
  if (isAdmin !== null) updated = await usersRepo.setAdmin(client, target.id, isAdmin);

  return { user: publicUser(updated) };
}

async function deleteUser({ client, user, params }) {
  const target = await requireTarget(client, params.id);
  if (target.id === user.id) throw new ValidationError("You cannot delete yourself");
  await usersRepo.remove(client, target.id);
  return { ok: true };
}

async function resetPassword({ client, user, params }) {
  const target = await requireTarget(client, params.id);
  if (target.id === user.id) {
    throw new ValidationError("You cannot reset your own password here");
  }

  const password = generateTemporaryPassword();
  const updated = await usersRepo.setPasswordHash(client, target.id, await hashPassword(password));
  await sessionsRepo.deleteByUserId(client, target.id);

  return { user: publicUser(updated), password };
}

async function challengeCredit({ client, user, params, body }) {
  const target = await requireTarget(client, params.id);
  const team = requireKillTeam(body.team);
  const trackKey = body.track === "allKillTeam" ? "allKillTeam" : "classified";
  const trackTeams = trackKey === "allKillTeam" ? ALL_KILL_TEAM_TRACK : CLASSIFIED_TRACK;

  if (!trackTeams.includes(team) && !WILDCARDS.includes(team)) {
    throw new ValidationError("Unknown Kill Team for this challenge");
  }

  async function progressFor(person) {
    const completed = await gamesRepo.listCompletedForUser(client, person.id);
    return challengeProgressView(completed, person);
  }

  if (body.action === "remove") {
    const updated = await usersRepo.appendChallengeCredit(client, target.id, {
      team,
      action: "deduct",
      deductedBy: user.id,
      deductedAt: new Date().toISOString()
    });
    return { progress: await progressFor(updated) };
  }

  const current = await progressFor(target);
  const track = current.tracks[trackKey];
  const alreadyDone =
    track.teams.find((item) => item.team === team)?.status === "completed" ||
    track.wildcards.find((item) => item.team === team)?.status === "completed";

  if (alreadyDone) return { progress: current };

  const updated = await usersRepo.appendChallengeCredit(client, target.id, {
    team,
    action: "credit",
    creditedBy: user.id,
    creditedAt: new Date().toISOString()
  });
  return { progress: await progressFor(updated) };
}

module.exports = {
  listActiveGames,
  confirmGameResult,
  deleteGame,
  saveGameResult,
  listUsers,
  updateUser,
  deleteUser,
  resetPassword,
  challengeCredit
};
```

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

```bash
node --test test/integration/api-admin.test.js
```

Ожидаемо: `pass 15`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/api/feedback.js src/api/admin.js test/integration/api-admin.test.js
git commit -m "feat: add admin and feedback handlers, fix game status and patch ordering"
```

---

### Task 19: Таблица маршрутов, новый bootstrap и удаление JSON-хранилища

Момент переключения. До этой задачи все запросы обслуживал старый `handleApi`; после — новый роутер. Здесь же исчезает JSON-хранилище (A1, A3) и `server.js` сжимается с 2021 строки до bootstrap.

**Files:**
- Create: `src/api/routes.js`
- Modify: `server.js` (полная замена)
- Modify: `test/helpers/client.js`
- Modify: `test/integration/characterization.test.js`

**Interfaces:**
- Consumes: все модули `src/api/*`, `src/http/*`, `src/db/*`.
- Produces:
  - `src/api/routes.js` → массив маршрутов.
  - `server.js` → `{ server, router, start(), stop() }`.
  - `test/helpers/client.js` → дополнительно `startAppServer()`, поднимающий новый роутер.

**Изменения контракта, которые впитывают характеризационные тесты:**
- `GET /api/users` больше не отдаёт `telegramContact`, `registerNickname`, `createdAt` (B1, задача 15).
- `GET /api/users/search` без совпадений отдаёт `200 { users: [] }` вместо `404` (D5, задача 15).

- [ ] **Step 1: Написать таблицу маршрутов**

Действия объявляются отдельными маршрутами, а не сегментом `:action`: иначе `POST /api/games/5/anything` попал бы в обработчик подтверждения.

Create `src/api/routes.js`:

```js
const auth = require("./auth");
const users = require("./users");
const challenges = require("./challenges");
const games = require("./games");
const feedback = require("./feedback");
const admin = require("./admin");

function withAction(handler, action) {
  return (ctx) => handler({ ...ctx, params: { ...ctx.params, action } });
}

module.exports = [
  { method: "GET", path: "/api/me", handler: auth.me, auth: "none", loadUser: true },
  { method: "PATCH", path: "/api/me", handler: auth.updateMe, auth: "user", tx: true },
  { method: "POST", path: "/api/register", handler: auth.register, auth: "none", tx: true },
  { method: "POST", path: "/api/setup-admin", handler: auth.setupAdmin, auth: "none", tx: true },
  { method: "POST", path: "/api/login", handler: auth.login, auth: "none", tx: true },
  { method: "POST", path: "/api/logout", handler: auth.logout, auth: "none", tx: true },

  { method: "GET", path: "/api/users", handler: users.list, auth: "none" },
  { method: "GET", path: "/api/users/search", handler: users.search, auth: "user" },
  { method: "GET", path: "/api/users/:id", handler: users.profile, auth: "user" },
  { method: "GET", path: "/api/challenge-progress", handler: users.challengeProgress, auth: "user" },

  { method: "GET", path: "/api/games", handler: games.listCompleted, auth: "user" },
  { method: "POST", path: "/api/games/:id/result", handler: games.submitResult, auth: "user", tx: true },
  { method: "POST", path: "/api/games/:id/exit", handler: games.exitGame, auth: "user", tx: true },
  {
    method: "POST",
    path: "/api/games/:id/confirm-result",
    handler: withAction(games.respondToResult, "confirm-result"),
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/games/:id/reject-result",
    handler: withAction(games.respondToResult, "reject-result"),
    auth: "user",
    tx: true
  },

  { method: "POST", path: "/api/challenges", handler: challenges.create, auth: "user", tx: true },
  {
    method: "GET",
    path: "/api/challenges/share/:token",
    handler: challenges.byShareToken,
    auth: "user"
  },
  {
    method: "POST",
    path: "/api/challenges/share/:token/accept",
    handler: challenges.acceptByShareToken,
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/challenges/:id/accept",
    handler: withAction(challenges.respond, "accept"),
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/challenges/:id/decline",
    handler: withAction(challenges.respond, "decline"),
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/challenges/:id/cancel",
    handler: withAction(challenges.respond, "cancel"),
    auth: "user",
    tx: true
  },

  { method: "POST", path: "/api/feedback", handler: feedback.create, auth: "user", tx: true },

  { method: "GET", path: "/api/admin/feedback", handler: feedback.list, auth: "admin" },
  {
    method: "PATCH",
    path: "/api/admin/feedback/:id",
    handler: feedback.updateStatus,
    auth: "admin",
    tx: true
  },
  {
    method: "DELETE",
    path: "/api/admin/feedback/:id",
    handler: feedback.remove,
    auth: "admin",
    tx: true
  },

  { method: "GET", path: "/api/admin/games", handler: admin.listActiveGames, auth: "admin" },
  {
    method: "POST",
    path: "/api/admin/games/:id/confirm-result",
    handler: admin.confirmGameResult,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/games/:id/result",
    handler: admin.saveGameResult,
    auth: "admin",
    tx: true
  },
  {
    method: "PATCH",
    path: "/api/admin/games/:id/result",
    handler: admin.saveGameResult,
    auth: "admin",
    tx: true
  },
  {
    method: "DELETE",
    path: "/api/admin/games/:id",
    handler: admin.deleteGame,
    auth: "admin",
    tx: true
  },

  { method: "GET", path: "/api/admin/users", handler: admin.listUsers, auth: "admin" },
  {
    method: "POST",
    path: "/api/admin/users/:id/challenge-credit",
    handler: admin.challengeCredit,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/users/:id/reset-password",
    handler: admin.resetPassword,
    auth: "admin",
    tx: true
  },
  { method: "PATCH", path: "/api/admin/users/:id", handler: admin.updateUser, auth: "admin", tx: true },
  { method: "DELETE", path: "/api/admin/users/:id", handler: admin.deleteUser, auth: "admin", tx: true }
];
```

- [ ] **Step 2: Заменить `server.js` на bootstrap**

Полностью заменить содержимое `server.js`:

```js
const http = require("node:http");

const { PORT, HOST, requireDatabaseUrl } = require("./src/config");
const { getPool, closePool, withClient, withTransaction } = require("./src/db/pool");
const { migrate } = require("./src/db/migrate");
const { createRouter } = require("./src/http/router");
const { sendStatic } = require("./src/http/static");
const { logError } = require("./src/http/logger");
const routes = require("./src/api/routes");
const { loadUserFromRequest } = require("./src/api/auth");

const router = createRouter(routes, {
  withClient,
  withTransaction,
  loadUser: loadUserFromRequest
});

const server = http.createServer((req, res) => {
  if ((req.url || "").startsWith("/api/")) {
    router(req, res);
    return;
  }
  sendStatic(req, res);
});

async function start() {
  requireDatabaseUrl();
  await migrate(getPool());
  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  console.log(
    JSON.stringify({
      level: "info",
      time: new Date().toISOString(),
      msg: "server started",
      url: `http://${HOST}:${PORT}`
    })
  );
}

async function stop() {
  await new Promise((resolve) => server.close(resolve));
  await closePool();
}

if (require.main === module) {
  start().catch((err) => {
    logError("failed to start server", err);
    process.exit(1);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stop()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });
  }
}

module.exports = { server, router, start, stop };
```

- [ ] **Step 3: Переключить тестовый помощник на новый роутер**

Заменить `startApiServer` в `test/helpers/client.js` на версию, поднимающую роутер напрямую (`createClient` остаётся без изменений):

```js
const http = require("node:http");

async function startApiServer(handler) {
  const server = http.createServer((req, res) => {
    const result = handler(req, res);
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
```

- [ ] **Step 4: Обновить характеризационный тест**

Заменить блок подключения и `test.before` в `test/integration/characterization.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { TEST_DATABASE_URL, resetDatabase, closeTestPool } = require("../helpers/db");

process.env.DATABASE_URL = TEST_DATABASE_URL;

const { getPool, withClient, withTransaction } = require("../../src/db/pool");
const { migrate } = require("../../src/db/migrate");
const { createRouter } = require("../../src/http/router");
const routes = require("../../src/api/routes");
const { loadUserFromRequest } = require("../../src/api/auth");
const { startApiServer, createClient } = require("../helpers/client");

let server;

test.before(async () => {
  await migrate(getPool());
  const router = createRouter(routes, {
    withClient,
    withTransaction,
    loadUser: loadUserFromRequest
  });
  server = await startApiServer(router);
});
```

Затем дописать в конец файла два теста, фиксирующих новые изменения контракта:

```js
test("КОНТРАКТ B1: лидерборд не отдаёт контакты анониму", async () => {
  const alpha = createClient(server.baseUrl);
  await alpha.post("/api/register", registration("Alpha"));

  const anonymous = createClient(server.baseUrl);
  const res = await anonymous.get("/api/users");

  assert.equal(res.status, 200);
  assert.ok(!JSON.stringify(res.body).includes("@alpha"));
  assert.deepEqual(
    Object.keys(res.body.users[0]).sort(),
    ["avatarData", "id", "isAdmin", "name", "rating"]
  );
});

test("КОНТРАКТ D5: поиск без совпадений отдаёт 200 и пустой список", async () => {
  const alpha = createClient(server.baseUrl);
  await alpha.post("/api/register", registration("Alpha"));

  const res = await alpha.get("/api/users/search?q=ghost");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.users, []);
});
```

- [ ] **Step 5: Запустить характеризационные тесты**

```bash
node --test test/integration/characterization.test.js
```

Ожидаемо: `pass 11`, `fail 0`. Все сценарии из задачи 1 проходят против нового роутера без изменений — это и есть доказательство, что рефакторинг не изменил поведение.

- [ ] **Step 6: Проверить приложение вручную**

```bash
npm start
```

Ожидаемо: в логе строка `"msg":"server started"`. Откройте `http://127.0.0.1:3000`, зарегистрируйтесь, отправьте челлендж со второго аккаунта, сохраните и подтвердите результат, загляните в лидерборд и в challenge-трек. В логе на каждый запрос должна появляться строка с методом, путём, статусом и длительностью.

Остановите сервер по `Ctrl+C` — процесс должен завершиться без зависания.

- [ ] **Step 7: Убедиться, что от JSON-хранилища ничего не осталось**

```bash
grep -rn "db.json\|readJsonDb\|writeJsonDb\|nextIds\|deleteMissing\|resetSequence" server.js src/ || echo "чисто"
```

Ожидаемо: `чисто`.

- [ ] **Step 8: Прогнать весь набор тестов**

```bash
npm test
```

Ожидаемо: все зелёные.

- [ ] **Step 9: Commit**

```bash
git add server.js src/api/routes.js test/
git commit -m "refactor: replace monolithic handler with route table and drop JSON storage"
```

---

### Task 20: Миграция канонических названий Kill Team

Завершает D3. Реестр уже канонический (задача 7), но в сохранённых данных остаются `Tempestus Aquillons` и `XV26 Stealth Suits`.

**Files:**
- Create: `src/db/migrations/002_kill_team_names.js`
- Modify: `src/db/migrate.js:3-5`
- Test: `test/integration/migrate-kill-team-names.test.js`

**Interfaces:**
- Consumes: `src/domain/kill-teams.js` → `LEGACY_NAMES`.
- Produces: миграция версии 2; экспортирует `{ version, name, up, rewriteResult, rewriteCredits }` — две последние выведены наружу ради тестов.

- [ ] **Step 1: Написать падающий тест**

Create `test/integration/migrate-kill-team-names.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate, MIGRATIONS } = require("../../src/db/migrate");
const migration = require("../../src/db/migrations/002_kill_team_names");

let pool;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
});

test.after(async () => {
  await pool.end();
});

// Схема поднимается только базовой миграцией и намеренно не отмечается в
// schema_migrations: тест сначала засевает данные в старом виде, и лишь затем
// migrate(pool) применяет 001 (идемпотентно) и 002.
test.beforeEach(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const client = await pool.connect();
  try {
    await MIGRATIONS[0].up(client);
  } finally {
    client.release();
  }
});

async function seedLegacyData() {
  const { rows } = await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin, challenge_credits)
     VALUES ('Alpha', 'alpha', 's:h', 1000, true,
             '[{"team":"Tempestus Aquillons","action":"credit"},
               {"team":"XV26 Stealth Suits","action":"credit"},
               {"team":"Kasrkin","action":"credit"}]'::jsonb),
            ('Bravo', 'bravo', 's:h', 1000, false, '[]'::jsonb)
     RETURNING id`
  );
  const [alpha, bravo] = rows.map((row) => row.id);

  await pool.query(
    `INSERT INTO games (player_ids, status, result, pending_result)
     VALUES ($1::int[], 'completed',
             jsonb_build_object(
               'winnerId', $2::int,
               'scores', jsonb_build_object(
                 $2::text, jsonb_build_object('faction', 'Tempestus Aquillons', 'total', 12),
                 $3::text, jsonb_build_object('faction', 'XV26 Stealth Suits', 'total', 8))),
             NULL),
            ($1::int[], 'pending_confirmation', NULL,
             jsonb_build_object(
               'submittedBy', $2::int,
               'result', jsonb_build_object(
                 'winnerId', $2::int,
                 'scores', jsonb_build_object(
                   $2::text, jsonb_build_object('faction', 'XV26 Stealth Suits', 'total', 10)))))`,
    [[alpha, bravo], alpha, bravo]
  );

  return { alpha, bravo };
}

test("миграция переписывает faction в завершённом результате", async () => {
  const { alpha, bravo } = await seedLegacyData();
  await migrate(pool);

  const { rows } = await pool.query(
    `SELECT result FROM games WHERE status = 'completed'`
  );
  const scores = rows[0].result.scores;

  assert.equal(scores[alpha].faction, "Tempestus Aquilons");
  assert.equal(scores[bravo].faction, "XV26 Stealth Battlesuits");
  assert.equal(scores[alpha].total, 12, "остальные поля не должны меняться");
});

test("миграция переписывает faction в ожидающем результате", async () => {
  const { alpha } = await seedLegacyData();
  await migrate(pool);

  const { rows } = await pool.query(
    `SELECT pending_result FROM games WHERE status = 'pending_confirmation'`
  );
  assert.equal(
    rows[0].pending_result.result.scores[alpha].faction,
    "XV26 Stealth Battlesuits"
  );
});

test("миграция переписывает team в challenge_credits", async () => {
  await seedLegacyData();
  await migrate(pool);

  const { rows } = await pool.query(
    `SELECT challenge_credits FROM users WHERE name_key = 'alpha'`
  );
  assert.deepEqual(
    rows[0].challenge_credits.map((credit) => credit.team),
    ["Tempestus Aquilons", "XV26 Stealth Battlesuits", "Kasrkin"]
  );
});

test("миграция идемпотентна", async () => {
  await seedLegacyData();
  await migrate(pool);

  const before = await pool.query("SELECT result, id FROM games ORDER BY id");
  await pool.query("DELETE FROM schema_migrations WHERE version = 2");
  await migrate(pool);
  const after = await pool.query("SELECT result, id FROM games ORDER BY id");

  assert.deepEqual(after.rows, before.rows);
});

test("миграция не трогает записи без старых названий", async () => {
  await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin, challenge_credits)
     VALUES ('Solo', 'solo', 's:h', 1000, false,
             '[{"team":"Kasrkin","action":"credit"}]'::jsonb)`
  );
  await migrate(pool);

  const { rows } = await pool.query(
    `SELECT challenge_credits FROM users WHERE name_key = 'solo'`
  );
  assert.deepEqual(rows[0].challenge_credits, [{ team: "Kasrkin", action: "credit" }]);
});

test("миграция переживает пустые и отсутствующие структуры", async () => {
  await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin, challenge_credits)
     VALUES ('Empty', 'empty', 's:h', 1000, false, NULL)`
  );
  await pool.query(
    `INSERT INTO games (player_ids, status, result) VALUES ('{1}'::int[], 'open', NULL)`
  );

  await assert.doesNotReject(() => migrate(pool));
});

test("rewriteResult не меняет объект без старых названий", () => {
  const result = { winnerId: 1, scores: { 1: { faction: "Kasrkin" } } };
  assert.equal(migration.rewriteResult(result), null);
});

test("rewriteResult возвращает изменённую копию", () => {
  const result = { winnerId: 1, scores: { 1: { faction: "XV26 Stealth Suits", total: 5 } } };
  const rewritten = migration.rewriteResult(result);

  assert.equal(rewritten.scores[1].faction, "XV26 Stealth Battlesuits");
  assert.equal(rewritten.scores[1].total, 5);
  assert.equal(result.scores[1].faction, "XV26 Stealth Suits", "исходник не мутируется");
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/integration/migrate-kill-team-names.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/db/migrations/002_kill_team_names'`.

- [ ] **Step 3: Написать миграцию**

Переписывание JSONB делается на JavaScript, а не в SQL: структура `scores` — объект с идентификаторами игроков в ключах, и обход её в чистом SQL получается заметно менее читаемым.

Create `src/db/migrations/002_kill_team_names.js`:

```js
const { LEGACY_NAMES } = require("../../domain/kill-teams");

function canonical(name) {
  return LEGACY_NAMES[name] || null;
}

function rewriteResult(result) {
  if (!result || !result.scores) return null;

  let changed = false;
  const scores = {};
  for (const [playerId, score] of Object.entries(result.scores)) {
    const replacement = canonical(score?.faction);
    if (replacement) {
      changed = true;
      scores[playerId] = { ...score, faction: replacement };
    } else {
      scores[playerId] = score;
    }
  }
  return changed ? { ...result, scores } : null;
}

function rewritePendingResult(pending) {
  if (!pending?.result) return null;
  const rewritten = rewriteResult(pending.result);
  return rewritten ? { ...pending, result: rewritten } : null;
}

function rewriteCredits(credits) {
  if (!Array.isArray(credits) || !credits.length) return null;

  let changed = false;
  const next = credits.map((credit) => {
    const replacement = canonical(credit?.team);
    if (!replacement) return credit;
    changed = true;
    return { ...credit, team: replacement };
  });
  return changed ? next : null;
}

async function up(client) {
  let gamesChanged = 0;
  let usersChanged = 0;

  const { rows: gameRows } = await client.query(
    "SELECT id, result, pending_result FROM games WHERE result IS NOT NULL OR pending_result IS NOT NULL"
  );
  for (const row of gameRows) {
    const result = rewriteResult(row.result);
    const pendingResult = rewritePendingResult(row.pending_result);
    if (!result && !pendingResult) continue;

    await client.query(
      `UPDATE games
       SET result = COALESCE($2::jsonb, result),
           pending_result = COALESCE($3::jsonb, pending_result)
       WHERE id = $1`,
      [
        row.id,
        result ? JSON.stringify(result) : null,
        pendingResult ? JSON.stringify(pendingResult) : null
      ]
    );
    gamesChanged += 1;
  }

  const { rows: userRows } = await client.query(
    "SELECT id, challenge_credits FROM users WHERE challenge_credits IS NOT NULL"
  );
  for (const row of userRows) {
    const credits = rewriteCredits(row.challenge_credits);
    if (!credits) continue;

    await client.query("UPDATE users SET challenge_credits = $2::jsonb WHERE id = $1", [
      row.id,
      JSON.stringify(credits)
    ]);
    usersChanged += 1;
  }

  console.log(
    JSON.stringify({
      level: "info",
      time: new Date().toISOString(),
      msg: "kill team names canonicalized",
      gamesChanged,
      usersChanged
    })
  );
}

module.exports = {
  version: 2,
  name: "kill_team_names",
  up,
  rewriteResult,
  rewritePendingResult,
  rewriteCredits
};
```

- [ ] **Step 4: Подключить миграцию к раннеру**

В `src/db/migrate.js` заменить объявление списка:

```js
const MIGRATIONS = [
  require("./migrations/001_baseline"),
  require("./migrations/002_kill_team_names")
].sort((a, b) => a.version - b.version);
```

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

```bash
node --test test/integration/migrate-kill-team-names.test.js
```

Ожидаемо: `pass 8`, `fail 0`.

- [ ] **Step 6: Прогнать весь набор тестов**

```bash
npm test
```

Ожидаемо: все зелёные. Тест `test/unit/kill-teams.test.js` проверяет, что `LEGACY_NAMES` покрывает ровно расхождение старых словарей.

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations/002_kill_team_names.js src/db/migrate.js test/integration/migrate-kill-team-names.test.js
git commit -m "fix: canonicalize stored Kill Team names"
```

---

### Task 21: Ограничение попыток входа, импорт legacy-данных и документация

Закрывает остаток B3 и приводит документацию в соответствие с Postgres-only.

**Files:**
- Create: `src/http/rate-limit.js`
- Create: `scripts/import-json-db.js`
- Modify: `src/http/router.js`
- Modify: `src/api/routes.js`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `.env.example`
- Test: `test/unit/rate-limit.test.js`

**Interfaces:**
- Consumes: `src/config.js` → `LOGIN_RATE_LIMIT`; `src/http/io.js` → `HttpError`.
- Produces: `src/http/rate-limit.js` → `{ createRateLimiter({ windowMs, max }) }` → `{ check(key), reset() }`; `check` бросает `HttpError(429, ...)` при превышении.
  Маршрут получает необязательное поле `rateLimit: "auth"`.

- [ ] **Step 1: Написать падающий тест**

Create `test/unit/rate-limit.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { createRateLimiter } = require("../../src/http/rate-limit");
const { HttpError } = require("../../src/http/io");

test("пропускает попытки в пределах лимита", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  limiter.check("1.2.3.4");
  limiter.check("1.2.3.4");
  assert.doesNotThrow(() => limiter.check("1.2.3.4"));
});

test("на превышении бросает 429", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
  limiter.check("1.2.3.4");
  limiter.check("1.2.3.4");

  assert.throws(
    () => limiter.check("1.2.3.4"),
    (err) => err instanceof HttpError && err.status === 429
  );
});

test("считает каждый ключ отдельно", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  limiter.check("1.1.1.1");
  assert.doesNotThrow(() => limiter.check("2.2.2.2"));
});

test("окно истекает и счётчик сбрасывается", () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, clock: () => now });
  limiter.check("1.2.3.4");
  assert.throws(() => limiter.check("1.2.3.4"));

  now = 1001;
  assert.doesNotThrow(() => limiter.check("1.2.3.4"));
});

test("пустой ключ не блокирует всех разом", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.doesNotThrow(() => limiter.check(null));
  assert.doesNotThrow(() => limiter.check(null));
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
node --test test/unit/rate-limit.test.js
```

Ожидаемо: FAIL, `Cannot find module '../../src/http/rate-limit'`.

- [ ] **Step 3: Написать ограничитель**

Счётчик живёт в памяти процесса и обнуляется при рестарте — для одного процесса под pm2 этого достаточно. Пустой ключ пропускается: иначе один запрос без определимого адреса заблокировал бы вход всем.

Create `src/http/rate-limit.js`:

```js
const { HttpError } = require("./io");

function createRateLimiter({ windowMs, max, clock = Date.now }) {
  const hits = new Map();

  function prune(now) {
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((time) => now - time < windowMs);
      if (fresh.length) {
        hits.set(key, fresh);
      } else {
        hits.delete(key);
      }
    }
  }

  return {
    check(key) {
      if (!key) return;
      const now = clock();
      if (hits.size > 1000) prune(now);

      const timestamps = (hits.get(key) || []).filter((time) => now - time < windowMs);
      if (timestamps.length >= max) {
        throw new HttpError(429, "Too many attempts. Try again later.");
      }
      timestamps.push(now);
      hits.set(key, timestamps);
    },
    reset() {
      hits.clear();
    }
  };
}

module.exports = { createRateLimiter };
```

- [ ] **Step 4: Подключить ограничитель к роутеру**

В `src/http/router.js` добавить импорты рядом с существующими:

```js
const { createRateLimiter } = require("./rate-limit");
const { LOGIN_RATE_LIMIT } = require("../config");
```

Создать общий ограничитель сразу после импортов:

```js
const authLimiter = createRateLimiter(LOGIN_RATE_LIMIT);

function clientKey(req) {
  return req.socket?.remoteAddress || null;
}
```

И в `runRoute`, первой строкой внутри `runner(async (client) => {`:

```js
      if (route.rateLimit === "auth") authLimiter.check(clientKey(req));
```

За обратным прокси `remoteAddress` — это адрес прокси. Разбор `X-Forwarded-For` не добавляется намеренно: доверять этому заголовку без явной настройки доверенных прокси опаснее, чем не ограничивать вовсе.

- [ ] **Step 5: Пометить маршруты аутентификации**

В `src/api/routes.js` добавить `rateLimit: "auth"` к четырём маршрутам:

```js
  { method: "POST", path: "/api/register", handler: auth.register, auth: "none", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/setup-admin", handler: auth.setupAdmin, auth: "none", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/login", handler: auth.login, auth: "none", tx: true, rateLimit: "auth" },
```

и

```js
  {
    method: "POST",
    path: "/api/admin/users/:id/reset-password",
    handler: admin.resetPassword,
    auth: "admin",
    tx: true,
    rateLimit: "auth"
  },
```

- [ ] **Step 6: Написать скрипт импорта legacy-данных**

Create `scripts/import-json-db.js`:

```js
#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { ROOT, requireDatabaseUrl } = require("../src/config");
const { getPool, closePool, withTransaction } = require("../src/db/pool");
const { migrate } = require("../src/db/migrate");

const DB_PATH = process.argv[2] || path.join(ROOT, "data", "db.json");

async function main() {
  requireDatabaseUrl();

  if (!fs.existsSync(DB_PATH)) {
    console.error(`No JSON database at ${DB_PATH}`);
    process.exit(1);
  }

  await migrate(getPool());

  const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  const idMap = new Map();

  await withTransaction(async (client) => {
    const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM users");
    if (rows[0].count > 0) {
      throw new Error("Target database already has users. Import aborted.");
    }

    for (const user of data.users || []) {
      const { rows: inserted } = await client.query(
        `INSERT INTO users
           (name, name_key, password_hash, avatar_data, register_nickname,
            telegram_contact, challenge_credits, rating, is_admin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
         RETURNING id`,
        [
          user.name,
          String(user.name || "").toLowerCase(),
          user.passwordHash,
          user.avatarData || null,
          user.registerNickname || null,
          user.telegramContact || null,
          JSON.stringify(user.challengeCredits || []),
          user.rating,
          Boolean(user.isAdmin),
          user.createdAt || new Date().toISOString(),
          user.updatedAt || null
        ]
      );
      idMap.set(user.id, inserted[0].id);
    }

    const challengeMap = new Map();
    for (const challenge of data.challenges || []) {
      const from = idMap.get(challenge.fromUserId);
      const to = idMap.get(challenge.toUserId);
      if (!from || !to) continue;

      const { rows: inserted } = await client.query(
        `INSERT INTO challenges (from_user_id, to_user_id, status, share_token, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          from,
          to,
          challenge.status,
          challenge.shareToken || null,
          challenge.createdAt || new Date().toISOString(),
          challenge.updatedAt || null
        ]
      );
      challengeMap.set(challenge.id, inserted[0].id);
    }

    for (const game of data.games || []) {
      const playerIds = (game.playerIds || []).map((id) => idMap.get(id)).filter(Boolean);
      if (playerIds.length !== (game.playerIds || []).length) continue;

      const { rows: inserted } = await client.query(
        `INSERT INTO games
           (challenge_id, player_ids, status, created_at, submitted_by,
            submitted_at, pending_result, result, elo)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
         RETURNING id`,
        [
          challengeMap.get(game.challengeId) || null,
          playerIds,
          game.status,
          game.createdAt || new Date().toISOString(),
          idMap.get(game.submittedBy) || null,
          game.submittedAt || null,
          game.pendingResult ? JSON.stringify(game.pendingResult) : null,
          game.result ? JSON.stringify(game.result) : null,
          game.elo ? JSON.stringify(game.elo) : null
        ]
      );
      if (game.challengeId && challengeMap.has(game.challengeId)) {
        await client.query("UPDATE challenges SET game_id = $2 WHERE id = $1", [
          challengeMap.get(game.challengeId),
          inserted[0].id
        ]);
      }
    }

    for (const item of data.feedback || []) {
      await client.query(
        `INSERT INTO feedback
           (user_id, screen, description, status, resolved_by, resolved_at, updated_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          idMap.get(item.userId) || null,
          item.screen,
          item.description,
          item.status || "open",
          idMap.get(item.resolvedBy) || null,
          item.resolvedAt || null,
          item.updatedAt || null,
          item.createdAt || new Date().toISOString()
        ]
      );
    }
  });

  console.log(`Imported ${idMap.size} users from ${DB_PATH}`);
  await closePool();
}

main().catch(async (err) => {
  console.error(err.message);
  await closePool();
  process.exit(1);
});
```

Идентификаторы не переносятся: их выдаёт последовательность, а ссылки между сущностями пересчитываются через `idMap`. Это устраняет A2 и для импортированных данных.

- [ ] **Step 7: Запустить тесты**

```bash
npm test
```

Ожидаемо: все зелёные, включая `test/unit/rate-limit.test.js` (`pass 5`).

- [ ] **Step 8: Проверить ограничитель вручную**

При запущенном сервере:

```bash
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " -X POST http://127.0.0.1:3000/api/login -H 'content-type: application/json' -d '{"name":"nobody","password":"wrong"}'; done; echo
```

Ожидаемо: десять раз `401`, затем `429 429`.

- [ ] **Step 9: Обновить документацию**

В `README.md` заменить раздел про PostgreSQL и запуск:

```markdown
## Run

PostgreSQL is required. Without `DATABASE_URL` the server refuses to start.

```powershell
docker compose up -d
npm start
```

After the server starts, open `http://127.0.0.1:3000`.

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```env
DB_PASSWORD=your_password
DB_PORT=5432
DATABASE_URL=postgres://tgtv:your_password@localhost:5432/tgtv_tournament
PORT=3000
```

Set `DB_PORT` to something else if port 5432 is already taken on your machine,
and keep `DATABASE_URL` in sync with it.

For managed PostgreSQL services that require SSL, set `PGSSL=true`.
In production, set `NODE_ENV=production` so the session cookie carries the
`Secure` flag, or set `COOKIE_SECURE=true` explicitly.

The schema is created and upgraded automatically by versioned migrations on
startup. Applied versions are recorded in the `schema_migrations` table.

## Tests

Tests need a separate database:

```powershell
docker compose exec postgres createdb -U tgtv tgtv_tournament_test
npm test
```

`npm run test:unit` runs the tests that need no database.

## Migrating from JSON storage

Earlier versions fell back to `data/db.json`. That fallback is gone. To move
existing JSON data into PostgreSQL, run once:

```powershell
node scripts/import-json-db.js
```
```

Также удалить из README устаревшее упоминание `Data is stored in data/db.json` в конце раздела Features.

- [ ] **Step 10: Обновить CHANGELOG**

Дописать в раздел `## Unreleased` в `CHANGELOG.md`:

```markdown
- Rebuilt the backend into focused modules: HTTP layer, domain rules, and SQL repositories.
- Replaced whole-database read-modify-write with transactional per-row SQL, fixing lost updates when two players acted at the same time.
- Moved to versioned database migrations recorded in `schema_migrations`.
- Removed the JSON storage fallback; PostgreSQL is now required. Use `scripts/import-json-db.js` to migrate existing JSON data.
- Unified Kill Team names into one canonical registry and migrated stored results and challenge credits.
- Stopped returning Telegram contacts and register nicknames to anonymous callers on the leaderboard.
- Added security headers, the `Secure` cookie flag in production, and rate limiting on sign-in and registration.
- Player search now returns an empty list instead of a 404 when nothing matches.
- Administrators can no longer record a result for a cancelled game.
- Added unit and integration test suites; run them with `npm test`.
```

- [ ] **Step 11: Дописать `.env.example`**

```env
# Set to true in production so the session cookie carries the Secure flag.
# Defaults to true when NODE_ENV=production.
# COOKIE_SECURE=true
```

- [ ] **Step 12: Финальная проверка**

```bash
npm test && npm start
```

Пройдите вручную полный сценарий: регистрация, вход, поиск игрока, челлендж, принятие, сохранение результата, подтверждение вторым игроком, лидерборд, challenge-трек, админ-панель, обратная связь. Убедитесь, что размер ответа `/api/games` уменьшился — в нём больше нет `challengeCredits`.

- [ ] **Step 13: Commit**

```bash
git add src/http/rate-limit.js src/http/router.js src/api/routes.js scripts/ README.md CHANGELOG.md .env.example test/unit/rate-limit.test.js
git commit -m "feat: add sign-in rate limiting, JSON import script, and refreshed docs"
```

---

## Итоговое соответствие спеке

| Пункт ревью | Задача |
|---|---|
| A1 — потерянные обновления при чтении-и-перезаписи всей БД | 11, 12, 17, 19 |
| A2 — идентификаторы выдаёт приложение | 11, 21 |
| A3 — запись на каждом чтении | 11, 14 |
| B1 — утечка контактов через `/api/users` | 15, 19 |
| B2 — нет флага `Secure` | 2, 14 |
| B3 — нет лимита попыток, синхронный scrypt | 8, 21 |
| B4 — обход проверки пути в статике | 4 |
| B5 — нет security-заголовков | 3 |
| C1 — любая ошибка отдаётся как 400 | 3, 5 |
| C2 — нет логирования | 4, 5 |
| C3 — двойная запись ответа | 3 |
| D1 — админ завершает отменённую игру | 18 |
| D2 — частично применённый патч теряется | 18 |
| D3 — два словаря названий Kill Team | 7, 20 |
| D4 — раздутые ответы | 13 |
| D5 — 404 на пустой поиск | 15 |
| D6 — мёртвый код | 9, 10 |
| D7 — миграции без версий | 6 |
| E1 — монолитный `server.js` | 2–19 |
| E2 — 625-строчная функция роутинга | 5, 19 |
| E3 — дублирование словарей во фронте | вне объёма работ (решение зафиксировано в спеке) |
| E4 — нет тестов | 1 и далее в каждой задаче |
