# European domain

`killteamcompanion.com` and `www.killteamcompanion.com` point to the European
nginx edge at `45.155.7.206`. It forwards HTTPS to `193.19.118.183`, validating
the existing `ktcompanion.ru` origin certificate. The application and PostgreSQL
remain on the original host. This provides a second ingress path, not regional
failover: the edge depends on origin availability and the inter-region link.

## Application

Configure the external production environment before deploying this release:

```env
COMPANION_ORIGIN=https://ktcompanion.ru
COMPANION_ALIASES=https://killteamcompanion.com
SITE_URL=https://ktcompanion.ru
COOKIE_SECURE=true
TRUST_PROXY=true
```

Aliases are explicit full origins, comma- or whitespace-separated. They retain
their navigation, token email links, API origin checks and TTS export URLs.
Unknown page hosts still redirect to the primary origin. Session cookies remain
host-only: the same account works on both domains, with a separate login on each.
The European `www` host redirects to the European apex at nginx.

## Origin nginx

Preserve the current HTTPS site, analytics includes, certificate and upload
limits. Add `killteamcompanion.com` to that HTTPS block's `server_name` and:

```nginx
set_real_ip_from 45.155.7.206;
real_ip_header X-Real-IP;
```

The edge overwrites client IP headers. Only its source IP is trusted by the
origin. Continue sending `$remote_addr` as the sole `X-Forwarded-For` value to
Node, so the existing single-proxy trust model is preserved. Never trust a
client-supplied forwarding header from all networks. Keep the Node listener on
loopback and do not expose PostgreSQL to the edge.

## Edge nginx and HTTPS

Use `deploy/nginx-europe.conf.example` on AlmaLinux. First serve ACME challenges
on port 80 from `/var/www/letsencrypt`. After both DNS A records resolve to the
edge, obtain a certificate using Certbot's webroot authenticator, install the
HTTPS config, and enable `certbot-renew.timer`. Add a successful-renewal hook
that reloads nginx. Check `nginx -t` before each reload. Use a protected backup
of each existing config before editing it.

Do not cache authenticated responses. Preserve the 100 MB upload allowance and
120-second upstream timeout. The edge verifies the origin certificate even
though its HTTP Host is the European domain.

## Verification and recovery

Check both public domains, redirects, `/health/ready`, `/api/me`, navigation,
Combat Lab and origin rejection. Before DNS propagation, `curl --resolve` can
test the edge with the intended hostname. Verify email flows in CI against the
dedicated test database; never send test email to production users.

Monitor from both regions. Test renewal using `certbot renew --dry-run`.
If rollout fails, restore the previous nginx config and external environment,
then redeploy the previous application release through the deployment wrapper.
There are no database migrations in this change. Reverting edge DNS alone does
not affect the Russian site. Restrict any temporary bootstrap HTTP service to
ACME challenges and a maintenance response until HTTPS is ready.
