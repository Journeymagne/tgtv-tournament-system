# Отдельный процесс Telegram

В production бот работает в Нидерландах, а турнирные API и общая PostgreSQL —
на российском сервере. Европейский HTTPS-домен проксирует сайт и Mini App.
Перенос обработчика не создаёт копию аккаунтов или отдельную базу.

`scripts/start-telegram-worker.js` запускает только Telegram polling и доставку
из существующей очереди. HTTP, миграции, почта и другие обработчики турниров
не запускаются. PostgreSQL-роль должна быть `kt_tournaments`; владелец базы
для этого процесса не используется.

На API-сервере:

```env
TELEGRAM_MODE=polling
TELEGRAM_ADMIN_ONLY=false
TELEGRAM_WORKER_ENABLED=false
TELEGRAM_SITE_URL=https://killteamcompanion.com
TELEGRAM_MINI_APP_URL=https://killteamcompanion.com/miniapp
```

`SITE_URL` сайта менять не требуется. Привязка Telegram и выдача сессий Mini App
продолжают работать при `TELEGRAM_WORKER_ENABLED=false`. Значение по умолчанию
`true` сохраняет работу существующих односерверных установок.

На европейском сервере:

```env
NODE_ENV=production
TGTV_ENV_LOADED=1
SERVICE_NAME=tournaments
SITE_URL=https://killteamcompanion.com
TELEGRAM_MINI_APP_URL=https://killteamcompanion.com/miniapp
TELEGRAM_MODE=polling
TELEGRAM_ADMIN_ONLY=false
TELEGRAM_WORKER_ENABLED=true
TELEGRAM_TUNNEL_PORT=0
PGSSL=false
DB_POOL_SIZE=3
```

Токен существующего бота, его username и `DATABASE_URL` передаются отдельно
через защищённый `EnvironmentFile`. Пароли других сервисов и почты не нужны.
PostgreSQL доступен через постоянный SSH-forward с локального `127.0.0.1:25432`
на `127.0.0.1:5432` российского сервера. Туннель шифрует соединение; порт БД
не открывается в интернет. SSH-ключ разрешает только этот forward, с адреса
европейского сервера и без интерактивного входа.

## Порядок переключения

1. Подготовить релиз того же проверенного CI-коммита на обоих серверах.
2. Запустить туннель. Под пользователем worker выполнить `node
   scripts/start-telegram-worker.js --check` с его окружением: проверяются
   роль/схема БД и идентичность бота, без polling и отправки сообщений.
3. Сохранить конфигурацию и предыдущий релиз. Развернуть API-сервер с выключенным
   локальным Telegram worker; убедиться, что прежний poller остановлен.
4. Активировать европейский релиз и запустить `kt-telegram-worker.service`.
   Проверить единственную PostgreSQL-блокировку poller, процесс и журналы.
5. Выполнить `telegram:setup` с европейским окружением после публикации Mini App.
   Скрипт обновляет меню и команды, сохраняя ожидающие Telegram updates.
6. Проверить оба домена, недоступность личных данных без входа и публичный
   Changelog на русском и английском. Ссылки из ранее отправленных сообщений
   остаются рабочими на российском домене.

Worker и туннель запускаются systemd от отдельного пользователя без shell.
Релизы: `/app/kt-telegram/releases/<commit>`, текущий — `/app/kt-telegram/current`.
Конфигурация: `/etc/kt-telegram/worker.env`, читается только root/service manager.
Проверка: `systemctl status kt-telegram-worker kt-telegram-db-tunnel`.
Для журналов: `journalctl -u kt-telegram-worker` (не выводить секреты окружения).

## Возврат

Сначала остановить европейский worker, затем вернуть `TELEGRAM_WORKER_ENABLED=true`
на российском API-сервере и перезапустить его турнирный процесс с обновлённым
окружением. Не включать одновременно доставку на двух хостах. База и очередь
остаются общими; сообщения и привязки не удалять, `drop_pending_updates` не включать.
При смене версии одновременно обновлять оба хоста, проверяя совместимость схемы.
