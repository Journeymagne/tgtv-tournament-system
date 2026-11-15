#!/usr/bin/env python3
"""Initialize an isolated Umami installation; keep secrets only on the host."""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path('/app/ktcompanion-analytics')
ROOT.mkdir(mode=0o755, parents=True, exist_ok=True)
os.umask(0o077)
env = ROOT / '.env'
if not env.exists():
    image = subprocess.check_output([
        'docker', 'image', 'inspect', 'docker.umami.is/umami-software/umami:latest',
        '--format', '{{index .RepoDigests 0}}',
    ], text=True).strip()
    if '@sha256:' not in image:
        raise RuntimeError('Expected a digest-pinned Umami image')
    env.write_text('\n'.join([
        'UMAMI_IMAGE=' + image,
        'UMAMI_DB_PASSWORD=' + secrets.token_hex(32),
        'UMAMI_APP_SECRET=' + secrets.token_hex(32),
        'UMAMI_2FA_KEY=' + secrets.token_hex(32),
        '',
    ]))
subprocess.run(['docker', 'compose', 'up', '-d'], cwd=ROOT, check=True)

def api(path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request('http://127.0.0.1:3010/api/' + path,
                                    data=json.dumps(data).encode() if data is not None else None,
                                    headers=headers)
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)

for attempt in range(90):
    try:
        api('heartbeat')
        break
    except (OSError, ValueError):
        time.sleep(2)
else:
    raise RuntimeError('Umami did not become ready')

credentials = ROOT / 'admin.json'
if credentials.exists():
    account = json.loads(credentials.read_text())
else:
    account = {'username': 'admin', 'password': secrets.token_urlsafe(30)}
    # Save before the API mutation so an interrupted setup can be resumed.
    credentials.write_text(json.dumps(account) + '\n')
try:
    login = api('auth/login', account)
except urllib.error.HTTPError as error:
    if error.code not in (400, 401):
        raise
    login = api('auth/login', {'username': 'admin', 'password': 'umami'})
    api('me/password', {'currentPassword': 'umami', 'newPassword': account['password']}, login['token'])
    login = api('auth/login', account)
token = login['token']
websites = api('websites', token=token)
websites = websites.get('data', []) if isinstance(websites, dict) else websites
website = next((site for site in websites if site['domain'] == 'ktcompanion.ru'), None)
if not website:
    website = api('websites', {'name': 'KT Companion', 'domain': 'ktcompanion.ru'}, token)
website_id = website['id']
if not re.fullmatch(r'[0-9a-fA-F-]{36}', website_id):
    raise RuntimeError('Unexpected website ID')
(ROOT / 'website-id').write_text(website_id + '\n')

# Include only in the application's location / block. Disable upstream
# compression so sub_filter sees HTML; Nginx may compress the final response.
injection = (
    'proxy_set_header Accept-Encoding $kt_analytics_accept_encoding;\n'
    'sub_filter_once on;\n'
    'sub_filter \'</head>\' \'<script defer src="/telemetry/bootstrap.js" '
    'data-website-id="' + website_id + '"></script></head>\';\n'
)
(ROOT / 'nginx-injection.conf').write_text(injection)
os.chmod(ROOT / 'nginx-injection.conf', 0o644)
print('Umami ready; default password replaced; website created. Secrets remain on the host.')
