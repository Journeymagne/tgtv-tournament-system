#!/usr/bin/env python3
"""Enable same-origin collection in the existing production Nginx site."""
from datetime import datetime, timezone
from pathlib import Path
import shutil
import subprocess

root = Path('/app/ktcompanion-analytics')
site = Path('/etc/nginx/sites-enabled/ktcompanion.ru').resolve(strict=True)
source = site.read_text()
mapping = Path('/etc/nginx/conf.d/ktcompanion-analytics.conf')
mapping_source = (root / 'nginx-map.conf').read_text()
if mapping.exists() and mapping.read_text() != mapping_source:
    raise RuntimeError('A different analytics map already exists; inspect before replacing')
mapping.write_text(mapping_source)
mapping.chmod(0o644)
locations = 'include /app/ktcompanion-analytics/nginx-locations.conf;'
injection = 'include /app/ktcompanion-analytics/nginx-injection.conf;'
if locations in source and injection in source:
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    print('Nginx collection already configured')
    raise SystemExit(0)
if locations in source or injection in source:
    raise RuntimeError('Partial configuration: inspect the site before continuing')
needle = 'location / {\n'
if source.count(needle) != 1 or 'proxy_pass http://127.0.0.1:3000;' not in source:
    raise RuntimeError('Unexpected application site; refusing to edit it')
backup = root / ('nginx-before-umami-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.conf')
shutil.copy2(site, backup)
updated = source.replace(needle, locations + '\n\n    ' + needle + '        ' + injection + '\n', 1)
site.write_text(updated)
try:
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
except BaseException:
    shutil.copy2(backup, site)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    raise
print('Collection enabled; backup: ' + str(backup))
