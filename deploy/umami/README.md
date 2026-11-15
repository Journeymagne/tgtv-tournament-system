# KT Companion analytics

Umami is independent of application releases and the game database. Nginx adds
one deferred bootstrap script to HTML returned by every service, including the
Combat Lab build and server-rendered tournament pages. History navigation is
tracked by Umami. Query strings and fragments are excluded, including from
referrers. No account identifiers, replays or automatic error capture are enabled.
Browser blocking and privacy preferences can reduce measured visitor counts.

## Install on the production host

Copy this directory's files to `/app/ktcompanion-analytics` (public JS readable by
Nginx). Pull the official image, then initialize:

```sh
docker pull docker.umami.is/umami-software/umami:latest
python3 /app/ktcompanion-analytics/setup.py
```

Setup records the image digest in `.env`, generates independent database and
application secrets, replaces the default admin password, creates the website,
and generates `nginx-injection.conf`. `.env` and `admin.json` are mode 600 and
must never be committed, served by Nginx, or printed in deployment logs.

Run `python3 /app/ktcompanion-analytics/enable-nginx.py` to back up the existing
site, install `nginx-map.conf` in `/etc/nginx/conf.d/ktcompanion-analytics.conf`,
add the following includes, validate, and reload. Alternatively, install the
map and add the includes manually. Inside the HTTPS server:

```nginx
include /app/ktcompanion-analytics/nginx-locations.conf;
```

Inside its existing application `location /` add:

```nginx
include /app/ktcompanion-analytics/nginx-injection.conf;
```

Run `nginx -t` before `systemctl reload nginx`. The exact public endpoints are
`/telemetry/bootstrap.js`, `/telemetry/script.js`, `/telemetry/api/send`; they
do not forward application cookies. All other `/telemetry/` paths return 404.
The existing same-origin Content Security Policy is sufficient.

## Dashboard

Point the `stats.ktcompanion.ru` A record to `193.19.118.183`. Once DNS resolves,
run `bash /app/ktcompanion-analytics/enable-dashboard.sh` to issue the TLS
certificate using Certbot and install `nginx-dashboard.conf` as a separate
enabled Nginx site. Dashboard: https://stats.ktcompanion.ru . Umami's
login protects reports; the random admin credentials are in
`/app/ktcompanion-analytics/admin.json`. Enable 2FA in the account settings.

Until DNS is configured, use `ssh -N -L 3010:127.0.0.1:3010 tgtv-server` and open
http://localhost:3010 . The Docker port is bound only to loopback.

Use the date selector and Pages report for overall and per-section traffic.
Custom business events require separate instrumentation; this installation
collects pageviews and navigation, not every button click.

## Operations

```sh
cd /app/ktcompanion-analytics
docker compose ps
docker compose logs --tail 50 umami
docker compose exec -T db pg_dump -U umami umami > /secure-backup/umami.sql
```

Include the analytics dump and protected `.env` in the host backup schedule.
The analytics database uses the `ktcompanion-analytics_umami-data` volume.
An unavailable Umami does not block the website. To disable collection, remove
the two includes and reload Nginx after validation. Keep the volume for history.
Upgrade deliberately by changing the pinned image digest after a database backup.

## Direct ACME renewal on this host

The host's default OpenSSL 3.5 ClientHello stalls on the direct route to Let's
Encrypt. A smaller ClientHello using X25519 succeeds, including with TLS 1.3.
`configure-certbot-tls.py` generates `/etc/letsencrypt/openssl-certbot.cnf` from
the system configuration, sets `Groups = X25519:prime256v1:secp384r1`, and adds
`/etc/systemd/system/certbot.service.d/tls-compatibility.conf`. Only Certbot's
systemd service receives `OPENSSL_CONF`; the site's TLS policy is unchanged.
The enabled `certbot.timer` invokes this service. No proxy or tunnel is used.

For a manual renewal check, use the same environment:

```sh
OPENSSL_CONF=/etc/letsencrypt/openssl-certbot.cnf certbot renew \
  --cert-name stats.ktcompanion.ru --dry-run --run-deploy-hooks
```

This direct renewal simulation and the normal Certbot service both succeeded
on 30 October 2026. Regenerate the dedicated config after reviewing future
changes to the system OpenSSL configuration. To revert, remove only the
`tls-compatibility.conf` override and run `systemctl daemon-reload`.

## Private traffic boards

`setup-boards.py` creates three admin-only boards and fills an empty personal
dashboard: section popularity, pages within sections, and sources/devices.
The tracker tags each pageview with its section. Setup backs up the analytics
database and prior board configurations, then labels previously untagged
pageviews without changing their URLs, timestamps or session IDs. The ranking
counts distinct Umami visitors per section; one visitor may use several sections.
No public sharing links are created. Existing personal dashboards are preserved.
