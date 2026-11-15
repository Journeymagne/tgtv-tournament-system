# Переезд VM — команды (Ubuntu 26.04, root)

Выполнять на **новой** машине под `root`, по порядку.
Старую VM пока не трогать.

Пути как в `update_tgtv-ts.sh`:
- репозиторий: `/app/Repos/tgtv-tournament-system`
- рантайм: `/app/tgtv-ts`
- env: `/app/tgtv-ts.env`
- pm2: `tgtv-app`

---

## Этап 1 — подготовка новой VM

### 1.1 Базовые пакеты

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg git ufw nginx certbot python3-certbot-nginx rsync
```

### 1.2 Фаервол

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
```

Postgres (5432) наружу не открывать.

### 1.3 Docker (Engine + Compose plugin)

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
docker --version
docker compose version
```

### 1.4 Node.js 22 + pm2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
npm -v

npm install -g pm2
pm2 -v
```

Автозапуск pm2 после ребута (после первого `pm2 start` / `pm2 save`):

```bash
pm2 startup systemd -u root --hp /root
# команда из вывода pm2 уже будет выполнена выше; позже после первого деплоя:
# pm2 save
```

### 1.5 GitHub CLI (`gh`) — авторизация и клон

#### Установка `gh`

```bash
(type -p wget >/dev/null || apt install -y wget)
mkdir -p -m 755 /etc/apt/keyrings
wget -nv -O /tmp/githubcli-archive-keyring.gpg https://cli.github.com/packages/githubcli-archive-keyring.gpg
cat /tmp/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
apt update
apt install -y gh
gh --version
```

#### Логин (интерактивно на сервере)

HTTPS + браузер (на экране будет код; открыть ссылку с любого устройства):

```bash
gh auth login -h github.com -p https -w
```

Либо токеном (Personal Access Token с правом `repo` для приватного репо):

```bash
# создать токен: https://github.com/settings/tokens
# scopes: repo (и read:org, если репо в организации)
gh auth login -h github.com -p https --with-token
# вставить токен, Enter, затем Ctrl+D
```

Проверка и привязка git к `gh` (чтобы `git pull` / `update_tgtv-ts.sh` не спрашивали пароль):

```bash
gh auth status
gh auth setup-git
```

#### Каталоги и клон

```bash
# Важно: НЕ создавай /app/tgtv-ts вручную — пустая папка ломает первый деплой
# (скрипт считает её «legacy release» без recoverable .env).
mkdir -p /app/Repos
cd /app/Repos
gh repo clone Journeymagne/tgtv-tournament-system tgtv-tournament-system
cd /app/Repos/tgtv-tournament-system
git checkout main
git pull --ff-only origin main
```

### 1.6 Postgres через Docker Compose

Пока без боевого пароля можно поставить временный; перед cutover подставишь тот же, что на старой (или новый — тогда `DATABASE_URL` тоже обновить).

```bash
cd /app/Repos/tgtv-tournament-system
cp .env.example /app/tgtv-ts.env
nano /app/tgtv-ts.env
```

Минимум в `/app/tgtv-ts.env` на этом этапе:

```env
PORT=3000
DB_PORT=5432
DB_PASSWORD=<тот_же_или_новый_пароль>
DATABASE_URL=postgres://tgtv:<тот_же_или_новый_пароль>@127.0.0.1:5432/tgtv_tournament
SITE_URL=https://ktcompanion.ru
COMPANION_ORIGIN=https://ktcompanion.ru
NODE_ENV=production
TRUST_PROXY=true
COOKIE_SECURE=true
```

Симлинк/копия для compose (compose читает `.env` из каталога репо):

```bash
cp /app/tgtv-ts.env /app/Repos/tgtv-tournament-system/.env
cd /app/Repos/tgtv-tournament-system
docker compose up -d
docker compose ps
docker compose exec postgres pg_isready -U tgtv -d tgtv_tournament
```

### 1.7 Nginx — перенос боевого конфига со старой VM

Нужен файл `/etc/nginx/sites-available/ktcompanion.ru` со **старой** машины (не пример из репо).
`rating-dev…` не переносим.

Полный HTTPS-конфиг ссылается на `/etc/letsencrypt/...` — до certbot на новой VM
его можно только **положить в запас**, не включать. Либо сначала HTTP-заглушка (ниже).

#### Вариант A — через твой ПК (PowerShell / WSL)

Подставь IP старой и новой:

```bash
# скачать со старой
scp root@OLD_IP:/etc/nginx/sites-available/ktcompanion.ru ./ktcompanion.ru.nginx

# залить на новую (пока в /root, не в sites-enabled)
scp ./ktcompanion.ru.nginx root@NEW_IP:/root/ktcompanion.ru.nginx
```

#### Вариант B — напрямую старая → новая (если есть SSH между ними)

На **старой**:

```bash
scp /etc/nginx/sites-available/ktcompanion.ru root@NEW_IP:/root/ktcompanion.ru.nginx
```

#### На новой — пока без сертов (HTTP-прокси)

```bash
# бэкап привезённого файла
cp /root/ktcompanion.ru.nginx /root/ktcompanion.ru.nginx.bak

# временный HTTP-only (серты появятся на этапе 2)
cat > /etc/nginx/sites-available/ktcompanion.ru <<'EOF'
server {
    listen 80;
    server_name ktcompanion.ru www.ktcompanion.ru rating.ktcompanion.ru;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/ktcompanion.ru /etc/nginx/sites-enabled/ktcompanion.ru
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

#### На этапе 2 (после DNS + certbot) — поставить боевой конфиг

```bash
# после: certbot --nginx -d ktcompanion.ru -d www.ktcompanion.ru -d rating.ktcompanion.ru
# (имена как в SAN на старом серте; иначе только те, что реально в DNS)

cp /root/ktcompanion.ru.nginx /etc/nginx/sites-available/ktcompanion.ru
nginx -t && systemctl reload nginx
```

Если `nginx -t` ругается на пути сертов — сначала certbot, потом снова `cp` боевого файла.

### 1.8 Проверка стека (ещё без прод-дампа)

Перед первым деплоем `/app/tgtv-ts` **не должно** существовать (или это должен быть уже рабочий релиз с `.env`). Если раньше создали пустую папку:

```bash
# только если это пустой каталог, не симлинк и не живой релиз
ls -la /app/tgtv-ts
rmdir /app/tgtv-ts   # упадёт, если внутри есть файлы — тогда разберись вручную
```

Также нужны `tar` и `flock` (обычно уже есть; если deploy ругнётся — доустанови):

```bash
apt install -y tar util-linux
```

```bash
# env уже должен лежать тут (шаг 1.6)
test -f /app/tgtv-ts.env && echo "env ok"
cd /app/Repos/tgtv-tournament-system
bash update_tgtv-ts.sh production
pm2 status
pm2 logs tgtv-app --lines 50
curl -sI http://127.0.0.1:3000/ | head
# nginx (1.7) ещё можно не поднимать — проверка через :3000 достаточна
```

Ожидаемо: приложение поднимается на пустой БД (миграции сами). Это нормально до переноса дампа.

Если снова ошибка `Previous release has no recoverable environment` — смотри `ls -la /app/tgtv-ts*` и убери пустой legacy-каталог `/app/tgtv-ts`.

### 1.9 Чеклист этапа 1

```bash
docker --version
node -v   # v22.x
pm2 -v
nginx -v
ufw status
docker compose -f /app/Repos/tgtv-tournament-system/docker-compose.yml ps
pm2 status
ss -tlnp | grep -E ':80|:443|:3000|:5432'
```

---

## Этап 2 — один инстанс: стоп старой → tmp → потом основной домен

**Два приложения одновременно нельзя.** Порядок:

1. На новой заранее: nginx+certbot для `tmp`, env на tmp (app можно пока
   оставить на пустой БД или уже стопнуть — до restore не важно).
2. На старой: **сразу** `pm2 stop tgtv-app` → дамп → scp.
3. На новой: restore → `update_tgtv-ts.sh` → сайт только на
   `https://tmp.ktcompanion.ru`.
4. `ktcompanion.ru` в это время недоступен (старый app выключен, DNS ещё
   на старую), пока не переключишь A-запись и env/nginx на основной домен.

`COMPANION_ORIGIN` обязан совпадать с хостом в браузере.

Проверка DNS tmp:

```bash
dig +short tmp.ktcompanion.ru
# ожидается: 193.19.118.183
```

### 2.1 На новой — nginx + certbot для tmp (до гашения старой)

```bash
cat > /etc/nginx/sites-available/tmp.ktcompanion.ru <<'EOF'
server {
    listen 80;
    server_name tmp.ktcompanion.ru;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/tmp.ktcompanion.ru /etc/nginx/sites-enabled/tmp.ktcompanion.ru
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d tmp.ktcompanion.ru
```

### 2.2 Env на tmp

```bash
nano /app/tgtv-ts.env
```

```env
SITE_URL=https://tmp.ktcompanion.ru
COMPANION_ORIGIN=https://tmp.ktcompanion.ru
```

Пока **не** обязательно гонять полный `update_tgtv-ts.sh` — сделаешь после restore.
Можно заранее:

```bash
cp /app/tgtv-ts.env /app/Repos/tgtv-tournament-system/.env
```

### 2.3 На старой — стоп + дамп (с этого момента прод лежит)

```bash
pm2 stop tgtv-app
pm2 status

cd /app/Repos/tgtv-tournament-system   # путь к compose на старой
docker compose exec -T postgres pg_dump -U tgtv -d tgtv_tournament -Fc -f /tmp/tgtv.dump
docker compose cp postgres:/tmp/tgtv.dump /root/tgtv.dump
ls -lh /root/tgtv.dump
```

Перенос:

```bash
scp root@OLD_IP:/root/tgtv.dump root@NEW_IP:/root/tgtv.dump
```

Postgres на старой можно оставить запущенным (только дамп); app не поднимать.

### 2.4 На новой — restore + единственный инстанс

```bash
# Деплойер не принимает stopped-процесс: либо online, либо удалить из pm2.
pm2 delete tgtv-app 2>/dev/null || true
cd /app/Repos/tgtv-tournament-system

docker compose cp /root/tgtv.dump postgres:/tmp/tgtv.dump
docker compose exec -T postgres dropdb -U tgtv --if-exists tgtv_tournament
docker compose exec -T postgres createdb -U tgtv tgtv_tournament
docker compose exec -T postgres pg_restore -U tgtv -d tgtv_tournament --no-owner --role=tgtv /tmp/tgtv.dump

# env уже с tmp-origin:
cp /app/tgtv-ts.env /app/Repos/tgtv-tournament-system/.env
bash update_tgtv-ts.sh production
pm2 status
curl -sI https://tmp.ktcompanion.ru/ | head
```

Если после `pm2 stop` снова видишь `Existing PM2 process must be online before deployment`:

```bash
pm2 delete tgtv-app
bash update_tgtv-ts.sh production
```

Проверь в браузере `https://tmp.ktcompanion.ru`: логин, турнир, Studio.
Пользователям пока дай ссылку на tmp (основной домен мёртв до DNS).

### 2.5 Когда DNS `ktcompanion.ru` → новая VM

1. В `/app/tgtv-ts.env`:
   ```env
   SITE_URL=https://ktcompanion.ru
   COMPANION_ORIGIN=https://ktcompanion.ru
   ```
2. Certbot + боевой nginx (`/root/ktcompanion.ru.nginx` или
   `certbot --nginx -d ktcompanion.ru -d www.ktcompanion.ru` и rating при необходимости).
3. `bash update_tgtv-ts.sh production`
4. `curl -sI https://ktcompanion.ru/ | head`
5. Старую VM не удалять 1–2 дня; app на ней не поднимать.

---

## Полезные команды на новой VM

```bash
# логи приложения
pm2 logs tgtv-app

# рестарт после правок env
nano /app/tgtv-ts.env
cp /app/tgtv-ts.env /app/tgtv-ts/.env
cp /app/tgtv-ts.env /app/Repos/tgtv-tournament-system/.env
pm2 restart tgtv-app --update-env

# логи postgres
cd /app/Repos/tgtv-tournament-system && docker compose logs -f postgres

# деплой с git
cd /app/Repos/tgtv-tournament-system && bash update_tgtv-ts.sh production
```
