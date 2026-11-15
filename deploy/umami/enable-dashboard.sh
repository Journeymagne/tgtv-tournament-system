#!/usr/bin/env bash
set -euo pipefail
ROOT=/app/ktcompanion-analytics
DOMAIN=stats.ktcompanion.ru
python3 - <<'PY'
import socket
try:
    addresses = {r[4][0] for r in socket.getaddrinfo('stats.ktcompanion.ru', 80, family=socket.AF_INET)}
except socket.gaierror:
    raise SystemExit('DNS pending: add stats A 193.19.118.183, then rerun enable-dashboard.sh')
if addresses != {'193.19.118.183'}:
    raise SystemExit('DNS does not point exclusively to this host; refusing certificate setup')
PY
SITE=/etc/nginx/sites-available/ktcompanion-analytics
LINK=/etc/nginx/sites-enabled/ktcompanion-analytics
if [[ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    if [[ -e "$SITE" ]] && ! grep -qF '# KT Companion Umami ACME bootstrap' "$SITE"; then
        echo 'A dashboard site already exists; inspect it before continuing' >&2
        exit 1
    fi
    install -d -m 755 "$ROOT/acme"
    cat > "$SITE" <<'NGINX'
# KT Companion Umami ACME bootstrap
server {
    listen 80;
    server_name stats.ktcompanion.ru;
    location /.well-known/acme-challenge/ { root /app/ktcompanion-analytics/acme; }
    location / { return 404; }
}
NGINX
    if [[ ! -e "$LINK" ]]; then ln -s "$SITE" "$LINK"; fi
    nginx -t
    systemctl reload nginx
    # Keep the temporary ACME site if issuance fails so it can be inspected.
    certbot certonly --webroot -w "$ROOT/acme" -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --deploy-hook 'systemctl reload nginx'
fi
install -m 644 "$ROOT/nginx-dashboard.conf" "$SITE"
if [[ ! -e "$LINK" ]]; then ln -s "$SITE" "$LINK"; fi
nginx -t
systemctl reload nginx
echo 'Dashboard ready: https://stats.ktcompanion.ru'
