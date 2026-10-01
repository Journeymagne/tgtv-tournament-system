# Подключение почты KT Companion на сервере

Обновлено 1 октября 2026 года; основной почтовый релиз 5.1.0 и обновление оформления 5.1.1.
Пути, Node.js, Nginx и Docker PostgreSQL проверены через SSH. Приложение
и PM2 работают от root; пользователь SSH требует пароль для sudo.
Команды предназначены для выполнения человеком на Linux-сервере, кроме явно
отмеченной команды Windows PowerShell. При ошибке этапа устраните её до перехода
к следующему.

**Обновление оформления до 5.1.1**

Для установленной 5.1.0 используйте `deploy/email-design-production.sh`.
Рядом положите неизменённый `deploy/email-production-env.cjs` и Git bundle
с проверенным коммитом. Новые почтовые ключи и env-фрагмент не нужны.

~~~bash
sudo bash email-design-production.sh FULL_COMMIT_SHA email-design-5.1.1.bundle
~~~

Установщик проверяет чистый main, соответствие PM2 и базы, отсутствие новых
миграций и зависимостей. Сохраняет PostgreSQL, приложение и env в закрытый
`/app/backups/email-design-YYYYmmdd-HHMMSS`, устанавливает точный коммит и
перезапускает приложение. Оба env-файла сохраняются без изменений. При ошибке
пытается восстановить прежний код и чистый Git HEAD; базу не откатывает,
поскольку новых миграций нет. В конце проверяет доступность сайта, включённую
почту и публичную страницу с ресурсами 5.1.1.

После установки проверить логотип и обе темы на `/account-email.html`,
состояния подтверждения и восстановления, затем одно настоящее тестовое письмо.
Webhook Resend уже включён и проверен при установке 5.1.0.

**0. Подготовить релиз — обязательное условие**

Перед запуском убедиться, что подготовленный релиз 5.1.0 опубликован
в origin/main и известен его полный SHA. Проверки выполняются при слиянии
на отдельной тестовой БД. На production автоматические тесты проекта
запускать нельзя: тестовые помощники очищают БД.

Обычный git pull до публикации релиза не установит почтовый модуль.
В рабочей копии есть и другие изменения, поэтому не следует использовать
git add . без предварительного разбора.

В Resend уже подготовлены:

- домен auth.ktcompanion.ru, статус Verified на момент настройки;
- ключ KT Companion auth production, Sending access для этого домена;
- webhook https://ktcompanion.ru/api/email/webhook, включён и проверен 1 октября 2026;
- секрет webhook и ключ шифрования очереди.

Файл с реальными значениями на Windows:

    X:\Vibecoding\Thunderground Tournament System\Tournament System Project\work\resend-auth.production.env

Он исключён из Git и содержит только почтовые настройки. Не заменяйте им
весь рабочий серверный .env: там находятся настройки БД и других функций.

**Подготовленный сценарий для проверенного production**

Вместо ручных шагов 2–7 можно использовать `deploy/email-production.sh` и
`deploy/email-production-env.cjs`. Рядом с ними разместить Git bundle с релизом
и закрытый фрагмент Resend. Запускать под владельцем root-процесса PM2:

~~~bash
sudo bash email-production.sh FULL_COMMIT_SHA release.bundle resend-auth.production.env
~~~

Сценарий проверяет чистоту production-репозитория, точный коммит, процесс PM2
и существующее подключение БД; сохраняет код, env и PostgreSQL в `/app/backups`.
Затем устанавливает релиз с выключенной почтой, проверяет миграцию и API,
включает отправку и проверяет отказ неподписанному webhook. При ошибке после
изменений пытается выключить почту и перезапустить приложение; это не является
автоматическим восстановлением кода или всей БД.

Подтверждена схема с одним Nginx перед `127.0.0.1:3000`, дописывающим адрес
клиента в X-Forwarded-For. Для неё сценарий выставляет COOKIE_SECURE=true
и TRUST_PROXY=true. На другой инфраструктуре сначала пересмотреть эти настройки.
Рабочий каталог `work` сохраняется при синхронизации. Пароли и API-ключи
передаются через закрытые файлы, а не через аргументы команд или вывод.
Включение webhook и проверка настоящей доставки остаются отдельными шагами 8–9.

**1. Подключиться к серверу и проверить окружение**

В терминале:

~~~bash
ssh LOGIN@SERVER_IP
whoami
node --version
pm2 list
pm2 describe tgtv-app
ls -ld /app/Repos/tgtv-tournament-system /app/tgtv-ts
test -f /app/tgtv-ts.env && echo "Production env exists"
~~~

LOGIN и SERVER_IP заменить фактическими значениями. Команды PM2 выполнять
под тем же пользователем, под которым уже работает сайт. Если список пуст,
сначала проверить пользователя и PM2_HOME; не создавать второй экземпляр сайта.

Ожидается Node.js версии не ниже 22, процесс tgtv-app, script path
/app/tgtv-ts/server.js и рабочая директория /app/tgtv-ts.

| Назначение | Значение по deploy-скрипту |
| --- | --- |
| Git-репозиторий | /app/Repos/tgtv-tournament-system |
| Рабочее приложение | /app/tgtv-ts |
| Основной файл окружения | /app/tgtv-ts.env |
| Копия окружения приложения | /app/tgtv-ts/.env |
| PM2-процесс | tgtv-app |
| Ветка production | main |

Если фактические значения отличаются, адаптировать последующие команды.
Не запускать production-команды против staging.

**2. Убедиться, что новый код уже опубликован**

~~~bash
cd /app/Repos/tgtv-tournament-system
git status --short
git fetch origin
git log -1 --oneline origin/main
git cat-file -e origin/main:src/api/email.js
git cat-file -e origin/main:src/db/migrations/042_email_accounts.js
git cat-file -e origin/main:public/account-email.html
~~~

Три последние команды должны завершиться успешно без вывода.
Это проверка наличия файлов, а не замена проверки состава и тестирования релиза.
Если Git сообщает об отсутствии файла, почтовой версии ещё нет в main.
Если status показывает изменения на сервере, сначала сохранить и разобрать их.

**3. Сохранить настройки, код и базу данных**

Команды выполнять в одной SSH-сессии, чтобы сохранилась переменная каталога копии.

~~~bash
umask 077
KT_EMAIL_BACKUP="$HOME/ktcompanion-backups/email-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$KT_EMAIL_BACKUP"
chmod 700 "$KT_EMAIL_BACKUP"
cp -p /app/tgtv-ts.env "$KT_EMAIL_BACKUP/tgtv-ts.env"
cp -p /app/tgtv-ts/.env "$KT_EMAIL_BACKUP/app.env"
tar --exclude='./node_modules' --exclude='./.git' \
  -czf "$KT_EMAIL_BACKUP/app-before-email.tar.gz" \
  -C /app/tgtv-ts .
git -C /app/Repos/tgtv-tournament-system rev-parse HEAD \
  > "$KT_EMAIL_BACKUP/repository-head.txt"
printf 'Backup directory: %s\n' "$KT_EMAIL_BACKUP"
~~~

Сохранить путь к копии. Архив и файлы окружения содержат закрытые данные.
Копии находятся вне /app/tgtv-ts и репозитория: deploy использует rsync --delete.

Сделать также backup именно той PostgreSQL, к которой подключён production.
Файл docker-compose.yml в репозитории описывает локальную конфигурацию и сам
по себе не доказывает, что production использует такой же контейнер.

Без вывода пароля можно посмотреть адрес БД из файла приложения:

~~~bash
cd /app/tgtv-ts
node <<'NODE'
const cfg = require("./src/config");
const u = new URL(cfg.requireDatabaseUrl());
console.log({
  host: u.hostname,
  port: u.port || "5432",
  database: decodeURIComponent(u.pathname.slice(1)),
  user: decodeURIComponent(u.username),
  sslFromConfig: cfg.PGSSL,
  sslmodeInUrl: u.searchParams.get("sslmode")
});
NODE
~~~

Если DATABASE_URL задаётся непосредственно в PM2, сверить выбранную БД
с действующими настройками развёртывания: отдельный node-процесс не наследует
окружение уже запущенного процесса PM2.

Вариант A — PostgreSQL в Docker на этом сервере:

~~~bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
~~~

После определения реальных CONTAINER, DB_USER и DB_NAME:

~~~bash
docker exec CONTAINER pg_dump -U DB_USER -d DB_NAME -Fc \
  > "$KT_EMAIL_BACKUP/database.dump"
test -s "$KT_EMAIL_BACKUP/database.dump"
docker exec -i CONTAINER pg_restore --list \
  < "$KT_EMAIL_BACKUP/database.dump" \
  > "$KT_EMAIL_BACKUP/database-contents.txt"
~~~

Использовать этот вариант, только если подключение внутри контейнера настроено.
Ошибка авторизации — повод использовать штатный способ резервного копирования,
а не ослаблять аутентификацию PostgreSQL.

Вариант B — доступная по сети PostgreSQL и установленный pg_dump:

~~~bash
pg_dump -h DB_HOST -p DB_PORT -U DB_USER -d DB_NAME \
  -W -Fc -f "$KT_EMAIL_BACKUP/database.dump"
pg_restore --list "$KT_EMAIL_BACKUP/database.dump" \
  > "$KT_EMAIL_BACKUP/database-contents.txt"
~~~

Заменить DB_* реальными значениями; пароль вводить по приглашению.
Для удалённой БД сохранить требования провайдера к TLS: например,
PGSSLMODE=require перед командой, если именно этот режим используется.
Для verify-full также нужны сертификаты. Версия pg_dump должна быть совместима
с сервером; клиент старее major-версии сервера не подходит.

Вариант C — управляемая БД: создать и дождаться завершения snapshot/backup
в панели хостинга. Зафиксировать идентификатор и порядок восстановления.

Проверка pg_restore --list проверяет чтение каталога архива; полная проверка
восстановления выполняется отдельно на временной БД.

**4. Перенести подготовленные секреты**

На своём компьютере, в Windows PowerShell:

~~~powershell
scp "X:\Vibecoding\Thunderground Tournament System\Tournament System Project\work\resend-auth.production.env" "LOGIN@SERVER_IP:resend-auth.production.env"
~~~

На Linux-сервере:

~~~bash
chmod 600 "$HOME/resend-auth.production.env"
nano "$HOME/resend-auth.production.env"
~~~

Файл открывается для чтения и переноса значений. Не отправлять его содержимое
в Git, чат, скриншоты или публичный каталог сайта. Не выполнять source этого
файла: dotenv с EMAIL_FROM не является shell-скриптом.

**5. Добавить почтовые переменные в основной env**

~~~bash
nano /app/tgtv-ts.env
~~~

Перенести семь переменных из загруженного файла, сохранив все существующие
настройки БД, порта, авторизации и сайта. Для существующего ключа заменить
строку; не оставлять несколько активных строк с одинаковым именем.

Первый запуск — с выключенной отправкой:

~~~dotenv
EMAIL_PROVIDER=disabled
SITE_URL=https://ktcompanion.ru
EMAIL_FROM=KT Companion <account@auth.ktcompanion.ru>
EMAIL_REPLY_TO=
RESEND_API_KEY=<значение из подготовленного файла>
RESEND_WEBHOOK_SECRET=<значение из подготовленного файла>
EMAIL_OUTBOX_KEY=<значение из подготовленного файла>
~~~

Три строки со скобками — пояснения: на сервере должны стоять реальные значения.
EMAIL_REPLY_TO можно оставить пустым. Если заполнять — существующим ящиком,
который действительно читается.

Для HTTPS проверить COOKIE_SECURE=true. NODE_ENV=production задаёт deploy-скрипт.
SITE_URL должен быть адресом сайта без дополнительного пути.
TRUST_PROXY=true допустим только для проверенной схемы с одним доверенным
reverse proxy; существующую настройку не менять вслепую.

В nano: Ctrl+O, Enter — сохранить; Ctrl+X — выйти.

Ограничить доступ к файлу, сохранив владельца, под которым выполняется deploy:

~~~bash
chmod 600 /app/tgtv-ts.env
~~~

Новый EMAIL_OUTBOX_KEY генерировать не нужно. Сохранить готовый ключ вместе
с защищёнными резервными копиями: им зашифрована очередь писем.

**6. Обновить приложение с выключенной отправкой**

Deploy останавливает сайт на время синхронизации и npm ci. Выбрать короткое
окно обслуживания.

~~~bash
cd /app/Repos/tgtv-tournament-system
EMAIL_PROVIDER=disabled NODE_ENV=production bash ./update_tgtv-ts.sh production
pm2 list
pm2 logs tgtv-app --lines 100 --nostream
~~~

Скрипт получает main, обновляет /app/tgtv-ts, устанавливает зависимости,
копирует /app/tgtv-ts.env в /app/tgtv-ts/.env и запускает PM2.

При старте приложение автоматически применяет миграции. Первый запуск новой
версии должен применить version 42, name email_accounts. Отдельной команды
npm run migrate для этого проекта нет.

Если скрипт завершился с ошибкой или процесс перезапускается, сначала устранить
ошибку. Не продолжать активацию почты.

~~~bash
curl -sS -o /dev/null -w '%{http_code}\n' https://ktcompanion.ru/
curl -sS https://ktcompanion.ru/api/me
curl -sS https://ktcompanion.ru/api/auth/email-config
~~~

Ожидается: главная HTTP 200, /api/me возвращает JSON с user:null без сессии,
email-config возвращает {"enabled":false}. Ответ 404 у email-config означает,
что запрос дошёл до старого приложения или неверного маршрута.

При необходимости проверить миграцию непосредственно через приложение
(только чтение; без вывода строк пользователей):

~~~bash
cd /app/tgtv-ts
node <<'NODE'
const { getPool, closePool } = require("./src/db/pool");
(async () => {
  const result = await getPool().query(
    "SELECT version, name, applied_at FROM schema_migrations WHERE version = 42"
  );
  console.table(result.rows);
  if (result.rowCount !== 1) process.exitCode = 1;
})().catch(() => {
  console.error("Migration check failed; inspect application logs");
  process.exitCode = 1;
}).finally(closePool);
NODE
~~~

**7. Проверить настройки и включить отправку**

Сначала проверка формата настроек — она не отправляет письмо и не проверяет
доступность Resend по сети:

~~~bash
cd /app/tgtv-ts
EMAIL_PROVIDER=resend NODE_ENV=production node -e \
  'const c = require("./src/email/config").configuration(); console.log({ provider: c.provider, enabled: c.enabled });'
~~~

Ожидается provider: resend, enabled: true. Если проверка упала, исправить
названную переменную в /app/tgtv-ts.env, повторно скопировать его в .env приложения
и повторить проверку. Значения секретов в вывод не попадают.

Затем открыть основной файл:

~~~bash
nano /app/tgtv-ts.env
~~~

Заменить единственную строку EMAIL_PROVIDER=disabled на EMAIL_PROVIDER=resend,
сохранить и выполнить:

~~~bash
cp /app/tgtv-ts.env /app/tgtv-ts/.env
chmod 600 /app/tgtv-ts/.env
EMAIL_PROVIDER=resend NODE_ENV=production pm2 restart tgtv-app --update-env
pm2 save
curl -sS https://ktcompanion.ru/api/auth/email-config
~~~

Ожидается {"enabled":true}. Явное значение EMAIL_PROVIDER и --update-env нужны,
чтобы PM2 не оставил прежнее значение disabled в окружении процесса.

Если ключи ранее задавались через PM2/ecosystem, а не .env, обновить тот источник:
уже заданные переменные процесса имеют приоритет над process.loadEnvFile.
Не выводить полный pm2 env/jlist для передачи в чат: там могут быть секреты.

Почтовый worker запускается внутри Node-приложения. Достаточно существующих
PM2 и PostgreSQL, исходящего HTTPS к api.resend.com:443 и входящего HTTPS
на сайт. Отдельные cron, Redis, SMTP-сервер и открытие портов 25/587 для этой
реализации не требуются.

**8. Проверить маршрут и включить подготовленный webhook**

На сервере:

~~~bash
timedatectl status
curl -i -X POST https://ktcompanion.ru/api/email/webhook \
  -H 'Content-Type: application/json' --data '{}'
~~~

Для этого намеренно неподписанного запроса ожидается HTTP 401 с ошибкой
Invalid webhook signature. Это проверяет маршрут и отклонение неверной подписи,
но не подтверждает успешный приём настоящего события Resend.
GET этого адреса не подходит для проверки.

Открыть в браузере уже созданный webhook:

https://resend.com/webhooks/333a73b9-3fd5-476e-8aaa-477e1929f96b

Проверить URL https://ktcompanion.ru/api/email/webhook и включить endpoint,
переведя Disabled в Enabled. Второй endpoint создавать не нужно.

События: email.sent, email.delivered, email.delivery_delayed, email.failed,
email.bounced, email.complained, email.suppressed.

Домен проверить здесь:

https://resend.com/domains/4154fcfe-2301-48b1-9c93-c153c036515b

Он должен оставаться Verified. Шаблоны писем уже находятся в коде.
Ключ API уже создан:

https://resend.com/api-keys/816f2a23-ef43-4a45-a098-b9f1dab83951

Существующий reverse proxy должен пропускать POST /api/email/webhook к тому же
Node-приложению, без браузерной авторизации/CAPTCHA, с исходным телом и заголовками
svix-id, svix-timestamp, svix-signature. При обычном проксировании всего /api
новый отдельный location обычно не нужен.

Приложение допускает отклонение времени webhook не более 5 минут. Проверить
синхронизацию часов ОС. Подпись зависит от исходного тела запроса:
https://resend.com/docs/webhooks/verify-webhooks-requests

**9. Проверить реальную доставку на своём адресе**

Использовать свой тестовый аккаунт и принадлежащий вам почтовый ящик.

1. Войти в существующий аккаунт и открыть https://ktcompanion.ru/account-email.html.
2. Добавить email, ввести текущий пароль, запросить подтверждение.
3. Дождаться письма от account@auth.ktcompanion.ru.
4. Открыть ссылку и нажать кнопку подтверждения. Само открытие ссылки адрес
   не подтверждает. Срок ссылки — 24 часа.
5. Убедиться, что профиль показывает подтверждённую почту.
6. Выйти, выбрать «Забыли пароль?», указать подтверждённый email.
7. Открыть письмо, задать новый пароль в течение 30 минут.
8. Проверить вход новым паролем, отказ старого пароля и завершение старых сессий.
9. Проверить получение уведомления об изменении пароля.
10. В Resend проверить письмо, событие email.delivered и webhook-ответ HTTP 200.
    Sent означает приём запроса отправки; delivered — приём сервером получателя,
    а не прочтение письма.

Состояние приложения под владельцем платформы:

https://ktcompanion.ru/account-email.html#admin

Там проверить provider resend, очередь и ошибки. Обычный администратор может
получить 403: экран предназначен для SuperAdmin.

Включение EMAIL_PROVIDER=resend сразу включает почту для всего сайта:
новые регистрации требуют email. Старые аккаунты сохраняют вход по имени
и паролю; привязка email доступна из профиля. Поэтапного включения по аккаунтам
в первой реализации нет.

**10. Разобрать возможные ошибки**

| Симптом | Что проверить |
| --- | --- |
| email-config: 404 | Наличие релиза, script path PM2, правильный upstream reverse proxy |
| email-config: enabled=false | Основной env, копию .env, EMAIL_PROVIDER в PM2 и --update-env |
| Сайт 502 или PM2 постоянно перезапускается | Логи tgtv-app, конфигурацию, соединение с БД, миграцию |
| Функции почты возвращают 503 | Включён ли EMAIL_PROVIDER=resend |
| Неподписанный curl webhook: 401 | Ожидаемый результат проверки |
| Настоящее событие Resend: 401 | Секрет именно этого webhook, часы сервера, исходное тело и заголовки |
| Настоящее событие Resend: 404 | Старый код или другой upstream |
| Очередь pending/processing долго не убывает | Доступ к api.resend.com:443, работа worker, логи и Resend |
| Ошибка Resend 401/403 | API key, права Sending access и разрешённый домен отправителя |
| Delivered, письма не видно | Спам/правила почтового ящика; delivered не означает попадание во входящие |
| Частые запросы дают 429 или нового письма нет | Лимиты: повтор ссылки не чаще раза в минуту, до пяти в час |
| Почта не приходит после bounce/complaint | Причина блокировки в приложении и Resend; разбирать до повторной отправки |
| Экран состояния даёт 403 | Требуется роль владельца платформы |

**11. Выключить почту при проблеме**

В /app/tgtv-ts.env заменить EMAIL_PROVIDER=resend на EMAIL_PROVIDER=disabled:

~~~bash
nano /app/tgtv-ts.env
cp /app/tgtv-ts.env /app/tgtv-ts/.env
chmod 600 /app/tgtv-ts/.env
EMAIL_PROVIDER=disabled NODE_ENV=production pm2 restart tgtv-app --update-env
pm2 save
curl -sS https://ktcompanion.ru/api/auth/email-config
~~~

Ожидается {"enabled":false}. Обычный вход остаётся; отправка приостанавливается.
Если сервис отключается надолго, временно отключить и webhook в Resend.

Выключение почты не отменяет уже выполненные подтверждения/изменения пароля.
Накопленные задания остаются в БД и после включения могут отправиться,
если ещё действительны. Сохранить прежний EMAIL_OUTBOX_KEY.

Миграцию 042 и таблицы для такого выключения удалять не нужно.
Восстановление полной БД — отдельная аварийная операция: оно может потерять
изменения пользователей после создания копии и для обычного выключения
почты не требуется.

Если неисправен сам релиз, восстановить предыдущий проверенный релиз через
обычный процесс развёртывания. Архив app-before-email.tar.gz и файлы окружения
из шага 3 сохраняют исходное состояние приложения для разбора. Не запускать
удаление таблиц или безусловную распаковку поверх живого сайта.

**12. После успешной проверки**

Убедиться, что PM2 сохранил процесс, сайт и /api/me доступны, email-config=true,
подтверждение и восстановление прошли, настоящее событие Resend принято с 200.

Переместить загруженный фрагмент из домашнего каталога в защищённую копию:

~~~bash
mv "$HOME/resend-auth.production.env" "$KT_EMAIL_BACKUP/resend-auth.production.env"
chmod 600 "$KT_EMAIL_BACKUP/resend-auth.production.env"
cp /app/tgtv-ts.env "$KT_EMAIL_BACKUP/tgtv-ts.email-enabled.env"
chmod 600 "$KT_EMAIL_BACKUP/tgtv-ts.email-enabled.env"
~~~

Если SSH-сессия менялась, сначала восстановить KT_EMAIL_BACKUP на записанный
путь из шага 3. Настроить регулярные резервные копии PostgreSQL и защищённое
хранение ключа очереди.

Этот релиз включает почту аккаунта: подтверждение, восстановление пароля
и уведомления о смене пароля/адреса. Рассылки о турнирах, парингах, результатах
и напоминания относятся к следующему этапу.

Официальные справочники:
- PM2, обновление окружения: https://pm2.keymetrics.io/docs/usage/process-management/
- PostgreSQL pg_dump: https://www.postgresql.org/docs/current/app-pgdump.html
- Resend, подписи webhook: https://resend.com/docs/webhooks/verify-webhooks-requests
